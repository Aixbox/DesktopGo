mod agent;
mod ai;
mod autostart;
mod commands;
mod everything;
mod icons;
mod layout_db;
mod search_preview;
mod shell_context_menu;
mod storage_profile;
mod updater;
#[cfg(windows)]
mod windows_drag_drop;

use agent::icon_agent::{ai_organize_icons_agent, ai_organize_record_apply};
use ai::{ai_chat, ai_classify_icons};
use commands::{
    activate_main_window, activate_settings_window, apply_window_style, check_for_app_update,
    close_settings_window, create_icon_entry, delete_icons, extract_website_icon,
    get_drag_preview_icon, get_icon_manager_items, get_icons, get_launch_on_startup_enabled,
    get_layout_payload, get_layout_payloads, get_main_window_always_on_top_enabled,
    get_search_preview, get_search_runtime_status, get_updater_configuration_status, hide_icons,
    import_dropped_paths, install_app_update, launch_app, notify_main_window_ready,
    optimize_icon_image, record_search_result_run, scan_invalid_icons, search_files,
    set_layout_payload, set_layout_payloads, set_main_window_always_on_top_enabled,
    set_window_mode, show_shell_context_menu, start_search_runtime, sync_window_persistent_state,
    toggle_window, unhide_icons, update_icon_entry, update_launch_on_startup_enabled,
    update_launchpad_shortcut,
};
#[cfg(windows)]
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Listener, Manager, RunEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;
#[cfg(target_os = "windows")]
use window_vibrancy::{apply_acrylic, apply_mica, clear_acrylic, clear_mica};
#[cfg(windows)]
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{SetActiveWindow, SetFocus};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, SetForegroundWindow, SetWindowPos, HWND_TOP, SWP_NOMOVE, SWP_NOSIZE,
};
#[cfg(windows)]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

#[cfg(windows)]
static WINDOWS_CONSOLE_APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();
#[cfg(windows)]
static WINDOWS_CONSOLE_EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);

const MAIN_WINDOW_FOCUS_RETRY_DELAY_MS: u64 = 40;
const MAIN_WINDOW_BLUR_GUARD_MS: u64 = 1200;
pub(crate) const DEFAULT_LAUNCHPAD_SHORTCUT: &str = "Ctrl+Space";
#[cfg(any(not(windows), not(debug_assertions)))]
const DEFAULT_LAUNCH_ON_STARTUP: bool = true;
const LAUNCH_ON_STARTUP_SETTING_KEY: &str = "launchOnStartup";
const WINDOW_PERSISTENT_SETTING_KEY: &str = "windowPersistent";
const LANGUAGE_SETTING_KEY: &str = "language";
const THEME_MODE_SETTING_KEY: &str = "themeMode";
const WINDOW_MODE_SETTING_KEY: &str = "windowMode";
const WINDOW_STYLE_SETTING_KEY: &str = "windowStyle";
const WINDOWS_RUN_VALUE_NAME: &str = "DesktopGo";
const INSTALL_LANGUAGE_MARKER_FILE_NAME: &str = ".install_language";
const SHOW_ON_LAUNCH_MARKER_FILE_NAME: &str = ".show_on_launch";
const MAIN_WINDOW_LARGE_WIDTH: f64 = 1600.0;
const MAIN_WINDOW_LARGE_HEIGHT: f64 = 900.0;
const MAIN_WINDOW_MEDIUM_WIDTH: f64 = 1280.0;
const MAIN_WINDOW_MEDIUM_HEIGHT: f64 = 720.0;
const MAIN_WINDOW_SMALL_WIDTH: f64 = 800.0;
const MAIN_WINDOW_SMALL_HEIGHT: f64 = 600.0;
const SETTINGS_WINDOW_WIDTH: f64 = 800.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 600.0;
const TRAY_ICON_ID: &str = "main";
const TRAY_STATUS_MENU_ITEM_ID: &str = "tray-status";
const TRAY_TOGGLE_MENU_ITEM_ID: &str = "tray-toggle-launchpad";
const TRAY_SETTINGS_MENU_ITEM_ID: &str = "tray-open-settings";
const TRAY_QUIT_MENU_ITEM_ID: &str = "tray-quit";
const LANGUAGE_CHANGED_EVENT: &str = "desktopgo://language-changed";
const MAIN_WINDOW_SHOWN_EVENT: &str = "launchpad:shown";
pub(crate) const WINDOW_PERSISTENT_CHANGED_EVENT: &str = "desktopgo://window-persistent-changed";
pub(crate) const SETTINGS_RETURNED_TO_MAIN_EVENT: &str = "desktopgo://settings-returned-to-main";

struct MainWindowState {
    ready: AtomicBool,
    pending_show: AtomicBool,
    suppress_blur: AtomicBool,
    window_persistent_enabled: AtomicBool,
    transparent_surface_enabled: AtomicBool,
    manual_always_on_top_enabled: AtomicBool,
    suppress_blur_until: Mutex<Option<Instant>>,
    last_show_request: Mutex<Option<Instant>>,
}

