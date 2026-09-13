use std::sync::atomic::Ordering;

use tauri::Manager;
use tauri_plugin_store::StoreExt;

#[cfg(windows)]
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_USE_IMMERSIVE_DARK_MODE,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWM_WINDOW_CORNER_PREFERENCE,
};
#[cfg(windows)]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

use crate::{storage_profile, MainWindowState};

const WINDOW_PERSISTENT_SETTING_KEY: &str = "windowPersistent";
const THEME_MODE_SETTING_KEY: &str = "themeMode";
const WINDOW_MODE_SETTING_KEY: &str = "windowMode";
const WINDOW_STYLE_SETTING_KEY: &str = "windowStyle";
const MAIN_WINDOW_LARGE_WIDTH: f64 = 1600.0;
const MAIN_WINDOW_LARGE_HEIGHT: f64 = 900.0;
const MAIN_WINDOW_MEDIUM_WIDTH: f64 = 1280.0;
const MAIN_WINDOW_MEDIUM_HEIGHT: f64 = 720.0;
// 与 window-frame.css 中的留白一致，窗口尺寸额外容纳四周阴影。
const WINDOW_SHADOW_INSET: f64 = 16.0;

pub(crate) fn window_size_with_shadow(width: f64, height: f64) -> (f64, f64) {
    (
        width + WINDOW_SHADOW_INSET * 2.0,
        height + WINDOW_SHADOW_INSET * 2.0,
    )
}

fn normalize_window_mode(value: &str) -> Option<&'static str> {
    match value.trim() {
        "fullscreen" => Some("fullscreen"),
        "large" => Some("large"),
        "medium" => Some("medium"),
        _ => None,
    }
}

fn read_saved_window_mode(app: &tauri::AppHandle) -> Option<&'static str> {
    app.store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(WINDOW_MODE_SETTING_KEY)
                .and_then(|value| value.as_str().and_then(normalize_window_mode))
        })
}

fn normalize_theme_mode(value: &str) -> Option<&'static str> {
    match value.trim() {
        "system" => Some("system"),
        "dark" => Some("dark"),
        "light" => Some("light"),
        _ => None,
    }
}

fn read_saved_theme_mode(app: &tauri::AppHandle) -> Option<&'static str> {
    app.store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(THEME_MODE_SETTING_KEY)
                .and_then(|value| value.as_str().and_then(normalize_theme_mode))
        })
}

#[cfg(windows)]
fn system_prefers_light_theme() -> Option<bool> {
    let personalize = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
        .ok()?;

    personalize
        .get_value::<u32, _>("AppsUseLightTheme")
        .ok()
        .map(|value| value != 0)
}

#[cfg(windows)]
pub(crate) fn resolved_theme_is_dark(
    app: &tauri::AppHandle,
    theme_mode_override: Option<&str>,
) -> bool {
    match theme_mode_override
        .and_then(normalize_theme_mode)
        .or_else(|| read_saved_theme_mode(app))
    {
        Some("dark") => true,
        Some("light") => false,
        Some("system") | None => !system_prefers_light_theme().unwrap_or(true),
        Some(_) => false,
    }
}

fn normalize_window_style(value: &str) -> Option<&'static str> {
    match value.trim() {
        "default" | "nativeAcrylic" => Some("default"),
        _ => None,
    }
}

#[cfg(windows)]
pub(crate) fn main_window_should_use_transparent_surface(
    _style: &str,
    _persistent_enabled: bool,
) -> bool {
    // Keep the host transparent so CSS can expose the desktop at its rounded corners.
    true
}

pub(crate) fn resolve_main_window_background_color(
    transparent_surface: bool,
    dark: bool,
) -> tauri::utils::config::Color {
    if transparent_surface {
        tauri::utils::config::Color(0, 0, 0, 0)
    } else if dark {
        tauri::utils::config::Color(18, 22, 30, 255)
    } else {
        tauri::utils::config::Color(244, 246, 250, 255)
    }
}

pub(crate) fn read_saved_window_style(app: &tauri::AppHandle) -> Option<&'static str> {
    app.store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(WINDOW_STYLE_SETTING_KEY)
                .and_then(|value| value.as_str().and_then(normalize_window_style))
        })
}

#[cfg(windows)]
fn set_window_immersive_dark_mode(window: &tauri::WebviewWindow, dark: bool) -> Result<(), String> {
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("Failed to resolve main HWND: {}", error))?;

    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &(dark as u32) as *const _ as _,
            std::mem::size_of::<u32>() as u32,
        )
        .map_err(|error| format!("Failed to set immersive dark mode: {}", error))
    }
}

