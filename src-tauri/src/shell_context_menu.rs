#[cfg(windows)]
use std::cell::RefCell;
#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::mem::size_of;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use std::ptr::null_mut;

#[cfg(windows)]
use tauri::Manager;
#[cfg(windows)]
use windows::core::{Interface, PCSTR, PCWSTR, PSTR};
#[cfg(windows)]
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RPC_E_CHANGED_MODE, WPARAM};
#[cfg(windows)]
use windows::Win32::System::Com::{
    CoInitializeEx, CoTaskMemFree, CoUninitialize, IBindCtx, COINIT_APARTMENTTHREADED,
};
#[cfg(windows)]
use windows::Win32::UI::Shell::Common::ITEMIDLIST;
#[cfg(windows)]
use windows::Win32::UI::Shell::{
    IContextMenu, IContextMenu2, IContextMenu3, IShellFolder, SHBindToParent, SHParseDisplayName,
    CMF_CANRENAME, CMF_NORMAL, CMIC_MASK_PTINVOKE, CMINVOKECOMMANDINFO, CMINVOKECOMMANDINFOEX,
    GCS_VERBA,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    CallWindowProcW, CreatePopupMenu, DefWindowProcW, DestroyMenu, GetCursorPos, GetWindowLongPtrW,
    PostMessageW, SetForegroundWindow, SetWindowLongPtrW, TrackPopupMenu, GWLP_WNDPROC, HMENU,
    SW_SHOWNORMAL, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_DRAWITEM, WM_INITMENUPOPUP,
    WM_MEASUREITEM, WM_MENUCHAR, WM_NULL, WNDPROC,
};

#[cfg(windows)]
const COMMAND_ID_FIRST: u32 = 1;
#[cfg(windows)]
const COMMAND_ID_LAST: u32 = 0x7FFF;
#[cfg(windows)]
const CMIC_MASK_UNICODE: u32 = 0x0000_4000;

#[cfg(windows)]
thread_local! {
    // Shell 级联菜单和 owner-draw 依赖宿主窗口消息，需要在弹出期间临时转发到 IContextMenu2/3。
    static ACTIVE_CONTEXT_MENU_HOOK: RefCell<Option<ActiveContextMenuHook>> = const { RefCell::new(None) };
}

#[cfg(windows)]
struct ActiveContextMenuHook {
    previous_wndproc: WNDPROC,
    context_menu2: Option<IContextMenu2>,
    context_menu3: Option<IContextMenu3>,
}

#[cfg(windows)]
struct ContextMenuHookGuard {
    hwnd: HWND,
    installed: bool,
}

#[cfg(windows)]
impl Drop for ContextMenuHookGuard {
    fn drop(&mut self) {
        if !self.installed {
            return;
        }

        ACTIVE_CONTEXT_MENU_HOOK.with(|state| {
            if let Some(hook) = state.borrow_mut().take() {
                let previous_raw: isize = unsafe { std::mem::transmute(hook.previous_wndproc) };
                unsafe {
                    let _ = SetWindowLongPtrW(self.hwnd, GWLP_WNDPROC, previous_raw);
                }
            }
        });
    }
}

#[cfg(windows)]
struct PopupMenuGuard(HMENU);

#[cfg(windows)]
impl Drop for PopupMenuGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = DestroyMenu(self.0);
        }
    }
}

#[cfg(windows)]
struct PidlGuard(*mut ITEMIDLIST);

#[cfg(windows)]
impl PidlGuard {
    fn as_ptr(&self) -> *const ITEMIDLIST {
        self.0 as *const ITEMIDLIST
    }
}

#[cfg(windows)]
impl Drop for PidlGuard {
    fn drop(&mut self) {
        unsafe {
            if !self.0.is_null() {
                CoTaskMemFree(Some(self.0 as *const _));
            }
        }
    }
}

#[cfg(windows)]
struct ComInitGuard {
    should_uninitialize: bool,
}

#[cfg(windows)]
impl ComInitGuard {
    fn new() -> Result<Self, String> {
        let result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        if result == RPC_E_CHANGED_MODE {
            return Ok(Self {
                should_uninitialize: false,
            });
        }

        result
            .ok()
            .map_err(|error| format!("无法初始化 Windows Shell 上下文菜单 COM 环境：{}", error))?;

        Ok(Self {
            should_uninitialize: true,
        })
    }
}

