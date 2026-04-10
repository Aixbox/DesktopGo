use crate::everything::{self, SearchPage, SearchQuery, SearchRuntimeStatus};
use crate::icons::{self, DesktopIcon, IconManagerItem, IconMutationTarget, IconSyncResult};
use crate::layout_db;
use crate::search_preview::{self, SearchPreview};
use crate::updater::{self, PendingUpdate, UpdateCheckResult, UpdaterConfigurationStatus};
use crate::{LaunchpadShortcutState, MainWindowState};
use std::sync::atomic::Ordering;
use tauri::Manager;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct WindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
struct WindowFrameInsets {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

fn build_window_bounds(x: i32, y: i32, width: u32, height: u32) -> WindowBounds {
    WindowBounds {
        x,
        y,
        width,
        height,
    }
}

fn build_window_frame_insets(
    outer_position: tauri::PhysicalPosition<i32>,
    inner_position: tauri::PhysicalPosition<i32>,
    outer_size: tauri::PhysicalSize<u32>,
    inner_size: tauri::PhysicalSize<u32>,
) -> WindowFrameInsets {
    let left = inner_position.x - outer_position.x;
    let top = inner_position.y - outer_position.y;
    let right =
        (outer_position.x + outer_size.width as i32) - (inner_position.x + inner_size.width as i32);
    let bottom = (outer_position.y + outer_size.height as i32)
        - (inner_position.y + inner_size.height as i32);

    WindowFrameInsets {
        left,
        top,
        right,
        bottom,
    }
}

fn resolve_window_frame_insets(window: &tauri::WebviewWindow) -> WindowFrameInsets {
    let outer_position = window.outer_position().ok();
    let inner_position = window.inner_position().ok();
    let outer_size = window.outer_size().ok();
    let inner_size = window.inner_size().ok();

    match (outer_position, inner_position, outer_size, inner_size) {
        (Some(outer_position), Some(inner_position), Some(outer_size), Some(inner_size)) => {
            build_window_frame_insets(outer_position, inner_position, outer_size, inner_size)
        }
        _ => WindowFrameInsets::default(),
    }
}

fn resolve_window_work_area_bounds(window: &tauri::WebviewWindow) -> Option<WindowBounds> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let work_area = monitor.work_area();
    let insets = resolve_window_frame_insets(window);

    Some(build_window_bounds(
        work_area.position.x - insets.left,
        work_area.position.y - insets.top,
        work_area.size.width,
        work_area.size.height,
    ))
}

#[tauri::command]
pub fn toggle_window(window: tauri::Window) {
    crate::hide_main_window(&window.app_handle());
}

#[tauri::command]
pub fn activate_main_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    crate::request_main_window_show(&app_handle);
    Ok(())
}

#[tauri::command]
pub fn apply_window_style(
    app_handle: tauri::AppHandle,
    style: String,
    theme_mode: Option<String>,
) -> Result<(), String> {
    crate::apply_main_window_style(&app_handle, Some(style.as_str()), theme_mode.as_deref())
}

#[tauri::command]
pub fn update_launchpad_shortcut(
    app_handle: tauri::AppHandle,
    shortcut_state: tauri::State<'_, LaunchpadShortcutState>,
    shortcut: String,
) -> Result<String, String> {
    crate::update_launchpad_shortcut_registration(&app_handle, shortcut_state.inner(), &shortcut)
}

#[tauri::command]
pub fn get_launch_on_startup_enabled(app_handle: tauri::AppHandle) -> Result<bool, String> {
    crate::read_launch_on_startup_enabled(&app_handle)
}

#[tauri::command]
pub fn update_launch_on_startup_enabled(
    app_handle: tauri::AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    crate::set_launch_on_startup_enabled(&app_handle, enabled)
}

#[tauri::command]
pub fn activate_settings_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    crate::show_settings_window(&app_handle)
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
            let _ = window.set_fullscreen(false);
            let _ = window.unmaximize();

            if let Some(bounds) = resolve_window_work_area_bounds(&window) {
                let _ = window.set_position(tauri::PhysicalPosition::new(bounds.x, bounds.y));
                let _ = window.set_size(tauri::PhysicalSize::new(bounds.width, bounds.height));
            }
        } else {
            let _ = window.set_fullscreen(false);
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

    crate::show_main_window(&app_handle);

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_window_bounds_preserves_monitor_origin_and_size() {
        assert_eq!(
            build_window_bounds(-1920, 0, 1920, 1080),
            WindowBounds {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
            }
        );
    }

    #[test]
    fn build_window_bounds_supports_non_primary_monitor_offsets() {
        assert_eq!(
            build_window_bounds(2560, -180, 2560, 1440),
            WindowBounds {
                x: 2560,
                y: -180,
                width: 2560,
                height: 1440,
            }
        );
    }

    #[test]
    fn build_window_frame_insets_extracts_hidden_shadow_offsets() {
        assert_eq!(
            build_window_frame_insets(
                tauri::PhysicalPosition::new(-8, 0),
                tauri::PhysicalPosition::new(0, 0),
                tauri::PhysicalSize::new(1936, 1048),
                tauri::PhysicalSize::new(1920, 1040),
            ),
            WindowFrameInsets {
                left: 8,
                top: 0,
                right: 8,
                bottom: 8,
            }
        );
    }
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
