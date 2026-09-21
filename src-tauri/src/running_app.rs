//! 点击图标时先找「已经在跑的同一个程序」，找到就把它的窗口唤到前台，而不是再起一个实例。
//!
//! QQ、微信这类允许多开的程序，重复启动会弹出第二个登录窗口，再登录又会把已登录的那份
//! 顶下线。所以启动前先按可执行文件路径匹配正在运行的进程，命中则激活其主窗口。
//!
//! 只处理 `.exe` 与指向 `.exe` 的 `.lnk`：文档、文件夹、URL、商店应用等仍按原路径启动。

use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindow, GetWindowLongPtrW, GetWindowPlacement,
    GetWindowTextLengthW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, ShowWindowAsync,
    GWL_EXSTYLE, GWL_STYLE, GW_OWNER, SHOW_WINDOW_CMD, SW_RESTORE, SW_SHOW, WINDOWPLACEMENT,
    WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU, WS_THICKFRAME,
};

use crate::poll::wait_until;
use crate::shortcut_target::{is_shortcut_file, resolve_shortcut_target};
use crate::tray_icon_click::{self, TrayIcon};

/// 小于这个尺寸的隐藏窗口基本都是消息窗口、GDI+/OLE 的辅助窗口，不是主窗口。
const MIN_MAIN_WINDOW_EDGE: i32 = 100;

/// 等目标线程自己完成还原/显示的最长时间；超时也照常切前台，只是少了这层保险。
const SHOW_SETTLE_TIMEOUT: Duration = Duration::from_millis(400);
const SHOW_SETTLE_POLL_INTERVAL: Duration = Duration::from_millis(10);

/// 常见的带标题但绝不是主窗口的窗口类。
const HELPER_WINDOW_CLASSES: &[&str] = &[
    "MSCTFIME UI",
    "IME",
    "GDI+ Hook Window Class",
    "OleMainThreadWndClass",
    "DDEMLMom",
    "tooltips_class32",
    "Chrome_WidgetWin_0",
];

/// 类名里含这些片段的窗口是消息窗口（托盘宿主、电源/显示通知等），哪怕带标题也不是主窗口。
/// 例：微信的 `Qt51514WxTrayIconMessageWindowClass`、`Chrome_SystemMessageWindow`。
const HELPER_WINDOW_CLASS_FRAGMENTS: &[&str] = &["MessageWindow", "NotifyIconHost"];

/// 主窗口至少要有其中一种交互样式；只有 `WS_CAPTION` 而没有系统菜单/缩放框/可调边框的，
/// 是拿标题当标识的消息窗口（微信的托盘消息窗口就是 `WS_CAPTION` 加 1920x1025 的默认尺寸）。
const MAIN_WINDOW_STYLE_MASK: u32 =
    WS_SYSMENU.0 | WS_MINIMIZEBOX.0 | WS_MAXIMIZEBOX.0 | WS_THICKFRAME.0;

fn is_helper_window_class(class: &str) -> bool {
    HELPER_WINDOW_CLASSES
        .iter()
        .any(|helper| helper.eq_ignore_ascii_case(class))
        || HELPER_WINDOW_CLASS_FRAGMENTS.iter().any(|fragment| {
            class
                .to_ascii_lowercase()
                .contains(&fragment.to_ascii_lowercase())
        })
}

fn has_main_window_style(style: u32) -> bool {
    style & MAIN_WINDOW_STYLE_MASK != 0
}

/// 一个顶层窗口的判定所需信息，与 Win32 解耦，便于对挑选逻辑做单元测试。
#[derive(Debug, Clone, PartialEq, Eq)]
struct WindowCandidate {
    hwnd: isize,
    visible: bool,
    minimized: bool,
    /// 有标题、无宿主、非工具窗口、正常尺寸够大、类名不在辅助窗口名单里。
    looks_like_main_window: bool,
    /// 窗口「正常位置」的面积（最小化时也取还原后的尺寸），同为主窗口时面积大的更像主窗口。
    normal_area: i64,
}

/// 把启动路径归一成可比对的可执行文件路径。不是 `.exe` 也不是指向 `.exe` 的 `.lnk` 时返回 `None`。
fn resolve_executable_path(
    launch_path: &str,
    resolve_shortcut: impl Fn(&Path) -> Option<String>,
) -> Option<String> {
    let path = Path::new(launch_path.trim());
    let target = if is_shortcut_file(path) {
        resolve_shortcut(path)?
    } else {
        launch_path.trim().to_string()
    };
    let is_executable = Path::new(&target)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("exe"));
    is_executable.then(|| normalize_path(&target))
}

