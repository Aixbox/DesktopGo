use crate::everything::{self, SearchPage, SearchQuery, SearchRuntimeStatus};
use crate::icons::{self, DesktopIcon, IconManagerItem, IconMutationTarget, IconSyncResult};
use crate::layout_db;
use crate::search_preview::{self, SearchPreview};
use crate::updater::{self, PendingUpdate, UpdateCheckResult, UpdaterConfigurationStatus};
use crate::MainWindowState;
use tauri::Manager;
use std::sync::atomic::Ordering;

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
pub fn notify_main_window_ready(
    app_handle: tauri::AppHandle,
    main_window_state: tauri::State<'_, MainWindowState>,
) -> Result<(), String> {
    main_window_state.ready.store(true, Ordering::SeqCst);

    if !main_window_state.pending_show.swap(false, Ordering::SeqCst) {
        return Ok(());
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }

    Ok(())
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
pub fn get_layout_payloads(
    app_handle: tauri::AppHandle,
    keys: Vec<String>,
) -> Result<Vec<layout_db::LayoutPayloadValue>, String> {
    layout_db::get_layout_payloads(&app_handle, &keys)
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
pub fn set_layout_payloads(
    app_handle: tauri::AppHandle,
    entries: Vec<layout_db::LayoutPayloadEntry>,
) -> Result<(), String> {
    layout_db::set_layout_payloads(&app_handle, &entries)
}

#[tauri::command]
pub async fn start_search_runtime(
    app_handle: tauri::AppHandle,
) -> Result<SearchRuntimeStatus, String> {
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

#[tauri::command]
pub async fn get_search_preview(path: String) -> Result<SearchPreview, String> {
    tauri::async_runtime::spawn_blocking(move || search_preview::get_search_preview(&path))
        .await
        .map_err(|e| format!("Failed to join get_search_preview task: {}", e))?
}

#[tauri::command]
pub async fn record_search_result_run(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        everything::record_search_result_run(&app_handle, &path)
    })
    .await
    .map_err(|e| format!("Failed to join record_search_result_run task: {}", e))?
}

#[tauri::command]
pub fn get_updater_configuration_status(
    app_handle: tauri::AppHandle,
) -> UpdaterConfigurationStatus {
    updater::get_updater_configuration_status(app_handle)
}

#[tauri::command]
pub async fn check_for_app_update(
    app_handle: tauri::AppHandle,
    pending_update: tauri::State<'_, PendingUpdate>,
) -> Result<UpdateCheckResult, String> {
    updater::check_for_app_update(app_handle, pending_update).await
}

#[tauri::command]
pub async fn install_app_update(
    app_handle: tauri::AppHandle,
    pending_update: tauri::State<'_, PendingUpdate>,
) -> Result<(), String> {
    updater::install_app_update(app_handle, pending_update).await
}