#[cfg(windows)]
pub(crate) fn disable_window_corner_preference(
    window: &tauri::WebviewWindow,
) -> Result<(), String> {
    set_window_corner_preference(window, DWMWCP_DONOTROUND)
}

#[cfg(windows)]
fn set_window_corner_preference(
    window: &tauri::WebviewWindow,
    preference: DWM_WINDOW_CORNER_PREFERENCE,
) -> Result<(), String> {
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("Failed to resolve main HWND: {}", error))?;

    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &preference as *const _ as _,
            std::mem::size_of_val(&preference) as u32,
        )
        .map_err(|error| format!("Failed to set native window corner preference: {}", error))
    }
}

#[cfg(windows)]
pub(crate) fn remove_native_window_border(window: &tauri::WebviewWindow) -> Result<(), String> {
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("Failed to resolve window HWND: {}", error))?;

    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &DWMWA_COLOR_NONE as *const _ as _,
            std::mem::size_of_val(&DWMWA_COLOR_NONE) as u32,
        )
        .map_err(|error| format!("Failed to remove native window border: {}", error))
    }
}

#[cfg(windows)]
fn apply_window_style_to_window(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    style: &str,
    theme_mode_override: Option<&str>,
) -> Result<(), String> {
    let _ = (app, style, theme_mode_override);
    let _ = set_window_immersive_dark_mode(window, false);
    let _ = disable_window_corner_preference(window);
    let _ = remove_native_window_border(window);
    Ok(())
}

#[cfg(not(windows))]
fn apply_window_style_to_window(
    _app: &tauri::AppHandle,
    _window: &tauri::WebviewWindow,
    _style: &str,
    _theme_mode_override: Option<&str>,
) -> Result<(), String> {
    Ok(())
}

pub(crate) fn apply_main_window_style(
    app: &tauri::AppHandle,
    style: Option<&str>,
    theme_mode_override: Option<&str>,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let resolved_style = style
        .and_then(normalize_window_style)
        .or_else(|| read_saved_window_style(app))
        .unwrap_or("default");
    apply_window_style_to_window(app, &window, resolved_style, theme_mode_override)
}

pub(crate) fn build_window_bootstrap_script(
    app: &tauri::AppHandle,
    include_window_style: bool,
) -> String {
    let theme_mode = read_saved_theme_mode(app).unwrap_or("system");
    let _ = include_window_style;

    format!(
        r#"
(() => {{
  const root = document.documentElement;
  if (!root) return;
  const themeMode = {theme_mode:?};
  root.classList.remove('dark', 'window-style-native-acrylic', 'window-style-native-mica');
  root.style.opacity = '1';
  root.style.transition = '';

  if (
    themeMode === 'dark' ||
    (themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {{
    root.classList.add('dark');
  }}

}})();
"#
    )
}

pub(crate) fn main_window_uses_delayed_reveal(app: &tauri::AppHandle) -> bool {
    main_window_requires_focus_style_refresh(app)
}

#[cfg(windows)]
pub(crate) fn main_window_should_recreate_for_surface_mode(
    app: &tauri::AppHandle,
    style_override: Option<&str>,
    persistent_override: Option<bool>,
) -> bool {
    let Some(_window) = app.get_webview_window("main") else {
        return false;
    };
    let style = style_override
        .and_then(normalize_window_style)
        .or_else(|| read_saved_window_style(app))
        .unwrap_or("default");
    let persistent_enabled = persistent_override
        .unwrap_or_else(|| main_window_persistent_enabled(app.state::<MainWindowState>().inner()));
    let desired_transparent = main_window_should_use_transparent_surface(style, persistent_enabled);
    let current_transparent = app
        .state::<MainWindowState>()
        .transparent_surface_enabled
        .load(Ordering::SeqCst);
    desired_transparent != current_transparent
}

#[cfg(not(windows))]
pub(crate) fn main_window_should_recreate_for_surface_mode(
    _app: &tauri::AppHandle,
    _style_override: Option<&str>,
    _persistent_override: Option<bool>,
) -> bool {
    false
}

#[cfg(windows)]
fn main_window_requires_focus_style_refresh(app: &tauri::AppHandle) -> bool {
    let _ = app;
    false
}

#[cfg(not(windows))]
fn main_window_requires_focus_style_refresh(_app: &tauri::AppHandle) -> bool {
    false
}

pub(crate) fn schedule_main_window_style_refresh(app: tauri::AppHandle, delay_ms: u64) {
    let _ = (app, delay_ms);
}

pub(crate) fn sync_main_window_dom_visibility(window: &tauri::WebviewWindow, delayed_reveal: bool) {
    let script = if delayed_reveal {
        "document.documentElement.style.transition='opacity 50ms ease-out';document.documentElement.style.opacity='0';"
    } else {
        "document.documentElement.style.transition='';document.documentElement.style.opacity='1';"
    };
    let _ = window.eval(script);
}

pub(crate) fn resolve_initial_main_window_size(app: &tauri::AppHandle) -> (f64, f64) {
    let (width, height) = match read_saved_window_mode(app) {
        Some("large") => (MAIN_WINDOW_LARGE_WIDTH, MAIN_WINDOW_LARGE_HEIGHT),
        // 已删除的 small 模式在读取时归一化为 None，与前端一起回退到中等窗口。
        Some("fullscreen") | Some("medium") | None => {
            (MAIN_WINDOW_MEDIUM_WIDTH, MAIN_WINDOW_MEDIUM_HEIGHT)
        }
        Some(_) => (MAIN_WINDOW_MEDIUM_WIDTH, MAIN_WINDOW_MEDIUM_HEIGHT),
    };
    window_size_with_shadow(width, height)
}

pub(crate) fn read_saved_window_persistent_enabled(app: &tauri::AppHandle) -> bool {
    let saved_value = app
        .store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(WINDOW_PERSISTENT_SETTING_KEY)
                .and_then(|value| value.as_bool())
        });
    resolve_window_persistent_enabled(saved_value)
}

