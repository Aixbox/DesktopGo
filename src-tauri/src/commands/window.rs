use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{Emitter, Manager};

use crate::launchpad_shortcut::{self, LaunchpadShortcutState};
use crate::MainWindowState;

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
    crate::hide_main_window(window.app_handle());
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
    if crate::main_window_should_recreate_for_surface_mode(&app_handle, Some(style.as_str()), None)
    {
        if let Some(window) = app_handle.get_webview_window("main") {
            window
                .destroy()
                .map_err(|error| format!("Failed to recreate main window: {error}"))?;
        }
        return Ok(());
    }

    crate::apply_main_window_style(&app_handle, Some(style.as_str()), theme_mode.as_deref())
}

#[tauri::command]
pub fn update_launchpad_shortcut(
    app_handle: tauri::AppHandle,
    shortcut_state: tauri::State<'_, LaunchpadShortcutState>,
    shortcut: String,
) -> Result<String, String> {
    launchpad_shortcut::update_registration(&app_handle, shortcut_state.inner(), &shortcut)
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
pub fn get_main_window_always_on_top_enabled(
    main_window_state: tauri::State<'_, MainWindowState>,
) -> Result<bool, String> {
    Ok(crate::main_window_manual_always_on_top_enabled(
        main_window_state.inner(),
    ))
}

#[tauri::command]
pub fn set_main_window_always_on_top_enabled(
    app_handle: tauri::AppHandle,
    main_window_state: tauri::State<'_, MainWindowState>,
    enabled: bool,
) -> Result<bool, String> {
    crate::set_main_window_manual_always_on_top_enabled(main_window_state.inner(), enabled);
    crate::apply_main_window_runtime_mode(&app_handle, main_window_state.inner());
    Ok(enabled)
}

#[tauri::command]
pub fn close_settings_window(
    app_handle: tauri::AppHandle,
    return_to_main: bool,
) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("settings") {
        window
            .destroy()
            .map_err(|error| format!("Failed to destroy settings window: {error}"))?;
    }

    if return_to_main {
        let app_handle = app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(40));
            if app_handle.get_webview_window("main").is_some() {
                crate::show_main_window(&app_handle);
            } else {
                crate::request_main_window_show(&app_handle);
            }
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit(crate::SETTINGS_RETURNED_TO_MAIN_EVENT, ());
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub fn sync_window_persistent_state(
    app_handle: tauri::AppHandle,
    main_window_state: tauri::State<'_, MainWindowState>,
    enabled: bool,
) -> Result<bool, String> {
    crate::set_main_window_persistent_enabled(main_window_state.inner(), enabled);

    if crate::main_window_should_recreate_for_surface_mode(&app_handle, None, Some(enabled)) {
        if let Some(window) = app_handle.get_webview_window("main") {
            window
                .destroy()
                .map_err(|error| format!("Failed to recreate main window: {error}"))?;
        }
    }

    crate::apply_main_window_runtime_mode(&app_handle, main_window_state.inner());

    if enabled && app_handle.get_webview_window("main").is_some() {
        crate::apply_main_window_style(&app_handle, None, None)?;
    }

    if !enabled {
        if let Some(window) = app_handle.get_webview_window("main") {
            window
                .destroy()
                .map_err(|error| format!("Failed to destroy main window: {error}"))?;
        }
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit(
            crate::WINDOW_PERSISTENT_CHANGED_EVENT,
            crate::WindowPersistentChangedPayload { enabled },
        );
    }

    Ok(enabled)
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
            if let (Some(width), Some(height)) = (width, height) {
                let _ = window.set_size(tauri::LogicalSize::new(width, height));
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

    #[cfg(windows)]
    if let Some(window) = app_handle.get_webview_window("main") {
        let install_window = window.clone();
        if let Err(error) = window.run_on_main_thread(move || {
            if let Err(error) = crate::windows_drag_drop::install(&install_window) {
                eprintln!(
                    "Warning: Failed to refresh Windows Shell drag-drop support after WebView ready: {error}"
                );
            }
        }) {
            eprintln!(
                "Warning: Failed to schedule Windows Shell drag-drop refresh on the main thread: {error}"
            );
        }
    }

    if !main_window_state.pending_show.swap(false, Ordering::SeqCst) {
        return Ok(());
    }

    crate::show_main_window(&app_handle);
    Ok(())
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
