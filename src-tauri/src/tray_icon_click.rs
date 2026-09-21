//! 让收进托盘的程序自己把主窗口拿出来：模拟点一下它的托盘图标。
//!
//! 程序把窗口收进托盘时是在自己代码里 hide 的，框架层（Chromium、Qt……）记着"我是隐藏的"，
//! 渲染合成器也停了。外部 `ShowWindow` 只能让 Win32 层可见：画面停在隐藏前的最后一帧
//! （常常正是关闭按钮悬停态的红色），点击也不重绘。只有走程序自己的"托盘图标被点击"逻辑，
//! 状态才会完整恢复。这对任何框架都成立，所以这里走系统层面的通用路径：
//! 用 `Shell_NotifyIconGetRect` 定位图标，再用 UI Automation 按下那个按钮，
//! 等价于用户亲手点击；图标收在"隐藏的图标"溢出区时先展开溢出区再点。
//! 实测微信（Qt 自定义托盘）与 QQ（Electron，图标在溢出区）都能被唤起。
//!
//! 认得托盘回调消息的框架（Electron）直接投递回调，不用展开溢出区，少一次闪动。

use std::time::{Duration, Instant};

use windows::core::{w, Interface, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT, RPC_E_CHANGED_MODE, WPARAM};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationInvokePattern, TreeScope_Descendants,
    UIA_InvokePatternId,
};
use windows::Win32::UI::HiDpi::{
    SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::Shell::{Shell_NotifyIconGetRect, NOTIFYICONIDENTIFIER};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, PostMessageW, WM_APP, WM_LBUTTONDOWN, WM_LBUTTONUP,
};

use crate::poll::wait_until;

/// 探测托盘图标 ID 的上限：程序通常只注册一两个图标，ID 从 0 或 1 起。
const MAX_PROBED_ICON_ID: u32 = 16;
/// 直接投递回调消息后等程序自己显示窗口的时间。
const CALLBACK_SETTLE_TIMEOUT: Duration = Duration::from_millis(400);
/// UI Automation 点击后等程序显示窗口的总时限（含展开溢出区）。
const REVEAL_TIMEOUT: Duration = Duration::from_millis(1800);
const POLL_INTERVAL: Duration = Duration::from_millis(20);
/// 图标位置比对容差（像素）：`Shell_NotifyIconGetRect` 与 UIA 的矩形相差一两个像素。
const RECT_TOLERANCE: i32 = 4;

/// 已知托盘宿主窗口类及其注册的回调消息。
const KNOWN_TRAY_HOSTS: &[(&str, u32)] = &[
    // Electron / Chromium 的 status icon 宿主，回调消息固定为 WM_APP + 1。
    ("Electron_NotifyIconHostWindow", WM_APP + 1),
];

/// 任务栏与"隐藏的图标"溢出弹窗的窗口类（Windows 11 / Windows 10）。
const TASKBAR_CLASS: PCWSTR = w!("Shell_TrayWnd");
const OVERFLOW_CLASSES: &[PCWSTR] = &[
    w!("TopLevelWindowForOverflowXamlIsland"),
    w!("NotifyIconOverflowWindow"),
];

/// 一个可以被"点击"的托盘图标。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct TrayIcon {
    pub host: isize,
    pub id: u32,
    /// 认得宿主框架时的回调消息；`None` 就走 UI Automation。
    pub callback_message: Option<u32>,
}

/// 该窗口类是否是已知的托盘宿主，是则返回回调消息。
fn tray_callback_message(class_name: &str) -> Option<u32> {
    KNOWN_TRAY_HOSTS
        .iter()
        .find(|(class, _)| class.eq_ignore_ascii_case(class_name))
        .map(|(_, message)| *message)
}

/// 左键单击的按下/抬起两条回调（NOTIFYICON_VERSION 3 编码：wParam 是图标 ID，lParam 是鼠标消息）。
fn click_messages(icon_id: u32) -> [(WPARAM, LPARAM); 2] {
    [
        (WPARAM(icon_id as usize), LPARAM(WM_LBUTTONDOWN as isize)),
        (WPARAM(icon_id as usize), LPARAM(WM_LBUTTONUP as isize)),
    ]
}

fn rects_match(a: RECT, b: RECT) -> bool {
    (a.left - b.left).abs() <= RECT_TOLERANCE && (a.top - b.top).abs() <= RECT_TOLERANCE
}

