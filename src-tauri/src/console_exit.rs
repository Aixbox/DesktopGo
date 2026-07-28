#[cfg(windows)]
use once_cell::sync::OnceCell;
#[cfg(windows)]
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(windows)]
static WINDOWS_CONSOLE_APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();
#[cfg(windows)]
static WINDOWS_CONSOLE_EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
pub(crate) fn install(app: &tauri::AppHandle) {
    let _ = WINDOWS_CONSOLE_APP_HANDLE.set(app.clone());

    if let Err(error) = unsafe {
        windows::Win32::System::Console::SetConsoleCtrlHandler(
            Some(windows_console_ctrl_handler),
            true,
        )
    } {
        eprintln!(
            "Warning: Failed to install Windows console exit handler: {}",
            error
        );
    }
}

#[cfg(not(windows))]
pub(crate) fn install(_app: &tauri::AppHandle) {}

#[cfg(windows)]
unsafe extern "system" fn windows_console_ctrl_handler(ctrl_type: u32) -> windows::core::BOOL {
    use windows::Win32::System::Console::{
        CTRL_BREAK_EVENT, CTRL_CLOSE_EVENT, CTRL_C_EVENT, CTRL_SHUTDOWN_EVENT,
    };

    let should_exit = matches!(
        ctrl_type,
        CTRL_C_EVENT | CTRL_BREAK_EVENT | CTRL_CLOSE_EVENT | CTRL_SHUTDOWN_EVENT
    );
    if !should_exit {
        return false.into();
    }

    if !WINDOWS_CONSOLE_EXIT_REQUESTED.swap(true, Ordering::SeqCst) {
        if let Some(app) = WINDOWS_CONSOLE_APP_HANDLE.get() {
            app.exit(0);
            return true.into();
        }

        WINDOWS_CONSOLE_EXIT_REQUESTED.store(false, Ordering::SeqCst);
        return false.into();
    }

    true.into()
}