pub(crate) struct LaunchpadShortcutState {
    current: Mutex<Option<String>>,
}

#[derive(Clone)]
struct TrayMenuItems {
    status_item: MenuItem<tauri::Wry>,
    toggle_item: MenuItem<tauri::Wry>,
    settings_item: MenuItem<tauri::Wry>,
    quit_item: MenuItem<tauri::Wry>,
}

pub(crate) struct TrayState {
    language: Mutex<AppLanguage>,
    menu_items: Mutex<Option<TrayMenuItems>>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum AppLanguage {
    Zh,
    En,
}

#[derive(Clone, Copy)]
struct TrayMenuText {
    status_visible: &'static str,
    status_hidden: &'static str,
    show_launchpad: &'static str,
    hide_launchpad: &'static str,
    open_settings: &'static str,
    quit: &'static str,
    tooltip: &'static str,
    settings_window_title: &'static str,
}

#[derive(Deserialize)]
struct LanguageChangedPayload {
    language: String,
}

#[derive(Clone, Copy, Serialize)]
pub(crate) struct WindowPersistentChangedPayload {
    enabled: bool,
}

impl Default for LaunchpadShortcutState {
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
        }
    }
}

impl Default for MainWindowState {
    fn default() -> Self {
        Self {
            ready: AtomicBool::new(false),
            pending_show: AtomicBool::new(false),
            suppress_blur: AtomicBool::new(false),
            window_persistent_enabled: AtomicBool::new(false),
            transparent_surface_enabled: AtomicBool::new(true),
            manual_always_on_top_enabled: AtomicBool::new(false),
            suppress_blur_until: Mutex::new(None),
            last_show_request: Mutex::new(None),
        }
    }
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            language: Mutex::new(AppLanguage::Zh),
            menu_items: Mutex::new(None),
        }
    }
}

impl AppLanguage {
    fn from_code(value: &str) -> Self {
        match value {
            "en" => Self::En,
            _ => Self::Zh,
        }
    }

    fn tray_menu_text(self) -> TrayMenuText {
        match self {
            Self::En => TrayMenuText {
                status_visible: "Launchpad: visible",
                status_hidden: "Launchpad: hidden",
                show_launchpad: "Show Launchpad",
                hide_launchpad: "Hide Launchpad",
                open_settings: "Open Settings",
                quit: "Quit DesktopGo",
                tooltip: "DesktopGo",
                settings_window_title: "Settings",
            },
            Self::Zh => TrayMenuText {
                status_visible: "启动台当前: 已显示",
                status_hidden: "启动台当前: 已隐藏",
                show_launchpad: "显示启动台",
                hide_launchpad: "隐藏启动台",
                open_settings: "打开设置",
                quit: "退出 DesktopGo",
                tooltip: "DesktopGo",
                settings_window_title: "设置",
            },
        }
    }
}

impl TrayState {
    fn language(&self) -> AppLanguage {
        *self
            .language
            .lock()
            .expect("failed to lock tray language state")
    }

    fn set_language(&self, language: AppLanguage) {
        *self
            .language
            .lock()
            .expect("failed to lock tray language state") = language;
    }

    fn menu_items(&self) -> Option<TrayMenuItems> {
        self.menu_items
            .lock()
            .expect("failed to lock tray menu state")
            .clone()
    }