fn normalize_path(path: &str) -> String {
    path.trim().replace('/', "\\").to_lowercase()
}

/// 挑主窗口：可见的优先于隐藏的（收进托盘），同一档里面积大的优先。
///
/// Electron 程序会带着一堆有标题的小窗（托盘菜单、迷你面板），只按 Z 序取第一个会挑错。
fn pick_window(candidates: &[WindowCandidate]) -> Option<&WindowCandidate> {
    candidates
        .iter()
        .filter(|c| c.looks_like_main_window)
        .max_by_key(|c| (c.visible, c.normal_area))
}

/// 主窗口的正常尺寸是否够大。
fn is_main_window_sized(width: i32, height: i32) -> bool {
    width >= MIN_MAIN_WINDOW_EDGE && height >= MIN_MAIN_WINDOW_EDGE
}

/// 窗口「正常位置」的宽高：最小化窗口的 `GetWindowRect` 只有几十像素并且在屏幕外，
/// 必须用 `GetWindowPlacement` 的还原矩形，否则收进托盘（先最小化再隐藏）的主窗口会被漏掉。
unsafe fn normal_window_size(hwnd: HWND) -> Option<(i32, i32)> {
    let mut placement = WINDOWPLACEMENT {
        length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
        ..Default::default()
    };
    GetWindowPlacement(hwnd, &mut placement).ok()?;
    let rect = placement.rcNormalPosition;
    Some((rect.right - rect.left, rect.bottom - rect.top))
}

unsafe fn process_image_path(pid: u32) -> Option<String> {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut buffer = [0u16; 1024];
    let mut length = buffer.len() as u32;
    let result = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_WIN32,
        windows::core::PWSTR(buffer.as_mut_ptr()),
        &mut length,
    );
    let _ = CloseHandle(handle);
    result.ok()?;
    Some(normalize_path(&String::from_utf16_lossy(
        &buffer[..length as usize],
    )))
}

unsafe fn class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let length = GetClassNameW(hwnd, &mut buffer);
    String::from_utf16_lossy(&buffer[..length.max(0) as usize])
}

/// 判定主窗口，并返回其正常尺寸的面积。
unsafe fn inspect_main_window(hwnd: HWND) -> (bool, i64) {
    if GetWindowTextLengthW(hwnd) <= 0 {
        return (false, 0);
    }
    if GetWindow(hwnd, GW_OWNER).is_ok_and(|owner| !owner.0.is_null()) {
        return (false, 0);
    }
    let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    if ex_style & WS_EX_TOOLWINDOW.0 != 0 {
        return (false, 0);
    }
    let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
    if !has_main_window_style(style) {
        return (false, 0);
    }
    let Some((width, height)) = normal_window_size(hwnd) else {
        return (false, 0);
    };
    if !is_main_window_sized(width, height) {
        return (false, 0);
    }
    let is_helper = is_helper_window_class(&class_name(hwnd));
    (!is_helper, width as i64 * height as i64)
}

struct EnumState {
    target_exe: String,
    image_paths: HashMap<u32, Option<String>>,
    candidates: Vec<WindowCandidate>,
    /// 目标进程注册的托盘图标（已知宿主类才认得出来）。
    tray_icon: Option<TrayIcon>,
}

unsafe extern "system" fn collect_window(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    let state = &mut *(lparam.0 as *mut EnumState);
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return true.into();
    }
    let image_path = state
        .image_paths
        .entry(pid)
        .or_insert_with(|| process_image_path(pid));
    if image_path.as_deref() != Some(state.target_exe.as_str()) {
        return true.into();
    }
    if state.tray_icon.is_none() {
        state.tray_icon = tray_icon_click::find_tray_icon(hwnd, &class_name(hwnd));
    }
    let (looks_like_main_window, normal_area) = inspect_main_window(hwnd);
    state.candidates.push(WindowCandidate {
        hwnd: hwnd.0 as isize,
        visible: IsWindowVisible(hwnd).as_bool(),
        minimized: IsIconic(hwnd).as_bool(),
        looks_like_main_window,
        normal_area,
    });
    true.into()
}

/// 找到的运行中实例：主窗口，以及它的托盘图标（如有）。
struct RunningInstance {
    window: WindowCandidate,
    tray_icon: Option<TrayIcon>,
}

fn find_running_instance(target_exe: String) -> Option<RunningInstance> {
    let mut state = EnumState {
        target_exe,
        image_paths: HashMap::new(),
        candidates: Vec::new(),
        tray_icon: None,
    };
    unsafe {
        let _ = EnumWindows(
            Some(collect_window),
            LPARAM(&mut state as *mut EnumState as isize),
        );
    }
    let window = pick_window(&state.candidates).cloned()?;
    Some(RunningInstance {
        window,
        tray_icon: state.tray_icon,
    })
}

