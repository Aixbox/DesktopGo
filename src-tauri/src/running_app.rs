//! 点击图标时先找「已经在跑的同一个程序」，找到就把它的窗口唤到前台，而不是再起一个实例。
//!
//! QQ、微信这类允许多开的程序，重复启动会弹出第二个登录窗口，再登录又会把已登录的那份
//! 顶下线。所以启动前先按可执行文件路径匹配正在运行的进程，命中则激活其主窗口。
//!
//! 只处理 `.exe` 与指向 `.exe` 的 `.lnk`：文档、文件夹、URL、商店应用等仍按原路径启动。

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, GetClassNameW, GetWindow, GetWindowLongPtrW, GetWindowPlacement,
    GetWindowTextLengthW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, ShowWindowAsync,
    GWL_EXSTYLE, GWL_STYLE, GW_OWNER, HWND_MESSAGE, SHOW_WINDOW_CMD, SW_RESTORE, WINDOWPLACEMENT,
    WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU, WS_THICKFRAME,
};

use crate::poll::{wait_until, PhaseTimer};
use crate::shortcut_target::{is_shortcut_file, resolve_shortcut_target};
use crate::tray_icon_click::{self, RevealMethod, TrayIcon};

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

/// 本次运行内按可执行文件路径记住的一组事实（进程退出即清空）。
struct SessionMemory(OnceLock<Mutex<HashSet<String>>>);

impl SessionMemory {
    const fn new() -> Self {
        Self(OnceLock::new())
    }

    fn contains(&self, target_exe: &str) -> bool {
        self.0
            .get_or_init(Default::default)
            .lock()
            .map(|set| set.contains(target_exe))
            .unwrap_or(false)
    }

    fn insert(&self, target_exe: &str) {
        if let Ok(mut set) = self.0.get_or_init(Default::default).lock() {
            set.insert(target_exe.to_string());
        }
    }
}

/// 托盘点击（含双击）都失败过的程序：之后收进托盘时直接重启，不再浪费时间去点。
static TRAY_CLICK_FAILURES: SessionMemory = SessionMemory::new();

/// 托盘图标只认双击的程序（Spotify）：之后跳过单击及其 500ms 空等，直接双击。
static TRAY_DOUBLE_CLICK_APPS: SessionMemory = SessionMemory::new();

struct EnumState {
    target_exe: String,
    /// 程序名主干（小写），托盘点击时用来核对图标身份。
    app_name: String,
    /// 是否顺带探测托盘图标（每个窗口要向 explorer 发十几次同步消息，只在首次需要）。
    probe_tray: bool,
    image_paths: HashMap<u32, Option<String>>,
    candidates: Vec<WindowCandidate>,
    /// 目标进程注册的托盘图标（已知宿主类才认得出来）。
    tray_icon: Option<TrayIcon>,
}

impl EnumState {
    /// 该窗口是否属于目标进程（按进程映像路径比对，结果按 pid 缓存）。
    unsafe fn belongs_to_target(&mut self, hwnd: HWND) -> bool {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return false;
        }
        let image_path = self
            .image_paths
            .entry(pid)
            .or_insert_with(|| process_image_path(pid));
        image_path.as_deref() == Some(self.target_exe.as_str())
    }

    unsafe fn probe_tray_icon(&mut self, hwnd: HWND) {
        if self.probe_tray && self.tray_icon.is_none() {
            self.tray_icon =
                tray_icon_click::find_tray_icon(hwnd, &class_name(hwnd), &self.app_name);
        }
    }
}