    fn set_menu_items(&self, items: TrayMenuItems) {
        *self
            .menu_items
            .lock()
            .expect("failed to lock tray menu state") = Some(items);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(updater::PendingUpdate::default())
        .manage(MainWindowState::default())
        .manage(LaunchpadShortcutState::default())
        .manage(TrayState::default());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    let app = builder
        .setup(|app| {
            storage_profile::ensure_dev_profile_seeded(app.handle())?;
            let initial_language = initialize_app_language(app.handle());
            let tray_state = app.state::<TrayState>();
            tray_state.set_language(AppLanguage::from_code(initial_language));
            let main_window_state = app.state::<MainWindowState>();
            main_window_state.window_persistent_enabled.store(
                read_saved_window_persistent_enabled(app.handle()),
                Ordering::SeqCst,
            );

            let (menu, menu_items) = build_tray_menu(app.handle())?;
            tray_state.set_menu_items(menu_items);

            let _tray = TrayIconBuilder::with_id(TRAY_ICON_ID)
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(tray_state.language().tray_menu_text().tooltip)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    TRAY_TOGGLE_MENU_ITEM_ID => {
                        toggle_main_window_visibility(app);
                    }
                    TRAY_SETTINGS_MENU_ITEM_ID => {
                        if let Err(error) = show_settings_window(app) {
                            eprintln!("Warning: Failed to open settings window from tray: {error}");
                        }
                    }
                    TRAY_QUIT_MENU_ITEM_ID => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    let app = tray.app_handle();
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            ..
                        } => request_main_window_show(app),
                        TrayIconEvent::Click {
                            button: MouseButton::Right,
                            ..
                        } => refresh_tray_menu(app),
                        _ => {}
                    }
                })
                .build(app)?;

            let tray_refresh_handle = app.handle().clone();
            app.listen_any(LANGUAGE_CHANGED_EVENT, move |event| {
                if let Ok(payload) = serde_json::from_str::<LanguageChangedPayload>(event.payload())
                {
                    if let Some(language) = normalize_app_language(&payload.language) {
                        tray_refresh_handle
                            .state::<TrayState>()
                            .set_language(AppLanguage::from_code(language));
                        refresh_tray_menu(&tray_refresh_handle);
                        refresh_settings_window_title(&tray_refresh_handle);
                    }
                }
            });

            create_main_window(app.handle());
            install_windows_console_exit_handler(app.handle());
            initialize_launch_on_startup(app.handle());
            initialize_launchpad_shortcut(app.handle());

            // 安装/更新后首次启动时，自动显示启动台窗口。
            // 判断依据：安装器在安装目录写入的 .show_on_launch 标记文件。
            if should_show_on_launch(app.handle()) {
                request_main_window_show(app.handle());
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_window,
            activate_main_window,
            activate_settings_window,
            get_icons,
            get_icon_manager_items,
            launch_app,
            show_shell_context_menu,
            set_window_mode,
            import_dropped_paths,
            create_icon_entry,
            update_icon_entry,
            extract_website_icon,
            hide_icons,
            unhide_icons,
            delete_icons,
            scan_invalid_icons,
            get_layout_payload,
            get_layout_payloads,
            set_layout_payload,
            set_layout_payloads,
            start_search_runtime,
            get_search_runtime_status,
            search_files,
            get_search_preview,
            record_search_result_run,
            notify_main_window_ready,
            apply_window_style,
            get_main_window_always_on_top_enabled,
            set_main_window_always_on_top_enabled,
            get_updater_configuration_status,
            check_for_app_update,
            install_app_update,
            get_drag_preview_icon,
            optimize_icon_image,
            update_launchpad_shortcut,
            close_settings_window,
            sync_window_persistent_state,
            get_launch_on_startup_enabled,
            update_launch_on_startup_enabled,
            ai_classify_icons,
            ai_chat,
            ai_organize_icons_agent,
            ai_organize_record_apply
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            everything::shutdown_search_runtime(app_handle);
        }
    });
}

fn should_show_on_launch(_app: &tauri::AppHandle) -> bool {
    let exe = std::env::current_exe().ok();
    let marker = exe
        .as_ref()
        .and_then(|p| p.parent())
        .map(|dir| dir.join(SHOW_ON_LAUNCH_MARKER_FILE_NAME));
    match marker {
        Some(path) if path.exists() => {
            let _ = std::fs::remove_file(&path);
            true
        }
        _ => false,
    }
}

fn build_tray_menu(app: &tauri::AppHandle) -> tauri::Result<(Menu<tauri::Wry>, TrayMenuItems)> {
    let language = app.state::<TrayState>().language();
    let menu_text = language.tray_menu_text();
    let launchpad_visible = main_window_is_visible(app);

    let status_item = MenuItem::with_id(
        app,
        TRAY_STATUS_MENU_ITEM_ID,
        if launchpad_visible {
            menu_text.status_visible
        } else {
            menu_text.status_hidden
        },
        false,
        None::<&str>,
    )?;
    let toggle_item = MenuItem::with_id(
        app,
        TRAY_TOGGLE_MENU_ITEM_ID,
        if launchpad_visible {
            menu_text.hide_launchpad
        } else {
            menu_text.show_launchpad
        },
        true,
        None::<&str>,
    )?;
    let settings_item = MenuItem::with_id(
        app,
        TRAY_SETTINGS_MENU_ITEM_ID,
        menu_text.open_settings,
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(
        app,
        TRAY_QUIT_MENU_ITEM_ID,
        menu_text.quit,
        true,
        None::<&str>,
    )?;
    let first_separator = PredefinedMenuItem::separator(app)?;
    let second_separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &status_item,
            &first_separator,
            &toggle_item,
            &settings_item,
            &second_separator,
            &quit_item,
        ],
    )?;

    Ok((
        menu,
        TrayMenuItems {
            status_item,
            toggle_item,
            settings_item,
            quit_item,
        },
    ))
}

fn normalize_app_language(value: &str) -> Option<&'static str> {
    match value.trim() {
        "zh" => Some("zh"),
        "en" => Some("en"),
        _ => None,
    }
}

fn read_saved_language(app: &tauri::AppHandle) -> Option<&'static str> {
    app.store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(LANGUAGE_SETTING_KEY)
                .and_then(|value| value.as_str().and_then(normalize_app_language))
        })
}

fn save_language_setting(app: &tauri::AppHandle, language: &str) -> Result<(), String> {
    let store = app
        .store(storage_profile::settings_store_path())
        .map_err(|error| format!("无法打开本地语言设置存储：{}", error))?;
    store.set(LANGUAGE_SETTING_KEY, language.to_string());
    store
        .save()
        .map_err(|error| format!("无法保存界面语言设置：{}", error))
}