#[cfg(windows)]
impl Drop for ComInitGuard {
    fn drop(&mut self) {
        if self.should_uninitialize {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

#[cfg(windows)]
unsafe extern "system" fn shell_context_menu_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    let hook_snapshot = ACTIVE_CONTEXT_MENU_HOOK.with(|state| {
        state.borrow().as_ref().map(|hook| {
            (
                hook.previous_wndproc,
                hook.context_menu2.clone(),
                hook.context_menu3.clone(),
            )
        })
    });

    if let Some((previous_wndproc, context_menu2, context_menu3)) = hook_snapshot {
        if should_forward_menu_message(msg) {
            if let Some(context_menu3) = context_menu3 {
                let mut result = LRESULT(0);
                if context_menu3
                    .HandleMenuMsg2(msg, wparam, lparam, Some(&mut result as *mut _))
                    .is_ok()
                {
                    return result;
                }
            } else if let Some(context_menu2) = context_menu2 {
                if context_menu2.HandleMenuMsg(msg, wparam, lparam).is_ok() {
                    return LRESULT(0);
                }
            }
        }

        if let Some(previous_wndproc) = previous_wndproc {
            return CallWindowProcW(Some(previous_wndproc), hwnd, msg, wparam, lparam);
        }
    }

    DefWindowProcW(hwnd, msg, wparam, lparam)
}

#[cfg(windows)]
fn should_forward_menu_message(msg: u32) -> bool {
    matches!(
        msg,
        WM_INITMENUPOPUP | WM_DRAWITEM | WM_MEASUREITEM | WM_MENUCHAR
    )
}

#[cfg(windows)]
unsafe fn install_context_menu_hook(
    hwnd: HWND,
    context_menu: &IContextMenu,
) -> Result<ContextMenuHookGuard, String> {
    let context_menu2 = context_menu.cast::<IContextMenu2>().ok();
    let context_menu3 = context_menu.cast::<IContextMenu3>().ok();
    if context_menu2.is_none() && context_menu3.is_none() {
        return Ok(ContextMenuHookGuard {
            hwnd,
            installed: false,
        });
    }

    let previous_raw = GetWindowLongPtrW(hwnd, GWLP_WNDPROC);
    let previous_wndproc: WNDPROC = std::mem::transmute(previous_raw);

    ACTIVE_CONTEXT_MENU_HOOK.with(|state| {
        let mut state = state.borrow_mut();
        if state.is_some() {
            return Err("当前已有一个 Shell 上下文菜单在处理中，请稍后重试。".to_string());
        }

        *state = Some(ActiveContextMenuHook {
            previous_wndproc,
            context_menu2,
            context_menu3,
        });

        Ok(())
    })?;

    let next_wndproc = shell_context_menu_wndproc as *const () as usize as isize;
    let _ = SetWindowLongPtrW(hwnd, GWLP_WNDPROC, next_wndproc);

    Ok(ContextMenuHookGuard {
        hwnd,
        installed: true,
    })
}

#[cfg(windows)]
fn resolve_command_verb(context_menu: &IContextMenu, command_offset: usize) -> String {
    let mut buffer = [0u8; 260];
    let result = unsafe {
        context_menu.GetCommandString(
            command_offset,
            GCS_VERBA,
            None,
            PSTR(buffer.as_mut_ptr()),
            buffer.len() as u32,
        )
    };
    if result.is_err() {
        return String::new();
    }

    let len = buffer
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(buffer.len());
    String::from_utf8_lossy(&buffer[..len]).trim().to_string()
}

#[cfg(windows)]
fn make_int_resource_pcstr(value: usize) -> PCSTR {
    PCSTR(value as *const u8)
}

#[cfg(windows)]
fn make_int_resource_pcwstr(value: usize) -> PCWSTR {
    PCWSTR(value as *const u16)
}

#[cfg(windows)]
fn to_wide_null_terminated(value: &str) -> Vec<u16> {
    OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
fn show_shell_context_menu_on_main_thread(
    app_handle: &tauri::AppHandle,
    path: &str,
) -> Result<Option<String>, String> {
    if path.trim().is_empty() {
        return Err("无法打开 Shell 右键菜单：路径为空。".to_string());
    }

    let window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "无法获取主窗口，Shell 右键菜单无法显示。".to_string())?;
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("无法获取主窗口句柄：{}", error))?;
    let _com_guard = ComInitGuard::new()?;

    let wide_path = to_wide_null_terminated(path);
    let mut absolute_pidl = null_mut();
    unsafe {
        SHParseDisplayName(
            PCWSTR(wide_path.as_ptr()),
            None::<&IBindCtx>,
            &mut absolute_pidl,
            0,
            None,
        )
        .map_err(|error| format!("Windows Shell 无法解析目标路径 `{}`：{}", path, error))?;
    }
    let absolute_pidl = PidlGuard(absolute_pidl);

    let mut child_pidl = null_mut();
    let parent_folder: IShellFolder = unsafe {
        SHBindToParent(absolute_pidl.as_ptr(), Some(&mut child_pidl))
            .map_err(|error| format!("无法定位目标项所属的 Shell 文件夹：{}", error))?
    };
    let child_pidls = [child_pidl as *const ITEMIDLIST];
    let context_menu: IContextMenu = unsafe {
        parent_folder
            .GetUIObjectOf(hwnd, &child_pidls, None)
            .map_err(|error| format!("无法创建 Windows Shell 右键菜单对象：{}", error))?
    };

    let popup_menu = PopupMenuGuard(
        unsafe { CreatePopupMenu() }
            .map_err(|error| format!("无法创建 Windows Shell 菜单句柄：{}", error))?,
    );

    unsafe {
        context_menu
            .QueryContextMenu(
                popup_menu.0,
                0,
                COMMAND_ID_FIRST,
                COMMAND_ID_LAST,
                CMF_NORMAL | CMF_CANRENAME,
            )
            .ok()
            .map_err(|error| format!("无法填充 Windows Shell 菜单项：{}", error))?;
    }

    let _hook_guard = unsafe { install_context_menu_hook(hwnd, &context_menu)? };
    let mut cursor = POINT::default();
    unsafe {
        GetCursorPos(&mut cursor)
            .map_err(|error| format!("无法获取鼠标位置以显示 Shell 菜单：{}", error))?;
    }

    let _ = window.set_always_on_top(false);
    unsafe {
        let _ = SetForegroundWindow(hwnd);
    }

    let selected_command = unsafe {
        TrackPopupMenu(
            popup_menu.0,
            TPM_LEFTALIGN | TPM_RIGHTBUTTON | TPM_RETURNCMD,
            cursor.x,
            cursor.y,
            Some(0),
            hwnd,
            None,
        )
    }
    .0 as u32;

    unsafe {
        let _ = PostMessageW(Some(hwnd), WM_NULL, WPARAM(0), LPARAM(0));
    }

    if selected_command == 0 {
        let _ = window.set_always_on_top(true);
        return Ok(None);
    }

    let command_offset = selected_command
        .checked_sub(COMMAND_ID_FIRST)
        .ok_or_else(|| "Windows Shell 返回了无效的菜单命令编号。".to_string())?
        as usize;
    let selected_verb = resolve_command_verb(&context_menu, command_offset);

    let invoke = CMINVOKECOMMANDINFOEX {
        cbSize: size_of::<CMINVOKECOMMANDINFOEX>() as u32,
        fMask: CMIC_MASK_UNICODE | CMIC_MASK_PTINVOKE,
        hwnd,
        lpVerb: make_int_resource_pcstr(command_offset),
        lpParameters: PCSTR(std::ptr::null()),
        lpDirectory: PCSTR(std::ptr::null()),
        nShow: SW_SHOWNORMAL.0,
        dwHotKey: 0,
        hIcon: Default::default(),
        lpTitle: PCSTR(std::ptr::null()),
        lpVerbW: make_int_resource_pcwstr(command_offset),
        lpParametersW: PCWSTR(std::ptr::null()),
        lpDirectoryW: PCWSTR(std::ptr::null()),
        lpTitleW: PCWSTR(std::ptr::null()),
        ptInvoke: cursor,
    };

    let invoke_result = unsafe {
        context_menu
            .InvokeCommand((&invoke as *const CMINVOKECOMMANDINFOEX).cast::<CMINVOKECOMMANDINFO>())
    };
    if let Err(error) = invoke_result {
        let _ = window.set_always_on_top(true);
        return Err(format!("执行 Windows Shell 菜单命令失败：{}", error));
    }

    crate::hide_main_window(app_handle);
    Ok(Some(selected_verb))
}

#[cfg(windows)]
pub(crate) async fn show_shell_context_menu(
    app_handle: &tauri::AppHandle,
    path: String,
) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let dispatch_handle = app_handle.clone();
    let task_handle = app_handle.clone();
    dispatch_handle
        .run_on_main_thread(move || {
            let result = show_shell_context_menu_on_main_thread(&task_handle, &path);
            let _ = tx.send(result);
        })
        .map_err(|error| format!("无法切回主线程显示 Windows Shell 菜单：{}", error))?;

    tauri::async_runtime::spawn_blocking(move || {
        rx.recv()
            .map_err(|_| "主线程未返回 Windows Shell 菜单结果。".to_string())
    })
    .await
    .map_err(|error| format!("等待 Windows Shell 菜单结果时失败：{}", error))??
}

#[cfg(not(windows))]
pub(crate) async fn show_shell_context_menu(
    _app_handle: &tauri::AppHandle,
    _path: String,
) -> Result<Option<String>, String> {
    Err("当前平台不支持 Windows Shell 右键菜单。".to_string())
}