/// 让主窗口重新出现的方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RevealStrategy {
    /// 已经正常可见：直接切前台。
    None,
    /// 最小化在任务栏：让目标线程自己还原（`ShowWindowAsync`）。
    Show(SHOW_WINDOW_CMD),
    /// 收进托盘且认得它的托盘图标：模拟点一下托盘图标，由程序自己显示并恢复内部状态。
    ClickTray,
}

/// 收进托盘（隐藏）的窗口优先走托盘点击；认不出托盘图标时退回 `SW_SHOW`，
/// 最小化在任务栏的用 `SW_RESTORE`（它同时也会显示）。
fn resolve_reveal_strategy(visible: bool, minimized: bool, has_tray_icon: bool) -> RevealStrategy {
    if !visible && has_tray_icon {
        RevealStrategy::ClickTray
    } else if minimized {
        RevealStrategy::Show(SW_RESTORE)
    } else if !visible {
        RevealStrategy::Show(SW_SHOW)
    } else {
        RevealStrategy::None
    }
}

/// 目标程序已在运行时激活其主窗口并返回 `true`；否则返回 `false`，由调用方照常启动。
///
/// 必须在工作线程上调用（`launch_app` 是 async 命令）：这里会等目标窗口完成还原，
/// 不能卡住启动台的 UI 线程。
pub(crate) fn activate_running_instance(launch_path: &str) -> bool {
    let Some(target_exe) = resolve_executable_path(launch_path, resolve_shortcut_target) else {
        return false;
    };
    let Some(instance) = find_running_instance(target_exe) else {
        return false;
    };
    let window = instance.window;

    let hwnd = HWND(window.hwnd as *mut _);
    let revealed = || unsafe { !IsIconic(hwnd).as_bool() && IsWindowVisible(hwnd).as_bool() };
    unsafe {
        // 还原/显示一律交给目标程序自己去做，我们只投递请求：
        // - 收进托盘的窗口是程序自己 hide 的，外部 ShowWindow 拿出来后框架层仍认为隐藏，
        //   画面停在最后一帧、点击也不重绘。必须模拟点它的托盘图标（见 tray_icon_click.rs），
        //   任何框架都一样；只有连托盘图标都没有时才退回 SW_SHOW。
        // - 最小化在任务栏的用 ShowWindowAsync，等价于用户点任务栏按钮。
        let strategy = resolve_reveal_strategy(
            window.visible,
            window.minimized,
            instance.tray_icon.is_some(),
        );
        match strategy {
            RevealStrategy::None => {}
            RevealStrategy::Show(command) => {
                let _ = ShowWindowAsync(hwnd, command);
                wait_until(revealed, SHOW_SETTLE_TIMEOUT, SHOW_SETTLE_POLL_INTERVAL);
            }
            RevealStrategy::ClickTray => {
                let icon = instance
                    .tray_icon
                    .expect("ClickTray is only chosen when a tray icon was found");
                if !tray_icon_click::reveal(&icon, &revealed) {
                    eprintln!(
                        "Warning: tray icon click did not reveal the window of {launch_path}; falling back to SW_SHOW"
                    );
                    let _ = ShowWindowAsync(hwnd, SW_SHOW);
                    wait_until(revealed, SHOW_SETTLE_TIMEOUT, SHOW_SETTLE_POLL_INTERVAL);
                }
            }
        }
        let _ = crate::window::bring_window_to_foreground(hwnd);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(hwnd: isize, visible: bool, main: bool) -> WindowCandidate {
        sized_candidate(hwnd, visible, main, 1000 * 800)
    }

    fn sized_candidate(
        hwnd: isize,
        visible: bool,
        main: bool,
        normal_area: i64,
    ) -> WindowCandidate {
        WindowCandidate {
            hwnd,
            visible,
            minimized: false,
            looks_like_main_window: main,
            normal_area,
        }
    }

    #[test]
    fn the_largest_main_window_wins_over_small_titled_popups() {
        // QQ 收进托盘后：两个几十像素的带标题小窗在 Z 序前面，真正的主窗口在后面。
        let candidates = [
            sized_candidate(1, false, true, 47 * 37),
            sized_candidate(2, false, true, 32 * 37),
            sized_candidate(3, false, true, 2580 * 1412),
        ];
        assert_eq!(pick_window(&candidates).map(|c| c.hwnd), Some(3));

        // 可见性仍然优先于面积。
        let candidates = [
            sized_candidate(1, false, true, 2580 * 1412),
            sized_candidate(2, true, true, 800 * 600),
        ];
        assert_eq!(pick_window(&candidates).map(|c| c.hwnd), Some(2));
    }

    #[test]
    fn message_windows_are_not_main_windows_even_with_a_title() {
        // 微信的托盘消息窗口：有标题、1920x1025，但只有 WS_CAPTION。
        assert!(is_helper_window_class(
            "Qt51514WxTrayIconMessageWindowClass"
        ));
        assert!(is_helper_window_class("Chrome_SystemMessageWindow"));
        assert!(is_helper_window_class("Electron_NotifyIconHostWindow"));
        assert!(!is_helper_window_class("Qt51514QWindowIcon"));
        assert!(!is_helper_window_class("Chrome_WidgetWin_1"));

        let ws_caption_only = 0x14C0_0000;
        assert!(!has_main_window_style(ws_caption_only));
        let wechat_main = 0x86C7_0000;
        assert!(has_main_window_style(wechat_main));
        let qq_main_minimized = 0x24C7_0000;
        assert!(has_main_window_style(qq_main_minimized));
        assert!(has_main_window_style(WS_SYSMENU.0));
    }

    #[test]
    fn main_window_size_check_uses_both_edges() {
        assert!(is_main_window_sized(2580, 1412));
        assert!(is_main_window_sized(100, 100));
        // 最小化窗口 GetWindowRect 报出来的尺寸，绝不能拿来判定。
        assert!(!is_main_window_sized(158, 26));
        assert!(!is_main_window_sized(47, 37));
    }

    #[test]
    fn executables_and_shortcuts_to_executables_resolve_to_a_normalized_path() {
        assert_eq!(
            resolve_executable_path(r"C:\Apps\QQ.EXE", |_| None),
            Some(r"c:\apps\qq.exe".to_string())
        );
        assert_eq!(
            resolve_executable_path(r"C:\Users\Demo\Desktop\QQ.lnk", |_| Some(
                r"D:\Tencent\QQNT\QQ.exe".to_string()
            )),
            Some(r"d:\tencent\qqnt\qq.exe".to_string())
        );
    }

    #[test]
    fn documents_folders_and_non_executable_shortcuts_are_not_matched() {
        assert_eq!(
            resolve_executable_path(r"C:\Docs\Report.docx", |_| None),
            None
        );
        assert_eq!(resolve_executable_path(r"C:\Docs", |_| None), None);
        assert_eq!(
            resolve_executable_path(r"C:\Docs\Report.lnk", |_| Some(
                r"C:\Docs\Report.docx".to_string()
            )),
            None
        );
        assert_eq!(resolve_executable_path(r"C:\Broken.lnk", |_| None), None);
    }

    #[test]
    fn visible_main_windows_win_over_hidden_ones_and_helper_windows() {
        let candidates = [
            candidate(1, true, false),
            candidate(2, false, true),
            candidate(3, true, true),
        ];
        assert_eq!(pick_window(&candidates).map(|c| c.hwnd), Some(3));
    }

    #[test]
    fn a_tray_hidden_main_window_is_still_activated() {
        let candidates = [candidate(1, true, false), candidate(2, false, true)];
        assert_eq!(pick_window(&candidates).map(|c| c.hwnd), Some(2));
    }

    #[test]
    fn tray_hidden_windows_are_revealed_by_clicking_the_tray_icon_when_known() {
        // 收进托盘：认得托盘图标就点它，认不出就退回 SW_SHOW。
        assert_eq!(
            resolve_reveal_strategy(false, false, true),
            RevealStrategy::ClickTray
        );
        assert_eq!(
            resolve_reveal_strategy(false, true, true),
            RevealStrategy::ClickTray
        );
        assert_eq!(
            resolve_reveal_strategy(false, false, false),
            RevealStrategy::Show(SW_SHOW)
        );
        assert_eq!(
            resolve_reveal_strategy(false, true, false),
            RevealStrategy::Show(SW_RESTORE)
        );
        // 最小化在任务栏（仍可见）：即便有托盘图标也只做还原。
        assert_eq!(
            resolve_reveal_strategy(true, true, true),
            RevealStrategy::Show(SW_RESTORE)
        );
        assert_eq!(
            resolve_reveal_strategy(true, false, true),
            RevealStrategy::None
        );
        assert_eq!(
            resolve_reveal_strategy(true, false, false),
            RevealStrategy::None
        );
    }

    #[test]
    fn no_main_window_means_a_normal_launch() {
        let candidates = [candidate(1, true, false), candidate(2, false, false)];
        assert!(pick_window(&candidates).is_none());
        assert!(pick_window(&[]).is_none());
    }
}
