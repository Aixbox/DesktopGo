use crate::icons::{self, DesktopIcon, IconSyncResult};
use tauri::Manager;

#[tauri::command]
pub fn toggle_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
pub fn set_window_mode(
    app_handle: tauri::AppHandle,
    mode: String,
    width: Option<u32>,
    height: Option<u32>,
) {
    if let Some(window) = app_handle.get_webview_window("main") {
        if mode == "fullscreen" {
            let _ = window.maximize();
        } else {
            let _ = window.unmaximize();
            if let (Some(w), Some(h)) = (width, height) {
                let _ = window.set_size(tauri::LogicalSize::new(w, h));
                let _ = window.center();
            }
        }
    }
}

#[tauri::command]
pub fn get_desktop_icons(app_handle: tauri::AppHandle, icon_size: i32) -> Vec<DesktopIcon> {
    icons::get_desktop_icons(app_handle, icon_size)
}

#[tauri::command]
pub fn sync_new_desktop_icons(app_handle: tauri::AppHandle) -> Result<IconSyncResult, String> {
    icons::sync_new_desktop_icons(app_handle)
}

#[tauri::command]
pub fn sync_full_desktop_icons(app_handle: tauri::AppHandle) -> Result<IconSyncResult, String> {
    icons::sync_full_desktop_icons(app_handle)
}

#[tauri::command]
pub fn hide_desktop_icons(app_handle: tauri::AppHandle, ids: Vec<String>) -> Result<usize, String> {
    icons::hide_desktop_icons(app_handle, ids)
}

#[tauri::command]
pub fn delete_desktop_icons(
    app_handle: tauri::AppHandle,
    ids: Vec<String>,
) -> Result<usize, String> {
    icons::delete_desktop_icons(app_handle, ids)
}

#[tauri::command]
pub fn launch_app(path: String) -> Result<(), String> {
    icons::launch_app(path)
}
