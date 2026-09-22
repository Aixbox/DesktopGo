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
//! 单击确认无效的图标（Spotify 只认双击）再注入一次真实鼠标双击，之后放弃。
//!
//! 溢出区弹出时图标有滑入动画：`Shell_NotifyIconGetRect` 立刻返回最终布局位置，而 UIA
//! 报的是动画中的当前位置，邻居图标滑过目标位置的一瞬间就会被误点。所以按下前必须等两边
//! 位置连续两次轮询都不变，并且用图标的提示文字（UIA Name）与程序名核对身份。

use std::time::{Duration, Instant};

use windows::core::{w, Interface, PCWSTR};
use windows::Win32::Foundation::{
    HWND, LPARAM, POINT, RECT, RPC_E_CHANGED_MODE, VARIANT_BOOL, WPARAM,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Variant::{VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_BOOL};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationInvokePattern,
    TreeScope_Descendants, UIA_InvokePatternId, UIA_IsInvokePatternAvailablePropertyId,
};
use windows::Win32::UI::HiDpi::{
    SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_VIRTUALDESK, MOUSEINPUT,
    MOUSE_EVENT_FLAGS,
};
use windows::Win32::UI::Shell::{Shell_NotifyIconGetRect, NOTIFYICONIDENTIFIER};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetCursorPos, GetSystemMetrics, PostMessageW, SM_CXVIRTUALSCREEN,
    SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, WM_APP, WM_LBUTTONDOWN,
    WM_LBUTTONUP,
};

use crate::poll::{wait_until, PhaseTimer};

/// 探测托盘图标 ID 的上限：程序通常只注册一两个图标，ID 从 0 或 1 起。
const MAX_PROBED_ICON_ID: u32 = 16;
/// 直接投递回调消息后等程序自己显示窗口的时间。
const CALLBACK_SETTLE_TIMEOUT: Duration = Duration::from_millis(400);
/// UI Automation 定位并按下图标的总时限（含展开溢出区、等图标动画停下）。
const LOCATE_TIMEOUT: Duration = Duration::from_millis(1000);
/// 按下图标后等程序显示窗口的时限：手点托盘图标窗口几百毫秒内就会出来，
/// 超过这个时间基本就是程序不响应单击（Spotify 只认双击），继续等没有意义。
const POST_CLICK_TIMEOUT: Duration = Duration::from_millis(500);
/// 已知要双击的程序：第一次按下只是为了展开溢出区，等它展开用不了多久。
const OVERFLOW_OPEN_PROBE_TIMEOUT: Duration = Duration::from_millis(150);
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
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TrayIcon {
    pub host: isize,
    pub id: u32,
    /// 认得宿主框架时的回调消息；`None` 就走 UI Automation。
    pub callback_message: Option<u32>,
    /// 程序名（exe 文件名主干，小写），用来和托盘图标的提示文字核对身份。
    pub app_name: String,
}

/// 该窗口类是否是已知的托盘宿主，是则返回回调消息。
fn tray_callback_message(class_name: &str) -> Option<u32> {
    KNOWN_TRAY_HOSTS
        .iter()
        .find(|(class, _)| class.eq_ignore_ascii_case(class_name))
        .map(|(_, message)| *message)
}