unsafe extern "system" fn collect_window(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    let state = &mut *(lparam.0 as *mut EnumState);
    if !state.belongs_to_target(hwnd) {
        return true.into();
    }
    state.probe_tray_icon(hwnd);
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

/// 在 message-only 窗口里找目标进程的托盘图标。
///
/// `EnumWindows` 只枚举顶层窗口，而 Chromium/CEF 系程序（Spotify 等）常把托盘图标注册在
/// `HWND_MESSAGE` 下的 message-only 窗口上，只能用 `FindWindowExW(HWND_MESSAGE, ...)` 逐个遍历。
unsafe fn probe_message_only_windows(state: &mut EnumState) {
    let mut previous = HWND::default();
    loop {
        let Ok(hwnd) = FindWindowExW(Some(HWND_MESSAGE), Some(previous), None, None) else {
            return;
        };
        if hwnd.0.is_null() {
            return;
        }
        if state.belongs_to_target(hwnd) {
            state.probe_tray_icon(hwnd);
            if state.tray_icon.is_some() {
                return;
            }
        }
        previous = hwnd;
    }
}

/// 找到的运行中实例：主窗口，以及它的托盘图标（如有）。
struct RunningInstance {
    window: WindowCandidate,
    tray_icon: Option<TrayIcon>,
}

fn find_running_instance(target_exe: String, probe_tray: bool) -> Option<RunningInstance> {
    let mut state = EnumState {
        app_name: tray_icon_click::app_name_from_executable(&target_exe),
        target_exe,
        probe_tray,
        image_paths: HashMap::new(),
        candidates: Vec::new(),
        tray_icon: None,
    };
    unsafe {
        let _ = EnumWindows(
            Some(collect_window),
            LPARAM(&mut state as *mut EnumState as isize),
        );
        if probe_tray && state.tray_icon.is_none() {
            probe_message_only_windows(&mut state);
        }
    }
    let window = pick_window(&state.candidates).cloned()?;
    Some(RunningInstance {
        window,
        tray_icon: state.tray_icon,
    })
}

/// 该进程现在是否有一个正常可见（未最小化）的主窗口。
///
/// 唤起后不能只盯着事先挑出的那个 hwnd：Chromium 系程序从托盘恢复时可能销毁旧窗口重建一个，
/// 旧 hwnd 永远不会再可见。
fn has_visible_main_window(target_exe: &str) -> bool {
    find_running_instance(target_exe.to_string(), false)
        .is_some_and(|instance| instance.window.visible && !instance.window.minimized)
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
    /// 收进托盘但认不出托盘图标：放弃唤起，按原路径再启动一次。
    ///
    /// 绝不能外部 `SW_SHOW`：程序自己 hide 的窗口被硬拉出来后框架层仍认为隐藏，画面停在最后一帧
    /// （关闭按钮悬停态的红色）、点击无反应（Spotify 实测）。单实例程序收到二次启动会自己把
    /// 窗口正确恢复；能多开的 QQ/微信托盘图标都认得出来，不会走到这里。
    Relaunch,
}

/// 收进托盘（隐藏）的窗口优先走托盘点击；认不出托盘图标、或托盘点击失败过的程序交回正常启动，
/// 最小化在任务栏的用 `SW_RESTORE`（它同时也会显示）。
fn resolve_reveal_strategy(
    visible: bool,
    minimized: bool,
    has_tray_icon: bool,
    tray_click_failed_before: bool,
) -> RevealStrategy {
    if !visible {
        if has_tray_icon && !tray_click_failed_before {
            RevealStrategy::ClickTray
        } else {
            RevealStrategy::Relaunch
        }
    } else if minimized {
        RevealStrategy::Show(SW_RESTORE)
    } else {
        RevealStrategy::None
    }
}

/// 目标程序已在运行时激活其主窗口并返回 `true`；否则返回 `false`，由调用方照常启动。
///
/// 必须在工作线程上调用（`launch_app` 是 async 命令）：这里会等目标窗口完成还原，
/// 不能卡住启动台的 UI 线程。
pub(crate) fn activate_running_instance(launch_path: &str) -> bool {
    let mut timer = PhaseTimer::start(format!("activate {launch_path}"));
    let Some(target_exe) = resolve_executable_path(launch_path, resolve_shortcut_target) else {
        return false;
    };
    timer.phase("resolve_exe");
    let failed_before = TRAY_CLICK_FAILURES.contains(&target_exe);
    let Some(instance) = find_running_instance(target_exe.clone(), !failed_before) else {
        timer.phase("enum_windows(not running)");
        timer.report();
        return false;
    };
    timer.phase("enum_windows");
    let window = instance.window;

    let hwnd = HWND(window.hwnd as *mut _);
    let revealed = || {
        let this_window = unsafe { !IsIconic(hwnd).as_bool() && IsWindowVisible(hwnd).as_bool() };
        this_window || has_visible_main_window(&target_exe)
    };
    unsafe {
        // 还原/显示一律交给目标程序自己去做，我们只投递请求：
        // - 收进托盘的窗口是程序自己 hide 的，外部 ShowWindow 拿出来后框架层仍认为隐藏，
        //   画面停在最后一帧、点击也不重绘。必须模拟点它的托盘图标（见 tray_icon_click.rs），
        //   任何框架都一样；连托盘图标都认不出、或点了也没反应时，交回正常启动。
        // - 最小化在任务栏的用 ShowWindowAsync，等价于用户点任务栏按钮。
        let strategy = resolve_reveal_strategy(
            window.visible,
            window.minimized,
            instance.tray_icon.is_some(),
            failed_before,
        );
        match strategy {
            RevealStrategy::None => {}
            RevealStrategy::Relaunch => {
                timer.phase("relaunch");
                timer.report();
                return false;
            }
            RevealStrategy::Show(command) => {
                let _ = ShowWindowAsync(hwnd, command);
                wait_until(revealed, SHOW_SETTLE_TIMEOUT, SHOW_SETTLE_POLL_INTERVAL);
                timer.phase("show_window");
            }
            RevealStrategy::ClickTray => {
                let icon = instance
                    .tray_icon
                    .expect("ClickTray is only chosen when a tray icon was found");
                let prefer_double_click = TRAY_DOUBLE_CLICK_APPS.contains(&target_exe);
                match tray_icon_click::reveal(&icon, prefer_double_click, &revealed, &mut timer) {
                    Some(RevealMethod::DoubleClick) => TRAY_DOUBLE_CLICK_APPS.insert(&target_exe),
                    Some(_) => {}
                    None => {
                        // 已确认双击有效的程序偶尔失败（面板还在动画、点击落空）是暂时的，
                        // 只这一次退回重启，不能记成永久失败。
                        if prefer_double_click {
                            eprintln!(
                                "Warning: tray double-click did not reveal the window of {launch_path} this time; falling back to a normal launch"
                            );
                        } else {
                            eprintln!(
                                "Warning: tray icon click did not reveal the window of {launch_path}; falling back to a normal launch (remembered for this session)"
                            );
                            TRAY_CLICK_FAILURES.insert(&target_exe);
                        }
                        timer.report();
                        return false;
                    }
                }
            }
        }
        let _ = crate::window::bring_window_to_foreground(hwnd);
        timer.phase("foreground");
    }
    timer.report();
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
        // 收进托盘：认得托盘图标就点它，认不出就交回正常启动（绝不 SW_SHOW 硬显示）。
        assert_eq!(
            resolve_reveal_strategy(false, false, true, false),
            RevealStrategy::ClickTray
        );
        assert_eq!(
            resolve_reveal_strategy(false, true, true, false),
            RevealStrategy::ClickTray
        );
        assert_eq!(
            resolve_reveal_strategy(false, false, false, false),
            RevealStrategy::Relaunch
        );
        assert_eq!(
            resolve_reveal_strategy(false, true, false, false),
            RevealStrategy::Relaunch
        );
        // 托盘点击失败过（Spotify 只响应双击）：哪怕认得图标也直接重启。
        assert_eq!(
            resolve_reveal_strategy(false, false, true, true),
            RevealStrategy::Relaunch
        );
        // 最小化在任务栏（仍可见）：即便有托盘图标也只做还原。
        assert_eq!(
            resolve_reveal_strategy(true, true, true, false),
            RevealStrategy::Show(SW_RESTORE)
        );
        assert_eq!(
            resolve_reveal_strategy(true, true, true, true),
            RevealStrategy::Show(SW_RESTORE)
        );
        assert_eq!(
            resolve_reveal_strategy(true, false, true, false),
            RevealStrategy::None
        );
        assert_eq!(
            resolve_reveal_strategy(true, false, false, false),
            RevealStrategy::None
        );
    }

    #[test]
    fn session_memory_is_keyed_by_executable() {
        static MEMORY: SessionMemory = SessionMemory::new();
        let exe = r"c:\test\session_memory\spotify.exe";
        assert!(!MEMORY.contains(exe));
        MEMORY.insert(exe);
        assert!(MEMORY.contains(exe));
        assert!(!MEMORY.contains(r"c:\test\session_memory\other.exe"));
    }

    #[test]
    fn no_main_window_means_a_normal_launch() {
        let candidates = [candidate(1, true, false), candidate(2, false, false)];
        assert!(pick_window(&candidates).is_none());
        assert!(pick_window(&[]).is_none());
    }
}