fn normalize_window_mode(value: &str) -> Option<&'static str> {
    match value.trim() {
        "fullscreen" => Some("fullscreen"),
        "large" => Some("large"),
        "medium" => Some("medium"),
        "small" => Some("small"),
        _ => None,
    }
}

pub(crate) fn read_saved_window_mode(app: &tauri::AppHandle) -> Option<&'static str> {
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
fn resolved_theme_is_dark(app: &tauri::AppHandle, theme_mode_override: Option<&str>) -> bool {
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
fn main_window_should_use_transparent_surface(_style: &str, _persistent_enabled: bool) -> bool {
    // 所有 backdrop 都需要 webview 透明:
    // - Default 依赖 CSS `.launchpad-bg` 半透明层
    // - Acrylic 依赖 window_vibrancy 原生合成
    // - Mica 依赖 DWM 在窗口装饰层绘制,webview 必须透明才能透出
    true
}

fn resolve_main_window_background_color(
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

fn read_saved_window_style(app: &tauri::AppHandle) -> Option<&'static str> {
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

    // Rebuild the native backdrop each time theme or runtime mode changes, otherwise
    // Windows may keep the previous acrylic or mica appearance.
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

fn set_main_window_blur_guard(state: &MainWindowState, duration_ms: u64) {
    state.suppress_blur.store(true, Ordering::SeqCst);
    if let Ok(mut guard) = state.suppress_blur_until.lock() {
        *guard = Some(Instant::now() + Duration::from_millis(duration_ms));
    }
}

fn clear_main_window_blur_guard(state: &MainWindowState) {
    state.suppress_blur.store(false, Ordering::SeqCst);
    if let Ok(mut guard) = state.suppress_blur_until.lock() {
        *guard = None;
    }
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

    // “窗口常驻”开启后，主窗口应更接近普通桌面窗口：
    // 在任务栏可见、可最小化，但窗口尺寸仍只允许通过右键菜单切换，
    // 不允许边缘拖拽缩放或原生最大化。
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

fn main_window_blur_guard_active(state: &MainWindowState) -> bool {
    state
        .suppress_blur_until
        .lock()
        .ok()
        .and_then(|guard| *guard)
        .map(|until| Instant::now() < until)
        .unwrap_or(false)
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

fn build_window_bootstrap_script(app: &tauri::AppHandle, include_window_style: bool) -> String {
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

fn main_window_uses_delayed_reveal(app: &tauri::AppHandle) -> bool {
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

fn schedule_main_window_style_refresh(app: tauri::AppHandle, delay_ms: u64) {
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

fn sync_main_window_dom_visibility(window: &tauri::WebviewWindow, delayed_reveal: bool) {
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

fn consume_install_language_marker() -> Option<&'static str> {
    let marker = std::env::current_exe()
        .ok()
        .as_ref()
        .and_then(|path| path.parent())
        .map(|dir| dir.join(INSTALL_LANGUAGE_MARKER_FILE_NAME));

    let Some(path) = marker else {
        return None;
    };

    let language = std::fs::read_to_string(&path)
        .ok()
        .as_deref()
        .and_then(normalize_app_language);
    let _ = std::fs::remove_file(&path);
    language
}

fn initialize_app_language(app: &tauri::AppHandle) -> &'static str {
    let saved_language = read_saved_language(app);
    let install_language = consume_install_language_marker();

    if let Some(language) = saved_language {
        return language;
    }

    if let Some(language) = install_language {
        if let Err(error) = save_language_setting(app, language) {
            eprintln!(
                "Warning: Failed to persist installer language setting `{}`: {}",
                language, error
            );
        }
        return language;
    }

    "zh"
}

fn main_window_is_visible(app: &tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

fn try_refresh_tray_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    let tray_state = app.state::<TrayState>();
    let Some(menu_items) = tray_state.menu_items() else {
        return Ok(());
    };

    let menu_text = tray_state.language().tray_menu_text();
    let launchpad_visible = main_window_is_visible(app);

    menu_items.status_item.set_text(if launchpad_visible {
        menu_text.status_visible
    } else {
        menu_text.status_hidden
    })?;
    menu_items.toggle_item.set_text(if launchpad_visible {
        menu_text.hide_launchpad
    } else {
        menu_text.show_launchpad
    })?;
    menu_items.settings_item.set_text(menu_text.open_settings)?;
    menu_items.quit_item.set_text(menu_text.quit)?;

    if let Some(tray) = app.tray_by_id(TRAY_ICON_ID) {
        tray.set_tooltip(Some(menu_text.tooltip))?;
    }

    Ok(())
}

fn refresh_tray_menu(app: &tauri::AppHandle) {
    if let Err(error) = try_refresh_tray_menu(app) {
        eprintln!("Warning: Failed to refresh tray menu: {error}");
    }
}

fn refresh_settings_window_title(app: &tauri::AppHandle) {
    let title = app
        .state::<TrayState>()
        .language()
        .tray_menu_text()
        .settings_window_title;

    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_title(title);
    }
}

fn read_saved_launch_on_startup(app: &tauri::AppHandle) -> Option<bool> {
    app.store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(LAUNCH_ON_STARTUP_SETTING_KEY)
                .and_then(|value| value.as_bool())
        })
}

fn read_saved_window_persistent_enabled(app: &tauri::AppHandle) -> bool {
    app.store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(WINDOW_PERSISTENT_SETTING_KEY)
                .and_then(|value| value.as_bool())
        })
        .unwrap_or(false)
}

fn main_window_persistent_enabled(state: &MainWindowState) -> bool {
    state.window_persistent_enabled.load(Ordering::SeqCst)
}

pub(crate) fn set_main_window_persistent_enabled(state: &MainWindowState, enabled: bool) {
    state
        .window_persistent_enabled
        .store(enabled, Ordering::SeqCst);
}

fn save_launch_on_startup_setting(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let store = app
        .store(storage_profile::settings_store_path())
        .map_err(|error| format!("无法打开本地设置存储：{}", error))?;
    store.set(LAUNCH_ON_STARTUP_SETTING_KEY, enabled);
    store
        .save()
        .map_err(|error| format!("无法保存开机自启设置：{}", error))
}

#[cfg(all(windows, debug_assertions))]
fn initialize_launch_on_startup(_app: &tauri::AppHandle) {
    match autostart::get_registered_command(WINDOWS_RUN_VALUE_NAME) {
        Ok(Some(command)) if autostart::is_debug_launch_command(&command) => {
            if let Err(error) = autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, false) {
                eprintln!(
                    "Warning: Failed to remove debug launch-on-startup registration: {}",
                    error
                );
            }
        }
        Ok(_) => {}
        Err(error) => eprintln!(
            "Warning: Failed to inspect launch-on-startup registration in debug build: {}",
            error
        ),
    }
}