fn resolve_window_persistent_enabled(saved_value: Option<bool>) -> bool {
    saved_value.unwrap_or(true)
}

pub(crate) fn main_window_persistent_enabled(state: &MainWindowState) -> bool {
    state.window_persistent_enabled.load(Ordering::SeqCst)
}

pub(crate) fn set_main_window_persistent_enabled(state: &MainWindowState, enabled: bool) {
    state
        .window_persistent_enabled
        .store(enabled, Ordering::SeqCst);
}

fn main_window_should_always_on_top(state: &MainWindowState) -> bool {
    !state.window_persistent_enabled.load(Ordering::SeqCst)
        || state.manual_always_on_top_enabled.load(Ordering::SeqCst)
}

pub(crate) fn apply_main_window_runtime_mode(app: &tauri::AppHandle, state: &MainWindowState) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let persistent_enabled = main_window_persistent_enabled(state);
    let _ = window.set_skip_taskbar(!persistent_enabled);
    let _ = window.set_resizable(false);
    let _ = window.set_minimizable(persistent_enabled);
    let _ = window.set_maximizable(false);
    let _ = window.set_always_on_top(main_window_should_always_on_top(state));
}

pub(crate) fn main_window_manual_always_on_top_enabled(state: &MainWindowState) -> bool {
    state.manual_always_on_top_enabled.load(Ordering::SeqCst)
}

pub(crate) fn set_main_window_manual_always_on_top_enabled(state: &MainWindowState, enabled: bool) {
    state
        .manual_always_on_top_enabled
        .store(enabled, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::{resolve_window_persistent_enabled, window_size_with_shadow};

    #[test]
    fn framed_window_preserves_content_size_at_supported_scales() {
        for (content_width, content_height) in [(800.0, 600.0), (1280.0, 720.0), (1600.0, 900.0)] {
            let (width, height) = window_size_with_shadow(content_width, content_height);
            for scale in [1.0, 1.25, 1.5, 2.0] {
                let physical_size =
                    tauri::LogicalSize::new(width, height).to_physical::<u32>(scale);
                let shadow_span = 32.0 * scale;
                assert_eq!(
                    physical_size.width as f64 - shadow_span,
                    content_width * scale
                );
                assert_eq!(
                    physical_size.height as f64 - shadow_span,
                    content_height * scale
                );
            }
        }
    }

    #[test]
    fn window_persistent_defaults_to_enabled_without_a_saved_value() {
        assert!(resolve_window_persistent_enabled(None));
    }

    #[test]
    fn window_persistent_preserves_saved_boolean_values() {
        assert!(!resolve_window_persistent_enabled(Some(false)));
        assert!(resolve_window_persistent_enabled(Some(true)));
    }
}
