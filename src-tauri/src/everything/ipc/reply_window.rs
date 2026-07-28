use std::sync::Mutex;
use std::time::Instant;

use once_cell::sync::{Lazy, OnceCell};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{GetLastError, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassW, HWND_MESSAGE, WINDOW_EX_STYLE,
    WINDOW_STYLE, WM_COPYDATA, WNDCLASSW,
};

use super::api::{build_query_error, to_wide_null_terminated, EverythingApi, IsQueryReply};
use crate::everything::debug_log::append as append_debug_log;

const REPLY_WINDOW_CLASS: &str = "DesktopGoEverythingSdkReplyWindow";

struct ReplyState {
    is_query_reply: IsQueryReply,
    reply_id: u32,
    completed: bool,
}

static REPLY_WINDOW_CLASS_WIDE: Lazy<Vec<u16>> =
    Lazy::new(|| to_wide_null_terminated(REPLY_WINDOW_CLASS));
static WINDOW_CLASS_REGISTERED: OnceCell<()> = OnceCell::new();
static QUERY_REPLY_STATE: Lazy<Mutex<Option<ReplyState>>> = Lazy::new(|| Mutex::new(None));

unsafe extern "system" fn reply_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_COPYDATA {
        if let Ok(mut guard) = QUERY_REPLY_STATE.lock() {
            if let Some(state) = guard.as_mut() {
                if unsafe { (state.is_query_reply)(msg, wparam, lparam, state.reply_id) } != 0 {
                    state.completed = true;
                    return LRESULT(1);
                }
            }
        }
    }
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

fn register_reply_window_class() -> Result<(), String> {
    WINDOW_CLASS_REGISTERED
        .get_or_try_init(|| {
            let instance = unsafe { GetModuleHandleW(None) }
                .map_err(|e| format!("GetModuleHandleW failed: {}", e))?;
            let class = WNDCLASSW {
                lpfnWndProc: Some(reply_window_proc),
                hInstance: HINSTANCE(instance.0),
                lpszClassName: PCWSTR(REPLY_WINDOW_CLASS_WIDE.as_ptr()),
                ..Default::default()
            };

            let atom = unsafe { RegisterClassW(&class) };
            if atom == 0 {
                let error = unsafe { GetLastError() }.0;
                if error != 1410 {
                    return Err(format!("RegisterClassW failed with code {}", error));
                }
            }
            Ok(())
        })
        .map(|_| ())
}

pub(super) fn create() -> Result<HWND, String> {
    register_reply_window_class()?;
    let instance =
        unsafe { GetModuleHandleW(None) }.map_err(|e| format!("GetModuleHandleW failed: {}", e))?;
    let hwnd = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            PCWSTR(REPLY_WINDOW_CLASS_WIDE.as_ptr()),
            PCWSTR(REPLY_WINDOW_CLASS_WIDE.as_ptr()),
            WINDOW_STYLE::default(),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(HINSTANCE(instance.0)),
            None,
        )
    }
    .map_err(|e| format!("CreateWindowExW failed: {}", e))?;

    if hwnd.0.is_null() {
        return Err(format!(
            "CreateWindowExW failed with code {}",
            unsafe { GetLastError() }.0
        ));
    }
    Ok(hwnd)
}

pub(super) fn clear_state() {
    if let Ok(mut guard) = QUERY_REPLY_STATE.lock() {
        *guard = None;
    }
}

fn set_state(is_query_reply: IsQueryReply, reply_id: u32) -> Result<(), String> {
    let mut guard = QUERY_REPLY_STATE
        .lock()
        .map_err(|_| "Failed to lock Everything reply state".to_string())?;
    *guard = Some(ReplyState {
        is_query_reply,
        reply_id,
        completed: false,
    });
    Ok(())
}

pub(super) fn is_completed() -> bool {
    QUERY_REPLY_STATE
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|state| state.completed))
        .unwrap_or(false)
}

pub(super) fn begin_query(
    api: &EverythingApi,
    reply_hwnd: HWND,
    reply_id: u32,
    app_handle: &tauri::AppHandle,
    reason: &str,
) -> Result<Instant, String> {
    set_state(api.is_query_reply, reply_id)?;
    unsafe {
        (api.set_reply_window)(reply_hwnd);
        (api.set_reply_id)(reply_id);
    }

    append_debug_log(app_handle, format!("ipc {}: query_w call start", reason));
    let query_started_at = Instant::now();
    let ok = unsafe { (api.query_w)(0) };
    append_debug_log(
        app_handle,
        format!(
            "ipc {}: query_w call returned ok={} took_ms={}",
            reason,
            ok,
            query_started_at.elapsed().as_millis()
        ),
    );
    if ok == 0 {
        clear_state();
        unsafe {
            (api.set_reply_window)(HWND(std::ptr::null_mut()));
            (api.clean_up)();
        }
        return Err(build_query_error(api, "Everything query failed"));
    }
    Ok(Instant::now())
}

pub(super) fn destroy(api: &EverythingApi, reply_hwnd: HWND) {
    clear_state();
    unsafe {
        (api.set_reply_window)(HWND(std::ptr::null_mut()));
        (api.clean_up)();
        let _ = DestroyWindow(reply_hwnd);
    }
}