#[cfg(all(windows, not(debug_assertions)))]
fn initialize_launch_on_startup(app: &tauri::AppHandle) {
    let saved_launch_on_startup = read_saved_launch_on_startup(app);
    let enabled = saved_launch_on_startup.unwrap_or(DEFAULT_LAUNCH_ON_STARTUP);

    match autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, enabled) {
        Ok(()) => {
            if saved_launch_on_startup.is_none() {
                if let Err(error) = save_launch_on_startup_setting(app, enabled) {
                    eprintln!(
                        "Warning: Failed to persist default launch on startup setting `{}`: {}",
                        enabled, error
                    );
                }
            }
        }
        Err(error) => eprintln!(
            "Warning: Failed to update launch on startup state `{}`: {}",
            enabled, error
        ),
    }
}

#[cfg(not(windows))]
fn initialize_launch_on_startup(app: &tauri::AppHandle) {
    let saved_launch_on_startup = read_saved_launch_on_startup(app);
    let enabled = saved_launch_on_startup.unwrap_or(DEFAULT_LAUNCH_ON_STARTUP);

    match autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, enabled) {
        Ok(()) => {
            if saved_launch_on_startup.is_none() {
                if let Err(error) = save_launch_on_startup_setting(app, enabled) {
                    eprintln!(
                        "Warning: Failed to persist default launch on startup setting `{}`: {}",
                        enabled, error
                    );
                }
            }
        }
        Err(error) => eprintln!(
            "Warning: Failed to update launch on startup state `{}`: {}",
            enabled, error
        ),
    }
}

#[cfg(all(windows, debug_assertions))]
pub(crate) fn read_launch_on_startup_enabled(app: &tauri::AppHandle) -> Result<bool, String> {
    let enabled = autostart::get_registered_command(WINDOWS_RUN_VALUE_NAME)?
        .map(|command| !command.trim().is_empty() && !autostart::is_debug_launch_command(&command))
        .unwrap_or(false);

    if read_saved_launch_on_startup(app) != Some(enabled) {
        if let Err(error) = save_launch_on_startup_setting(app, enabled) {
            eprintln!(
                "Warning: Failed to synchronize launch on startup setting `{}`: {}",
                enabled, error
            );
        }
    }

    Ok(enabled)
}

#[cfg(all(windows, not(debug_assertions)))]
pub(crate) fn read_launch_on_startup_enabled(app: &tauri::AppHandle) -> Result<bool, String> {
    let enabled = match autostart::get_registered_command(WINDOWS_RUN_VALUE_NAME)? {
        Some(command) => command.trim() == autostart::current_launch_command()?,
        None => false,
    };

    if read_saved_launch_on_startup(app) != Some(enabled) {
        if let Err(error) = save_launch_on_startup_setting(app, enabled) {
            eprintln!(
                "Warning: Failed to synchronize launch on startup setting `{}`: {}",
                enabled, error
            );
        }
    }

    Ok(enabled)
}