/// 从可执行文件路径取程序名主干（小写），如 `d:\spotify\spotify.exe` → `spotify`。
pub(crate) fn app_name_from_executable(executable_path: &str) -> String {
    std::path::Path::new(executable_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default()
        .to_lowercase()
}

/// 托盘图标的提示文字是否指向这个程序（提示文字通常含程序名，如 "Spotify Premium"）。
fn tooltip_names_app(tooltip: &str, app_name: &str) -> bool {
    !app_name.is_empty() && tooltip.to_lowercase().contains(app_name)
}

/// 在位置吻合的候选里挑要按的那个：提示文字对得上程序名的优先；对不上时
/// （微信的提示是「微信」，和 `wechat` 无关）只有唯一候选才敢按，多个就放弃。
fn pick_candidate_by_tooltip(tooltips: &[String], app_name: &str) -> Option<usize> {
    tooltips
        .iter()
        .position(|tooltip| tooltip_names_app(tooltip, app_name))
        .or_else(|| (tooltips.len() == 1).then_some(0))
}

/// 两次轮询（间隔一个 `POLL_INTERVAL`）里 Shell 与 UIA 报的位置都没变，说明动画停了。
fn positions_settled(previous: Option<(RECT, RECT)>, current: (RECT, RECT)) -> bool {
    previous == Some(current)
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

/// 虚拟桌面的范围（物理像素），用来把屏幕坐标换算成 `SendInput` 的绝对坐标。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct VirtualScreen {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

impl VirtualScreen {
    unsafe fn current() -> Self {
        Self {
            left: GetSystemMetrics(SM_XVIRTUALSCREEN),
            top: GetSystemMetrics(SM_YVIRTUALSCREEN),
            width: GetSystemMetrics(SM_CXVIRTUALSCREEN),
            height: GetSystemMetrics(SM_CYVIRTUALSCREEN),
        }
    }

    /// `MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK` 下坐标按 0..65535 归一到整个虚拟桌面。
    fn to_absolute(self, point: POINT) -> (i32, i32) {
        let scale = |value: i32, origin: i32, extent: i32| -> i32 {
            if extent <= 1 {
                return 0;
            }
            ((value - origin) as i64 * 65535 / (extent - 1) as i64) as i32
        };
        (
            scale(point.x, self.left, self.width),
            scale(point.y, self.top, self.height),
        )
    }
}

fn mouse_input(flags: MOUSE_EVENT_FLAGS, x: i32, y: i32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: x,
                dy: y,
                mouseData: 0,
                dwFlags: flags | MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

/// 一次双击的完整输入序列：移到图标上、按/抬两次、再把光标移回原处。
/// 全部放进同一批 `SendInput`，保证光标复位一定排在两次点击之后。
fn double_click_sequence(screen: VirtualScreen, target: POINT, restore_to: POINT) -> Vec<INPUT> {
    let (tx, ty) = screen.to_absolute(target);
    let (rx, ry) = screen.to_absolute(restore_to);
    vec![
        mouse_input(MOUSE_EVENT_FLAGS(0), tx, ty),
        mouse_input(MOUSEEVENTF_LEFTDOWN, tx, ty),
        mouse_input(MOUSEEVENTF_LEFTUP, tx, ty),
        mouse_input(MOUSEEVENTF_LEFTDOWN, tx, ty),
        mouse_input(MOUSEEVENTF_LEFTUP, tx, ty),
        mouse_input(MOUSE_EVENT_FLAGS(0), rx, ry),
    ]
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
pub(crate) unsafe fn find_tray_icon(
    host: HWND,
    class_name: &str,
    app_name: &str,
) -> Option<TrayIcon> {
    (0..MAX_PROBED_ICON_ID)
        .find(|&id| icon_rect(host, id).is_some())
        .map(|id| TrayIcon {
            host: host.0 as isize,
            id,
            callback_message: tray_callback_message(class_name),
            app_name: app_name.to_string(),
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

/// 一个位置与目标吻合、且能被"按下"的 UIA 元素。
struct ButtonCandidate {
    element: IUIAutomationElement,
    bounds: RECT,
    tooltip: String,
}

unsafe fn element_name(element: &IUIAutomationElement) -> String {
    element
        .CurrentName()
        .map(|name| name.to_string())
        .unwrap_or_default()
}

unsafe fn invoke_pattern(element: &IUIAutomationElement) -> Option<IUIAutomationInvokePattern> {
    element
        .GetCurrentPattern(UIA_InvokePatternId)
        .ok()?
        .cast::<IUIAutomationInvokePattern>()
        .ok()
}

/// 把元素包装成候选：位置要与 `rect` 吻合、要能被"按下"。
unsafe fn candidate_from(element: IUIAutomationElement, rect: RECT) -> Option<ButtonCandidate> {
    let bounds = element.CurrentBoundingRectangle().ok()?;
    if !rects_match(bounds, rect) || invoke_pattern(&element).is_none() {
        return None;
    }
    let tooltip = element_name(&element);
    Some(ButtonCandidate {
        element,
        bounds,
        tooltip,
    })
}

/// 坐标命中时最多向上找几层父元素：溢出面板里命中的常是图标的图片子元素或外层容器，
/// 真正可按的按钮在它上面一两层。
const HIT_TEST_ANCESTOR_DEPTH: usize = 3;

/// 快路径：按坐标做一次单点命中（几毫秒），命中的元素（或其近邻父元素）位置吻合、可按就用。
///
/// 这里不核对提示文字：Spotify 播放时把提示改成曲目名，按程序名永远对不上，只会把每次定位
/// 都逼进几百毫秒的慢路径。防止点到滑过来的邻居靠调用方的"位置连续两次不变"校验，
/// 而不是靠名字。
unsafe fn hit_test_button(automation: &IUIAutomation, rect: RECT) -> Option<ButtonCandidate> {
    let mut element = automation.ElementFromPoint(rect_center(rect)).ok()?;
    let walker = automation.ControlViewWalker().ok()?;
    for _ in 0..HIT_TEST_ANCESTOR_DEPTH {
        if let Some(candidate) = candidate_from(element.clone(), rect) {
            return Some(candidate);
        }
        element = walker.GetParentElement(&element).ok()?;
    }
    None
}

/// `VT_BOOL` 真值，UIA 属性条件用。`VARIANT` 在 windows crate 里是裸 union，只能手拼。
fn variant_true() -> VARIANT {
    VARIANT {
        Anonymous: VARIANT_0 {
            Anonymous: std::mem::ManuallyDrop::new(VARIANT_0_0 {
                vt: VT_BOOL,
                wReserved1: 0,
                wReserved2: 0,
                wReserved3: 0,
                Anonymous: VARIANT_0_0_0 {
                    boolVal: VARIANT_BOOL::from(true),
                },
            }),
        },
    }
}

/// 慢路径：在 `window` 的 UIA 子树里找所有位置与 `rect` 重合、且能被"按下"的元素。
/// 条件只取支持 Invoke 的元素，把任务栏 XAML 树里大量的容器/文本节点直接排除。
unsafe fn buttons_at(automation: &IUIAutomation, window: HWND, rect: RECT) -> Vec<ButtonCandidate> {
    let Some(root) = automation.ElementFromHandle(window).ok() else {
        return Vec::new();
    };
    let Some(condition) = automation
        .CreatePropertyCondition(UIA_IsInvokePatternAvailablePropertyId, &variant_true())
        .ok()
    else {
        return Vec::new();
    };
    let Some(elements) = root.FindAll(TreeScope_Descendants, &condition).ok() else {
        return Vec::new();
    };
    let count = elements.Length().unwrap_or(0);
    (0..count)
        .filter_map(|index| elements.GetElement(index).ok())
        .filter_map(|element| candidate_from(element, rect))
        .collect()
}

/// 从位置吻合的候选里按提示文字挑出属于该程序的那个。
fn pick_button(candidates: Vec<ButtonCandidate>, app_name: &str) -> Option<ButtonCandidate> {
    let tooltips: Vec<String> = candidates.iter().map(|c| c.tooltip.clone()).collect();
    let index = pick_candidate_by_tooltip(&tooltips, app_name)?;
    candidates.into_iter().nth(index)
}

/// 找目标图标的按钮：先单点命中，没命中再在各个 `windows` 里全树搜索（慢路径按提示文字挑）。
unsafe fn find_button_at(
    automation: &IUIAutomation,
    windows: impl IntoIterator<Item = HWND>,
    rect: RECT,
    app_name: &str,
) -> Option<ButtonCandidate> {
    hit_test_button(automation, rect).or_else(|| {
        windows
            .into_iter()
            .find_map(|window| pick_button(buttons_at(automation, window, rect), app_name))
    })
}

unsafe fn find_window(class: PCWSTR) -> Option<HWND> {
    FindWindowW(class, PCWSTR::null())
        .ok()
        .filter(|hwnd| !hwnd.0.is_null())
}

/// 窗口最终是怎么被唤起的。调用方据此记住"这个程序要双击"，下次直接双击。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RevealMethod {
    /// 直接投递托盘回调消息（Electron）。
    Callback,
    /// UI Automation 单击。
    Click,
    /// 注入真实鼠标双击。
    DoubleClick,
}

/// 一次托盘点击过程中到处都要带的东西。
struct ClickSession<'a> {
    icon: &'a TrayIcon,
    /// 上次已确认该程序只认双击：跳过单击及其空等，直接双击。
    prefer_double_click: bool,
    revealed: &'a dyn Fn() -> bool,
    timer: &'a mut PhaseTimer,
}

impl ClickSession<'_> {
    fn host(&self) -> HWND {
        HWND(self.icon.host as *mut _)
    }

    unsafe fn icon_rect(&self) -> Option<RECT> {
        icon_rect(self.host(), self.icon.id)
    }

    fn wait_reveal(&mut self, timeout: Duration, phase: &str) -> bool {
        let shown = wait_until(self.revealed, timeout, POLL_INTERVAL);
        self.timer
            .phase(&format!("{phase}{}", if shown { "" } else { "(timeout)" }));
        shown
    }

    /// 单击没反应时（Spotify 的托盘图标只认双击），在图标位置注入一次真实的鼠标双击。
    ///
    /// 这是整条链路里唯一会注入输入的地方，所以有三道保险：只在 UIA 单击已确认无效（或上次
    /// 已确认该程序要双击）后才走；点之前再确认定位到的那个元素仍在系统报的图标位置上
    /// （溢出区收起、或被菜单顶开时位置就对不上了）；光标复位与两次点击放在同一批输入里，
    /// 用户几乎察觉不到光标动过。
    unsafe fn double_click(&mut self, located: &ButtonCandidate) -> Option<RevealMethod> {
        let Some(rect) = self.icon_rect() else {
            self.timer.phase("dblclick_guard(no rect)");
            return None;
        };
        let still_there = located
            .element
            .CurrentBoundingRectangle()
            .is_ok_and(|bounds| rects_match(bounds, rect))
            && located
                .element
                .CurrentIsOffscreen()
                .is_ok_and(|offscreen| !offscreen.as_bool());
        if !still_there {
            self.timer.phase(&format!(
                "dblclick_guard(icon '{}' moved or hidden)",
                located.tooltip
            ));
            return None;
        }
        let mut cursor = POINT::default();
        GetCursorPos(&mut cursor).ok()?;
        let sequence = double_click_sequence(VirtualScreen::current(), rect_center(rect), cursor);
        let sent = SendInput(&sequence, std::mem::size_of::<INPUT>() as i32);
        self.timer.phase("dblclick");
        if sent as usize != sequence.len() {
            return None;
        }
        self.wait_reveal(POST_CLICK_TIMEOUT, "wait_reveal(dblclick)")
            .then_some(RevealMethod::DoubleClick)
    }

    /// 已定位到图标本身：按 `prefer_double_click` 决定先单击还是直接双击。
    unsafe fn press(&mut self, located: &ButtonCandidate, phase_prefix: &str) -> Option<RevealMethod> {
        if !self.prefer_double_click {
            invoke_pattern(&located.element)?.Invoke().ok()?;
            self.timer.phase(&format!("{phase_prefix}_invoke"));
            if self.wait_reveal(POST_CLICK_TIMEOUT, "wait_reveal") {
                return Some(RevealMethod::Click);
            }
        }
        self.double_click(located)
    }

    /// 图标在溢出弹窗里：弹窗刚打开时图标还在动画，位置会变，要边刷新位置边找，
    /// 并且等 Shell 与 UIA 两边报的位置连续两次都不变了才按。
    unsafe fn click_in_overflow(
        &mut self,
        automation: &IUIAutomation,
        deadline: Instant,
    ) -> Option<RevealMethod> {
        let mut previous: Option<(RECT, RECT)> = None;
        while Instant::now() < deadline {
            let Some(rect) = self.icon_rect() else {
                previous = None;
                std::thread::sleep(POLL_INTERVAL);
                continue;
            };
            let overflow_windows = OVERFLOW_CLASSES.iter().filter_map(|class| find_window(*class));
            let Some(button) =
                find_button_at(automation, overflow_windows, rect, &self.icon.app_name)
            else {
                previous = None;
                std::thread::sleep(POLL_INTERVAL);
                continue;
            };
            let current = (rect, button.bounds);
            if positions_settled(previous, current) {
                self.timer.phase("overflow_locate");
                return self.press(&button, "overflow");
            }
            previous = Some(current);
            std::thread::sleep(POLL_INTERVAL);
        }
        self.timer.phase("overflow_timeout");
        None
    }

    /// 用 UI Automation 点托盘图标。第一次按到的要么是图标本身，要么（图标收在溢出区时）
    /// 是"显示隐藏的图标"按钮：按完后图标位置变了就说明溢出区展开了，再进弹窗里点图标。
    ///
    /// 已知要双击的程序，第一次按下后只等很短时间看溢出区有没有展开，不再等整个单击超时。
    unsafe fn click_via_automation(&mut self) -> Option<RevealMethod> {
        let _dpi = DpiAwarenessScope::per_monitor();
        let _apartment = ComApartment::enter()?;
        let automation =
            CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                .ok()?;
        self.timer.phase("uia_init");
        let first_rect = self.icon_rect()?;
        let taskbar = find_window(TASKBAR_CLASS)?;
        let Some(button) = find_button_at(&automation, [taskbar], first_rect, &self.icon.app_name)
        else {
            self.timer.phase("taskbar_locate(miss)");
            return None;
        };
        // 任务栏上没有动画，但和溢出区一样再采样一次确认位置稳定，快路径不核对名字全靠这层保险。
        std::thread::sleep(POLL_INTERVAL);
        let stable = self.icon_rect() == Some(first_rect)
            && button
                .element
                .CurrentBoundingRectangle()
                .is_ok_and(|bounds| bounds == button.bounds);
        if !stable {
            self.timer.phase("taskbar_locate(unstable)");
            return None;
        }
        self.timer.phase("taskbar_locate");
        invoke_pattern(&button.element)?.Invoke().ok()?;
        self.timer.phase("taskbar_invoke");

        // 按下的要么是图标本身（等窗口出来），要么是"显示隐藏的图标"（等溢出区展开）。
        let deadline = Instant::now() + LOCATE_TIMEOUT;
        let probe = if self.prefer_double_click {
            OVERFLOW_OPEN_PROBE_TIMEOUT
        } else {
            POST_CLICK_TIMEOUT
        };
        let click_deadline = Instant::now() + probe;
        while Instant::now() < click_deadline {
            if (self.revealed)() {
                self.timer.phase("wait_reveal");
                return Some(RevealMethod::Click);
            }
            if self
                .icon_rect()
                .is_some_and(|rect| !rects_match(rect, first_rect))
            {
                self.timer.phase("overflow_open");
                return self.click_in_overflow(&automation, deadline);
            }
            std::thread::sleep(POLL_INTERVAL);
        }
        // 图标就在任务栏上、单击也没反应：换双击。
        self.timer.phase("wait_reveal(timeout)");
        self.double_click(&button)
    }

    /// 认得回调消息的框架（Electron）：直接投递单击回调，不用碰任务栏。
    unsafe fn post_callback(&mut self) -> Option<RevealMethod> {
        let message = self.icon.callback_message?;
        for (wparam, lparam) in click_messages(self.icon.id) {
            let _ = PostMessageW(Some(self.host()), message, wparam, lparam);
        }
        self.wait_reveal(CALLBACK_SETTLE_TIMEOUT, "callback_reveal")
            .then_some(RevealMethod::Callback)
    }
}

/// 点一下托盘图标并等程序自己把窗口显示出来（`revealed` 为真）。返回唤起方式，失败为 `None`。
///
/// `prefer_double_click`：上次已确认该程序只认双击，跳过单击直接双击。
/// 只能在工作线程上调用：里面会阻塞等待，并且要初始化 COM。
pub(crate) fn reveal(
    icon: &TrayIcon,
    prefer_double_click: bool,
    revealed: &dyn Fn() -> bool,
    timer: &mut PhaseTimer,
) -> Option<RevealMethod> {
    let mut session = ClickSession {
        icon,
        prefer_double_click,
        revealed,
        timer,
    };
    unsafe {
        session
            .post_callback()
            .or_else(|| session.click_via_automation())
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

    #[test]
    fn app_name_is_the_lowercase_executable_stem() {
        assert_eq!(
            app_name_from_executable(r"d:\apps\spotify\Spotify.exe"),
            "spotify"
        );
        assert_eq!(app_name_from_executable(r"c:\tencent\qqnt\qq.exe"), "qq");
        assert_eq!(app_name_from_executable(""), "");
    }

    #[test]
    fn the_candidate_whose_tooltip_names_the_app_wins() {
        // 动画中两个图标位置重合：提示文字对得上的才是目标。
        let tooltips = ["Telegram".to_string(), "Spotify Premium".to_string()];
        assert_eq!(pick_candidate_by_tooltip(&tooltips, "spotify"), Some(1));
        assert_eq!(pick_candidate_by_tooltip(&tooltips, "telegram"), Some(0));
        // 都对不上且不止一个：不敢按。
        assert_eq!(pick_candidate_by_tooltip(&tooltips, "wechat"), None);
        // 微信的提示文字是「微信」，对不上 wechat，但只有它一个候选就按它。
        assert_eq!(
            pick_candidate_by_tooltip(&["微信".to_string()], "wechat"),
            Some(0)
        );
        assert_eq!(pick_candidate_by_tooltip(&[], "spotify"), None);
        // 程序名为空时不做匹配，只认唯一候选。
        assert_eq!(pick_candidate_by_tooltip(&tooltips, ""), None);
    }

    #[test]
    fn positions_count_as_settled_only_when_both_rects_repeat() {
        let shell = rect(3298, 2130, 48, 72);
        let ui = rect(3297, 2130, 60, 60);
        assert!(!positions_settled(None, (shell, ui)));
        assert!(positions_settled(Some((shell, ui)), (shell, ui)));
        // UIA 的位置还在动：不算稳定。
        let moving_ui = rect(3280, 2130, 60, 60);
        assert!(!positions_settled(Some((shell, moving_ui)), (shell, ui)));
        // Shell 的位置变了（图标从任务栏进了溢出区）：同样不算。
        let other_shell = rect(3423, 2088, 48, 72);
        assert!(!positions_settled(Some((other_shell, ui)), (shell, ui)));
    }

    #[test]
    fn absolute_coordinates_span_the_whole_virtual_desktop() {
        // 双屏：虚拟桌面从 -1920 开始，宽 3840。
        let screen = VirtualScreen {
            left: -1920,
            top: 0,
            width: 3840,
            height: 1080,
        };
        assert_eq!(screen.to_absolute(POINT { x: -1920, y: 0 }), (0, 0));
        assert_eq!(
            screen.to_absolute(POINT { x: 1919, y: 1079 }),
            (65535, 65535)
        );
        let (x, _) = screen.to_absolute(POINT { x: 0, y: 0 });
        assert_eq!(x, 1920 * 65535 / 3839);
        // 退化尺寸不能除零。
        let empty = VirtualScreen {
            left: 0,
            top: 0,
            width: 0,
            height: 1,
        };
        assert_eq!(empty.to_absolute(POINT { x: 5, y: 5 }), (0, 0));
    }

    #[test]
    fn a_double_click_moves_clicks_twice_and_puts_the_cursor_back() {
        let screen = VirtualScreen {
            left: 0,
            top: 0,
            width: 1921,
            height: 1081,
        };
        let sequence = double_click_sequence(
            screen,
            POINT { x: 1920, y: 1080 },
            POINT { x: 0, y: 0 },
        );
        let flags: Vec<u32> = sequence
            .iter()
            .map(|input| unsafe { input.Anonymous.mi.dwFlags.0 })
            .collect();
        let base = (MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK).0;
        assert_eq!(
            flags,
            vec![
                base,
                base | MOUSEEVENTF_LEFTDOWN.0,
                base | MOUSEEVENTF_LEFTUP.0,
                base | MOUSEEVENTF_LEFTDOWN.0,
                base | MOUSEEVENTF_LEFTUP.0,
                base,
            ]
        );
        let positions: Vec<(i32, i32)> = sequence
            .iter()
            .map(|input| unsafe { (input.Anonymous.mi.dx, input.Anonymous.mi.dy) })
            .collect();
        assert!(positions[..5].iter().all(|&p| p == (65535, 65535)));
        assert_eq!(positions[5], (0, 0));
    }
}
