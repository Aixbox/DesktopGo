//! 点击图标时先找「已经在跑的同一个程序」，找到就把它的窗口唤到前台，而不是再起一个实例。
//!
//! QQ、微信这类允许多开的程序，重复启动会弹出第二个登录窗口，再登录又会把已登录的那份
//! 顶下线。所以启动前先按可执行文件路径匹配正在运行的进程，命中则激活其主窗口。
//!
//! 只处理 `.exe` 与指向 `.exe` 的 `.lnk`：文档、文件夹、URL、商店应用等仍按原路径启动。

use std::collections::HashMap;
use std::path::Path;

use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindow, GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, ShowWindow, GWL_EXSTYLE, GW_OWNER,
    SW_RESTORE, SW_SHOW, WS_EX_TOOLWINDOW,
};

use crate::shortcut_target::{is_shortcut_file, resolve_shortcut_target};

/// 小于这个尺寸的隐藏窗口基本都是消息窗口、GDI+/OLE 的辅助窗口，不是主窗口。
const MIN_MAIN_WINDOW_EDGE: i32 = 100;

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

/// 一个顶层窗口的判定所需信息，与 Win32 解耦，便于对挑选逻辑做单元测试。
#[derive(Debug, Clone, PartialEq, Eq)]
struct WindowCandidate {
    hwnd: isize,
    visible: bool,
    minimized: bool,
    /// 有标题、无宿主、非工具窗口、尺寸够大、类名不在辅助窗口名单里。
    looks_like_main_window: bool,
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

/// 优先挑可见的主窗口；都不可见（收进托盘）时退而选隐藏的主窗口。
fn pick_window(candidates: &[WindowCandidate]) -> Option<&WindowCandidate> {
    let main_windows = candidates.iter().filter(|c| c.looks_like_main_window);
    main_windows
        .clone()
        .find(|c| c.visible)
        .or_else(|| main_windows.clone().next())
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

unsafe fn looks_like_main_window(hwnd: HWND) -> bool {
    if GetWindowTextLengthW(hwnd) <= 0 {
        return false;
    }
    if GetWindow(hwnd, GW_OWNER).is_ok_and(|owner| !owner.0.is_null()) {
        return false;
    }
    let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    if ex_style & WS_EX_TOOLWINDOW.0 != 0 {
        return false;
    }
    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_err() {
        return false;
    }
    if rect.right - rect.left < MIN_MAIN_WINDOW_EDGE
        || rect.bottom - rect.top < MIN_MAIN_WINDOW_EDGE
    {
        return false;
    }
    let class = class_name(hwnd);
    !HELPER_WINDOW_CLASSES
        .iter()
        .any(|helper| helper.eq_ignore_ascii_case(&class))
}

struct EnumState {
    target_exe: String,
    image_paths: HashMap<u32, Option<String>>,
    candidates: Vec<WindowCandidate>,
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
    state.candidates.push(WindowCandidate {
        hwnd: hwnd.0 as isize,
        visible: IsWindowVisible(hwnd).as_bool(),
        minimized: IsIconic(hwnd).as_bool(),
        looks_like_main_window: looks_like_main_window(hwnd),
    });
    true.into()
}

fn find_running_window(target_exe: String) -> Option<WindowCandidate> {
    let mut state = EnumState {
        target_exe,
        image_paths: HashMap::new(),
        candidates: Vec::new(),
    };
    unsafe {
        let _ = EnumWindows(
            Some(collect_window),
            LPARAM(&mut state as *mut EnumState as isize),
        );
    }
    pick_window(&state.candidates).cloned()
}

/// 目标程序已在运行时激活其主窗口并返回 `true`；否则返回 `false`，由调用方照常启动。
pub(crate) fn activate_running_instance(launch_path: &str) -> bool {
    let Some(target_exe) = resolve_executable_path(launch_path, resolve_shortcut_target) else {
        return false;
    };
    let Some(window) = find_running_window(target_exe) else {
        return false;
    };

    let hwnd = HWND(window.hwnd as *mut _);
    unsafe {
        if !window.visible {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }
        if window.minimized {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
        let _ = crate::window::bring_window_to_foreground(hwnd);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(hwnd: isize, visible: bool, main: bool) -> WindowCandidate {
        WindowCandidate {
            hwnd,
            visible,
            minimized: false,
            looks_like_main_window: main,
        }
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
    fn no_main_window_means_a_normal_launch() {
        let candidates = [candidate(1, true, false), candidate(2, false, false)];
        assert!(pick_window(&candidates).is_none());
        assert!(pick_window(&[]).is_none());
    }
}