#[cfg(not(windows))]
pub(crate) fn read_launch_on_startup_enabled(app: &tauri::AppHandle) -> Result<bool, String> {
    let enabled = autostart::is_enabled(WINDOWS_RUN_VALUE_NAME)?;

    if read_saved_launch_on_startup(app) != Some(enabled) {
        if let Err(error) = save_launch_on_startup_setting(app, enabled) {
            eprintln!(
                "Warning: Failed to synchronize launch on startup setting `{}`: {}",
                enabled, error
            );
        }
    }

    Ok(enabled)
}

#[cfg(all(windows, debug_assertions))]
pub(crate) fn set_launch_on_startup_enabled(
    _app: &tauri::AppHandle,
    _enabled: bool,
) -> Result<bool, String> {
    Err("调试构建不支持开机自启，请使用安装版或发布版 DesktopGo。".to_string())
}

#[cfg(all(windows, not(debug_assertions)))]
pub(crate) fn set_launch_on_startup_enabled(
    app: &tauri::AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    let previous_enabled = autostart::is_enabled(WINDOWS_RUN_VALUE_NAME)?;
    autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, enabled)?;

    if let Err(error) = save_launch_on_startup_setting(app, enabled) {
        let rollback_message =
            match autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, previous_enabled) {
                Ok(()) => "已回滚系统开机自启状态。".to_string(),
                Err(rollback_error) => format!("回滚系统开机自启状态也失败了：{}", rollback_error),
            };

        return Err(format!("{} {}", error, rollback_message));
    }

    Ok(enabled)
}

#[cfg(not(windows))]
pub(crate) fn set_launch_on_startup_enabled(
    app: &tauri::AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    let previous_enabled = autostart::is_enabled(WINDOWS_RUN_VALUE_NAME)?;
    autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, enabled)?;

    if let Err(error) = save_launch_on_startup_setting(app, enabled) {
        let rollback_message =
            match autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, previous_enabled) {
                Ok(()) => "已回滚系统开机自启状态。".to_string(),
                Err(rollback_error) => format!("回滚系统开机自启状态也失败了：{}", rollback_error),
            };

        return Err(format!("{} {}", error, rollback_message));
    }

    Ok(enabled)
}

fn normalize_launchpad_shortcut(shortcut: &str) -> Result<String, String> {
    let trimmed = shortcut.trim();
    if trimmed.is_empty() {
        return Err("快捷键不能为空。".to_string());
    }

    let parsed: Shortcut = trimmed
        .parse()
        .map_err(|error| format!("无效快捷键：{}", error))?;

    if parsed.mods.is_empty() {
        return Err("快捷键至少需要一个修饰键，例如 Ctrl、Alt、Shift。".to_string());
    }

    Ok(parsed.into_string())
}

fn register_launchpad_shortcut_handler(
    app: &tauri::AppHandle,
    shortcut: &str,
) -> Result<String, String> {
    let normalized = normalize_launchpad_shortcut(shortcut)?;
    let handle = app.clone();

    app.global_shortcut()
        .on_shortcut(normalized.as_str(), move |_app, _shortcut, event| {
            if event.state != ShortcutState::Released {
                return;
            }
            request_main_window_show(&handle);
        })
        .map_err(|error| format!("无法注册启动台快捷键 `{}`：{}", normalized, error))?;

    Ok(normalized)
}

fn read_saved_launchpad_shortcut(app: &tauri::AppHandle) -> String {
    app.store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get("launchpadShortcut")
                .and_then(|value| value.as_str().map(str::to_owned))
        })
        .unwrap_or_else(|| DEFAULT_LAUNCHPAD_SHORTCUT.to_string())
}

fn persist_launchpad_shortcut(app: &tauri::AppHandle, shortcut: &str) {
    if let Ok(store) = app.store(storage_profile::settings_store_path()) {
        store.set("launchpadShortcut", shortcut.to_string());
        let _ = store.save();
    }
}

fn initialize_launchpad_shortcut(app: &tauri::AppHandle) {
    let saved_shortcut = read_saved_launchpad_shortcut(app);
    let shortcut_state = app.state::<LaunchpadShortcutState>();

    match update_launchpad_shortcut_registration(app, shortcut_state.inner(), &saved_shortcut) {
        Ok(normalized) => {
            if normalized != saved_shortcut {
                persist_launchpad_shortcut(app, &normalized);
            }
        }
        Err(error) => {
            eprintln!(
                "Warning: Failed to register saved launchpad shortcut `{}`: {}",
                saved_shortcut, error
            );

            if saved_shortcut == DEFAULT_LAUNCHPAD_SHORTCUT {
                return;
            }

            match update_launchpad_shortcut_registration(
                app,
                shortcut_state.inner(),
                DEFAULT_LAUNCHPAD_SHORTCUT,
            ) {
                Ok(normalized) => persist_launchpad_shortcut(app, &normalized),
                Err(fallback_error) => eprintln!(
                    "Warning: Failed to register default launchpad shortcut `{}`: {}",
                    DEFAULT_LAUNCHPAD_SHORTCUT, fallback_error
                ),
            }
        }
    }
}