fn rect_center(rect: RECT) -> POINT {
    POINT {
        x: (rect.left + rect.right) / 2,
        y: (rect.top + rect.bottom) / 2,
    }
}

unsafe fn icon_rect(host: HWND, id: u32) -> Option<RECT> {
    let identifier = NOTIFYICONIDENTIFIER {
        cbSize: std::mem::size_of::<NOTIFYICONIDENTIFIER>() as u32,
        hWnd: host,
        uID: id,
        ..Default::default()
    };
    Shell_NotifyIconGetRect(&identifier).ok()
}

/// 在任意窗口上找它注册的第一个托盘图标（任何框架都适用：只看 Shell 里有没有这条记录）。
pub(crate) unsafe fn find_tray_icon(host: HWND, class_name: &str) -> Option<TrayIcon> {
    (0..MAX_PROBED_ICON_ID)
        .find(|&id| icon_rect(host, id).is_some())
        .map(|id| TrayIcon {
            host: host.0 as isize,
            id,
            callback_message: tray_callback_message(class_name),
        })
}

struct ComApartment {
    should_uninitialize: bool,
}

impl ComApartment {
    unsafe fn enter() -> Option<Self> {
        let result = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if result == RPC_E_CHANGED_MODE {
            return Some(Self {
                should_uninitialize: false,
            });
        }
        result.is_ok().then_some(Self {
            should_uninitialize: true,
        })
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        if self.should_uninitialize {
            unsafe { CoUninitialize() };
        }
    }
}

/// 把当前线程临时切成 per-monitor DPI 感知，离开作用域时恢复。
///
/// `Shell_NotifyIconGetRect` 总是返回物理像素，而 UI Automation 的矩形按线程的 DPI 感知级别
/// 缩放；线程不感知 DPI 时两边坐标对不上（高分屏上差一倍），图标就永远匹配不到。
struct DpiAwarenessScope {
    previous: windows::Win32::UI::HiDpi::DPI_AWARENESS_CONTEXT,
}

impl DpiAwarenessScope {
    unsafe fn per_monitor() -> Self {
        Self {
            previous: SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2),
        }
    }
}

impl Drop for DpiAwarenessScope {
    fn drop(&mut self) {
        if !self.previous.0.is_null() {
            unsafe {
                SetThreadDpiAwarenessContext(self.previous);
            }
        }
    }
}

/// 在 `window` 的 UIA 子树里找位置与 `rect` 重合、且能被"按下"的元素。
unsafe fn find_button_at(
    automation: &IUIAutomation,
    window: HWND,
    rect: RECT,
) -> Option<IUIAutomationInvokePattern> {
    let root = automation.ElementFromHandle(window).ok()?;
    let condition = automation.CreateTrueCondition().ok()?;
    let elements = root.FindAll(TreeScope_Descendants, &condition).ok()?;
    let count = elements.Length().ok()?;
    (0..count)
        .filter_map(|index| elements.GetElement(index).ok())
        .filter(|element| {
            element
                .CurrentBoundingRectangle()
                .is_ok_and(|bounds| rects_match(bounds, rect))
        })
        .find_map(|element| {
            element
                .GetCurrentPattern(UIA_InvokePatternId)
                .ok()?
                .cast::<IUIAutomationInvokePattern>()
                .ok()
        })
}

unsafe fn find_window(class: PCWSTR) -> Option<HWND> {
    FindWindowW(class, PCWSTR::null())
        .ok()
        .filter(|hwnd| !hwnd.0.is_null())
}

