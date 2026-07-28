use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::Manager;
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "windows")]
use window_vibrancy::{apply_acrylic, apply_mica, clear_acrylic, clear_mica};
#[cfg(windows)]
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};
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
const MAIN_WINDOW_SMALL_WIDTH: f64 = 800.0;
const MAIN_WINDOW_SMALL_HEIGHT: f64 = 600.0;

fn normalize_window_mode(value: &str) -> Option<&'static str> {
    match value.trim() {
        "fullscreen" => Some("fullscreen"),
        "large" => Some("large"),
        "medium" => Some("medium"),
        "small" => Some("small"),
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
        "default" => Some("default"),
        "nativeAcrylic" => Some("nativeAcrylic"),
        _ => None,
    }
}

#[cfg(windows)]
#[derive(Clone, Copy, PartialEq, Eq)]
enum MainWindowBackdrop {
    Default,
    Acrylic,
    Mica,
}

#[cfg(windows)]
fn resolve_main_window_backdrop(style: &str, persistent_enabled: bool) -> MainWindowBackdrop {
    match normalize_window_style(style).unwrap_or("default") {
        "nativeAcrylic" if persistent_enabled => MainWindowBackdrop::Mica,
        "nativeAcrylic" => MainWindowBackdrop::Acrylic,
        _ => MainWindowBackdrop::Default,
    }
}

#[cfg(windows)]
pub(crate) fn main_window_should_use_transparent_surface(
    _style: &str,
    _persistent_enabled: bool,
) -> bool {
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
fn apply_window_style_to_window(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    style: &str,
    theme_mode_override: Option<&str>,
) -> Result<(), String> {
    let dark = resolved_theme_is_dark(app, theme_mode_override);
    let persistent_enabled = main_window_persistent_enabled(app.state::<MainWindowState>().inner());
    let backdrop = resolve_main_window_backdrop(style, persistent_enabled);
    let transparent_surface = main_window_should_use_transparent_surface(style, persistent_enabled);
    let use_native_backdrop = !matches!(backdrop, MainWindowBackdrop::Default);
    let acrylic_tint = if dark {
        (24, 28, 36, 96)
    } else {
        (250, 250, 250, 4)
    };
    let background_color = resolve_main_window_background_color(transparent_surface, dark);

    let _ = set_window_immersive_dark_mode(window, use_native_backdrop && dark);
    let _ = window.set_background_color(Some(background_color));
    let _ = clear_acrylic(window);
    let _ = clear_mica(window);

    match backdrop {
        MainWindowBackdrop::Acrylic => apply_acrylic(window, Some(acrylic_tint))
            .map_err(|error| format!("Failed to apply acrylic: {}", error)),
        MainWindowBackdrop::Mica => apply_mica(window, Some(dark)).or_else(|mica_error| {
            apply_acrylic(window, Some(acrylic_tint)).map_err(|acrylic_error| {
                format!(
                    "Failed to apply mica: {}. Acrylic fallback also failed: {}",
                    mica_error, acrylic_error
                )
            })
        }),
        MainWindowBackdrop::Default => {
            let _ = set_window_immersive_dark_mode(window, false);
            Ok(())
        }
    }
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
    let window_style = if include_window_style {
        read_saved_window_style(app).unwrap_or("default")
    } else {
        "default"
    };
    let window_persistent_enabled =
        include_window_style && read_saved_window_persistent_enabled(app);

    format!(
        r#"
(() => {{
  const root = document.documentElement;
  const themeMode = {theme_mode:?};
  const windowStyle = {window_style:?};
  const windowPersistentEnabled = {window_persistent_enabled};
  const useDelayedReveal = windowStyle === 'nativeAcrylic' && !windowPersistentEnabled;
  root.classList.remove('dark', 'window-style-native-acrylic', 'window-style-native-mica');
  root.style.opacity = useDelayedReveal ? '0' : '1';
  root.style.transition = useDelayedReveal ? 'opacity 50ms ease-out' : '';

  if (
    themeMode === 'dark' ||
    (themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {{
    root.classList.add('dark');
  }}

  if (windowStyle === 'nativeAcrylic') {{
    root.classList.add(
      windowPersistentEnabled ? 'window-style-native-mica' : 'window-style-native-acrylic'
    );
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
    let style = read_saved_window_style(app).unwrap_or("default");
    let persistent_enabled = main_window_persistent_enabled(app.state::<MainWindowState>().inner());
    matches!(
        resolve_main_window_backdrop(style, persistent_enabled),
        MainWindowBackdrop::Acrylic
    )
}

#[cfg(not(windows))]
fn main_window_requires_focus_style_refresh(_app: &tauri::AppHandle) -> bool {
    false
}

pub(crate) fn schedule_main_window_style_refresh(app: tauri::AppHandle, delay_ms: u64) {
    if !main_window_requires_focus_style_refresh(&app) {
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(delay_ms));
        if let Err(error) = apply_main_window_style(&app, None, None) {
            eprintln!(
                "Warning: Failed to refresh main window native backdrop after focus change: {}",
                error
            );
        }
    });
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
    match read_saved_window_mode(app) {
        Some("large") => (MAIN_WINDOW_LARGE_WIDTH, MAIN_WINDOW_LARGE_HEIGHT),
        Some("small") => (MAIN_WINDOW_SMALL_WIDTH, MAIN_WINDOW_SMALL_HEIGHT),
        Some("fullscreen") | Some("medium") | None => {
            (MAIN_WINDOW_MEDIUM_WIDTH, MAIN_WINDOW_MEDIUM_HEIGHT)
        }
        Some(_) => (MAIN_WINDOW_MEDIUM_WIDTH, MAIN_WINDOW_MEDIUM_HEIGHT),
    }
}

pub(crate) fn read_saved_window_persistent_enabled(app: &tauri::AppHandle) -> bool {
    app.store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(WINDOW_PERSISTENT_SETTING_KEY)
                .and_then(|value| value.as_bool())
        })
        .unwrap_or(false)
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