pub(crate) fn update_launchpad_shortcut_registration(
    app: &tauri::AppHandle,
    shortcut_state: &LaunchpadShortcutState,
    shortcut: &str,
) -> Result<String, String> {
    let normalized = normalize_launchpad_shortcut(shortcut)?;
    let mut current = shortcut_state
        .current
        .lock()
        .map_err(|_| "无法锁定当前启动台快捷键状态。".to_string())?;

    if current.as_deref() == Some(normalized.as_str()) {
        return Ok(normalized);
    }

    register_launchpad_shortcut_handler(app, &normalized)?;

    if let Some(previous) = current.as_deref() {
        if let Err(error) = app.global_shortcut().unregister(previous) {
            let _ = app.global_shortcut().unregister(normalized.as_str());
            return Err(format!(
                "无法卸载旧的启动台快捷键 `{}`：{}",
                previous, error
            ));
        }
    }

    *current = Some(normalized.clone());
    Ok(normalized)
}

fn request_main_window_show(app: &tauri::AppHandle) {
    let state = app.state::<MainWindowState>();

    // 防抖：忽略 300ms 内的重复请求，避免快捷键和托盘事件连发时重复抢焦点。
    if let Ok(mut last) = state.last_show_request.lock() {
        let now = Instant::now();
        if let Some(t) = *last {
            if now.duration_since(t).as_millis() < 300 {
                return;
            }
        }
        *last = Some(now);
    }

    if app.get_webview_window("main").is_none() {
        create_main_window(app);
    }

    // 在显示主窗口之前，临时抑制 blur 隐藏，防止其他窗口（如 settings）
    // 占据焦点导致主窗口刚显示就因失焦被自动隐藏。
    set_main_window_blur_guard(&state, MAIN_WINDOW_BLUR_GUARD_MS);

    if state.ready.load(Ordering::SeqCst) {
        show_main_window(app);
    } else {
        state.pending_show.store(true, Ordering::SeqCst);
    }
}

pub(crate) fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let state = app.state::<MainWindowState>();
        apply_main_window_runtime_mode(app, state.inner());

        if let Err(error) = apply_main_window_style(app, None, None) {
            eprintln!(
                "Warning: Failed to refresh main window style before showing: {}",
                error
            );
        }

        let delayed_reveal = main_window_uses_delayed_reveal(app);
        sync_main_window_dom_visibility(&window, delayed_reveal);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = activate_webview_window(&window);
        let _ = window.emit(MAIN_WINDOW_SHOWN_EVENT, ());

        if delayed_reveal {
            // Let DWM composite the acrylic effect, then reveal content.
            let reveal_window = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(60));
                let _ = reveal_window.eval("document.documentElement.style.opacity='1'");
            });
        }

        refresh_tray_menu(app);
        schedule_main_window_focus_retry(app.clone());
    }
}

pub(crate) fn hide_main_window(app: &tauri::AppHandle) {
    let state = app.state::<MainWindowState>();
    clear_main_window_blur_guard(&state);

    if let Some(window) = app.get_webview_window("main") {
        if main_window_uses_delayed_reveal(app) {
            // Reset opacity so next show starts invisible (avoids acrylic flash).
            let _ = window.eval("document.documentElement.style.opacity='0'");
        } else {
            let _ = window.eval("document.documentElement.style.transition='';document.documentElement.style.opacity='1'");
        }

        let _ = window.hide();
        let _ = window.set_always_on_top(false);
    }

    refresh_tray_menu(app);
}

fn toggle_main_window_visibility(app: &tauri::AppHandle) {
    if main_window_is_visible(app) {
        hide_main_window(app);
    } else {
        request_main_window_show(app);
    }
}

fn schedule_main_window_focus_retry(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(MAIN_WINDOW_FOCUS_RETRY_DELAY_MS));

        let Some(window) = app.get_webview_window("main") else {
            return;
        };

        if !window.is_visible().unwrap_or(false) {
            let state = app.state::<MainWindowState>();
            clear_main_window_blur_guard(&state);
            return;
        }

        if window.is_focused().unwrap_or(false) {
            let state = app.state::<MainWindowState>();
            clear_main_window_blur_guard(&state);
            return;
        }

        let _ = window.set_focus();

        let state = app.state::<MainWindowState>();
        if !main_window_blur_guard_active(&state) {
            state.suppress_blur.store(false, Ordering::SeqCst);
            return;
        }
    });
}