/// 图标在溢出弹窗里：弹窗刚打开时图标还在动画，位置会变，要边刷新位置边找。
unsafe fn click_in_overflow(
    automation: &IUIAutomation,
    icon: &TrayIcon,
    deadline: Instant,
    revealed: &dyn Fn() -> bool,
) -> bool {
    let host = HWND(icon.host as *mut _);
    while Instant::now() < deadline {
        let Some(rect) = icon_rect(host, icon.id) else {
            std::thread::sleep(POLL_INTERVAL);
            continue;
        };
        let button = OVERFLOW_CLASSES
            .iter()
            .filter_map(|class| find_window(*class))
            .find_map(|overflow| find_button_at(automation, overflow, rect))
            .or_else(|| {
                automation
                    .ElementFromPoint(rect_center(rect))
                    .ok()?
                    .GetCurrentPattern(UIA_InvokePatternId)
                    .ok()?
                    .cast::<IUIAutomationInvokePattern>()
                    .ok()
            });
        if let Some(button) = button {
            if button.Invoke().is_err() {
                return false;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            return wait_until(revealed, remaining, POLL_INTERVAL);
        }
        std::thread::sleep(POLL_INTERVAL);
    }
    false
}

/// 用 UI Automation 点托盘图标。第一次按到的要么是图标本身，要么（图标收在溢出区时）
/// 是"显示隐藏的图标"按钮：按完后图标位置变了就说明溢出区展开了，再进弹窗里点图标。
unsafe fn click_via_automation(icon: &TrayIcon, revealed: &dyn Fn() -> bool) -> bool {
    let _dpi = DpiAwarenessScope::per_monitor();
    let Some(_apartment) = ComApartment::enter() else {
        return false;
    };
    let Ok(automation) =
        CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
    else {
        return false;
    };
    let host = HWND(icon.host as *mut _);
    let Some(first_rect) = icon_rect(host, icon.id) else {
        return false;
    };
    let Some(taskbar) = find_window(TASKBAR_CLASS) else {
        return false;
    };
    let Some(button) = find_button_at(&automation, taskbar, first_rect) else {
        return false;
    };
    if button.Invoke().is_err() {
        return false;
    }

    let deadline = Instant::now() + REVEAL_TIMEOUT;
    while Instant::now() < deadline {
        if revealed() {
            return true;
        }
        if icon_rect(host, icon.id).is_some_and(|rect| !rects_match(rect, first_rect)) {
            return click_in_overflow(&automation, icon, deadline, revealed);
        }
        std::thread::sleep(POLL_INTERVAL);
    }
    false
}

/// 点一下托盘图标并等程序自己把窗口显示出来（`revealed` 为真）。返回是否成功。
///
/// 只能在工作线程上调用：里面会阻塞等待，并且要初始化 COM。
pub(crate) fn reveal(icon: &TrayIcon, revealed: &dyn Fn() -> bool) -> bool {
    unsafe {
        if let Some(message) = icon.callback_message {
            let host = HWND(icon.host as *mut _);
            for (wparam, lparam) in click_messages(icon.id) {
                let _ = PostMessageW(Some(host), message, wparam, lparam);
            }
            if wait_until(revealed, CALLBACK_SETTLE_TIMEOUT, POLL_INTERVAL) {
                return true;
            }
        }
        click_via_automation(icon, revealed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_tray_hosts_get_a_callback_message() {
        assert_eq!(
            tray_callback_message("Electron_NotifyIconHostWindow"),
            Some(WM_APP + 1)
        );
        assert_eq!(
            tray_callback_message("electron_notifyiconhostwindow"),
            Some(WM_APP + 1)
        );
        // 微信的 Qt 自定义托盘窗口：认不出回调消息，走 UI Automation。
        assert_eq!(
            tray_callback_message("Qt51514WxTrayIconMessageWindowClass"),
            None
        );
        assert_eq!(tray_callback_message(""), None);
    }

    #[test]
    fn a_click_is_a_button_down_then_up_carrying_the_icon_id() {
        let [down, up] = click_messages(3);
        assert_eq!(down, (WPARAM(3), LPARAM(WM_LBUTTONDOWN as isize)));
        assert_eq!(up, (WPARAM(3), LPARAM(WM_LBUTTONUP as isize)));
    }

    fn rect(left: i32, top: i32, width: i32, height: i32) -> RECT {
        RECT {
            left,
            top,
            right: left + width,
            bottom: top + height,
        }
    }

    #[test]
    fn icon_rects_match_by_origin_within_a_few_pixels() {
        // Shell 报 3298,2130，UIA 报 3297,2130；任务栏上 48x72 与溢出区里 60x60 尺寸不同。
        assert!(rects_match(
            rect(3298, 2130, 48, 72),
            rect(3297, 2130, 60, 60)
        ));
        assert!(rects_match(
            rect(3423, 2088, 48, 72),
            rect(3423, 2088, 48, 72)
        ));
        // 溢出区展开后图标从任务栏移到了弹窗里。
        assert!(!rects_match(
            rect(3423, 2088, 48, 72),
            rect(3298, 2130, 60, 60)
        ));
        assert!(!rects_match(
            rect(3423, 2088, 48, 72),
            rect(3471, 2088, 48, 72)
        ));
    }

    #[test]
    fn rect_center_is_the_midpoint() {
        let center = rect_center(rect(100, 200, 48, 72));
        assert_eq!((center.x, center.y), (124, 236));
    }
}
