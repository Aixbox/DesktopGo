use crate::everything::{self, SearchPage, SearchQuery, SearchRuntimeStatus};
use crate::icons::{self, DesktopIcon, IconManagerItem, IconMutationTarget, IconSyncResult};
use crate::layout_db;
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
pub fn get_desktop_icons(
    app_handle: tauri::AppHandle,
    icon_size: i32,
    custom_app_dir: Option<String>,
) -> Vec<DesktopIcon> {
    icons::get_desktop_icons(app_handle, icon_size, custom_app_dir)
}

#[tauri::command]
pub fn get_icon_manager_items(
    app_handle: tauri::AppHandle,
    icon_size: i32,
    custom_app_dir: Option<String>,
) -> Vec<IconManagerItem> {
    icons::get_icon_manager_items(app_handle, icon_size, custom_app_dir)
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
pub fn sync_new_customapp_icons(
    app_handle: tauri::AppHandle,
    custom_app_dir: Option<String>,
) -> Result<IconSyncResult, String> {
    icons::sync_new_customapp_icons(app_handle, custom_app_dir)
}

#[tauri::command]
pub fn sync_full_customapp_icons(
    app_handle: tauri::AppHandle,
    custom_app_dir: Option<String>,
) -> Result<IconSyncResult, String> {
    icons::sync_full_customapp_icons(app_handle, custom_app_dir)
}

#[tauri::command]
pub fn hide_desktop_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    icons::hide_desktop_icons(app_handle, targets)
}

#[tauri::command]
pub fn unhide_desktop_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    icons::unhide_desktop_icons(app_handle, targets)
}

#[tauri::command]
pub fn delete_desktop_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    icons::delete_desktop_icons(app_handle, targets)
}

#[tauri::command]
pub fn get_default_customapp_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    icons::get_default_customapp_dir(app_handle)
}

#[tauri::command]
pub fn launch_app(path: String) -> Result<(), String> {
    icons::launch_app(path)
}

#[tauri::command]
pub fn get_layout_payload(
    app_handle: tauri::AppHandle,
    key: String,
) -> Result<Option<String>, String> {
    layout_db::get_layout_payload(&app_handle, &key)
}

#[tauri::command]
pub fn set_layout_payload(
    app_handle: tauri::AppHandle,
    key: String,
    payload: String,
) -> Result<(), String> {
    layout_db::set_layout_payload(&app_handle, &key, &payload)
}

#[tauri::command]
pub async fn start_search_runtime(app_handle: tauri::AppHandle) -> Result<SearchRuntimeStatus, String> {
    tauri::async_runtime::spawn_blocking(move || everything::start_search_runtime(&app_handle))
        .await
        .map_err(|e| format!("Failed to join start_search_runtime task: {}", e))?
}

#[tauri::command]
pub fn get_search_runtime_status() -> Result<SearchRuntimeStatus, String> {
    everything::get_search_runtime_status()
}

#[tauri::command]
pub async fn search_files(
    app_handle: tauri::AppHandle,
    query: SearchQuery,
) -> Result<SearchPage, String> {
    tauri::async_runtime::spawn_blocking(move || everything::search_files(&app_handle, query))
        .await
        .map_err(|e| format!("Failed to join search_files task: {}", e))?
}