fn create_main_window(app: &tauri::AppHandle) {
    let state = app.state::<MainWindowState>();
    state.ready.store(false, Ordering::SeqCst);
    let (initial_width, initial_height) = resolve_initial_main_window_size(app);
    let bootstrap_script = build_window_bootstrap_script(app, true);
    let saved_style = read_saved_window_style(app).unwrap_or("default");
    let persistent_enabled = main_window_persistent_enabled(&state);
    let transparent_surface =
        main_window_should_use_transparent_surface(saved_style, persistent_enabled);
    let dark = resolved_theme_is_dark(app, None);
    let background_color = resolve_main_window_background_color(transparent_surface, dark);

    let builder =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("DesktopGo")
            .inner_size(initial_width, initial_height)
            .background_color(background_color)
            .fullscreen(false)
            .resizable(false)
            .decorations(false)
            .transparent(transparent_surface)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
            .devtools(cfg!(debug_assertions))
            .initialization_script(bootstrap_script)
            .center();

    match builder.build() {
        Ok(window) => {
            #[cfg(windows)]
            if let Err(error) = windows_drag_drop::install(&window) {
                eprintln!("Warning: Failed to install Windows Shell drag-drop support: {error}");
            }
            state
                .transparent_surface_enabled
                .store(transparent_surface, Ordering::SeqCst);
            if let Err(error) = apply_main_window_style(app, None, None) {
                eprintln!(
                    "Warning: Failed to apply saved main window style: {}",
                    error
                );
            }
            attach_blur_handler(app);
        }
        Err(e) => {
            eprintln!("Failed to create main window: {}", e);
        }
    }
}

fn create_settings_window(app: &tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window("settings").is_some() {
        return Ok(());
    }

    let title = app
        .state::<TrayState>()
        .language()
        .tray_menu_text()
        .settings_window_title;
    let bootstrap_script = build_window_bootstrap_script(app, false);

    tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("index.html?page=settings".into()),
    )
    .title(title)
    .inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
    .min_inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
    .center()
    .resizable(true)
    .decorations(false)
    .shadow(true)
    .visible(false)
    .initialization_script(bootstrap_script)
    .build()
    .map(|_| ())
    .map_err(|error| format!("Failed to create settings window: {error}"))
}

pub(crate) fn show_settings_window(app: &tauri::AppHandle) -> Result<(), String> {
    create_settings_window(app)?;
    refresh_settings_window_title(app);

    let settings_window = app
        .get_webview_window("settings")
        .ok_or_else(|| "Settings window not found".to_string())?;

    let _ = settings_window.unminimize();
    let _ = settings_window.show();
    activate_webview_window(&settings_window)?;
    hide_main_window(app);

    Ok(())
}

fn attach_blur_handler(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let app_handle = app.clone();
        window.on_window_event(move |event| match event {
            tauri::WindowEvent::Focused(true) => {
                if main_window_persistent_enabled(&app_handle.state::<MainWindowState>()) {
                    schedule_main_window_style_refresh(app_handle.clone(), 10);
                }
                refresh_tray_menu(&app_handle);
            }
            tauri::WindowEvent::Focused(false) => {
                // 在显示流程完成前，可能连续收到多个 Focused(false) 事件。
                // 除了抑制标记，再额外给显示流程一个短暂保护窗口，避免托盘菜单关闭时
                // 紧跟着的失焦把主窗口立即隐藏。
                let state = app_handle.state::<MainWindowState>();
                if main_window_persistent_enabled(&state) {
                    schedule_main_window_style_refresh(app_handle.clone(), 30);
                }
                if main_window_persistent_enabled(&state) {
                    return;
                }
                if main_window_blur_guard_active(&state) {
                    return;
                }
                if !state.suppress_blur.load(Ordering::SeqCst) {
                    hide_main_window(&app_handle);
                }
            }
            _ => {}
        });
    }
}

#[cfg(windows)]
fn resolve_activation_window_pos_flags(
) -> windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS {
    // 显隐统一交给 Tauri 的 show/hide，原生 SetWindowPos 只负责 z-order，
    // 避免全屏窗口在显示链路里被重复 show，导致明显闪烁。
    SWP_NOMOVE | SWP_NOSIZE
}

pub(crate) fn activate_webview_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd = window
            .hwnd()
            .map_err(|error| format!("Failed to resolve settings HWND: {}", error))?;

        unsafe {
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOP),
                0,
                0,
                0,
                0,
                resolve_activation_window_pos_flags(),
            );
            let _ = BringWindowToTop(hwnd);
            let _ = SetForegroundWindow(hwnd);
            let _ = SetActiveWindow(hwnd);
            let _ = SetFocus(Some(hwnd));
        }

        Ok(())
    }

    #[cfg(not(windows))]
    {
        window
            .set_focus()
            .map_err(|error| format!("Failed to focus window: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn activation_window_pos_flags_only_change_z_order() {
        assert_eq!(
            resolve_activation_window_pos_flags(),
            SWP_NOMOVE | SWP_NOSIZE
        );
    }

    #[cfg(windows)]
    #[test]
    fn activation_window_pos_flags_do_not_force_show_window() {
        use windows::Win32::UI::WindowsAndMessaging::SWP_SHOWWINDOW;

        assert_ne!(
            resolve_activation_window_pos_flags() | SWP_SHOWWINDOW,
            resolve_activation_window_pos_flags()
        );
    }
}

#[cfg(windows)]
fn install_windows_console_exit_handler(app: &tauri::AppHandle) {
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
fn install_windows_console_exit_handler(_app: &tauri::AppHandle) {}

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
