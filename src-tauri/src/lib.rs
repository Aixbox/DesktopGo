mod autostart;
mod commands;
mod everything;
mod icons;
mod layout_db;
mod search_preview;
mod updater;

use commands::{
    activate_main_window, activate_settings_window, check_for_app_update, delete_desktop_icons,
    get_default_customapp_dir, get_desktop_icons, get_icon_manager_items,
    get_launch_on_startup_enabled, get_layout_payload, get_layout_payloads, get_search_preview,
    get_search_runtime_status, get_updater_configuration_status, hide_desktop_icons,
    install_app_update, launch_app, notify_main_window_ready, record_search_result_run,
    search_files, set_layout_payload, set_layout_payloads, set_window_mode, start_search_runtime,
    sync_full_customapp_icons, sync_full_desktop_icons, sync_new_customapp_icons,
    sync_new_desktop_icons, toggle_window, unhide_desktop_icons, update_launch_on_startup_enabled,
    update_launchpad_shortcut,
};
#[cfg(windows)]
use once_cell::sync::OnceCell;
use serde::Deserialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Listener, Manager, RunEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{SetActiveWindow, SetFocus};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, SetForegroundWindow, SetWindowPos, ShowWindow, HWND_TOP, SWP_NOMOVE,
    SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE,
};

#[cfg(windows)]
static WINDOWS_CONSOLE_APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();
#[cfg(windows)]
static WINDOWS_CONSOLE_EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);

const MAIN_WINDOW_FOCUS_RETRY_COUNT: usize = 8;
const MAIN_WINDOW_FOCUS_RETRY_DELAY_MS: u64 = 40;
pub(crate) const DEFAULT_LAUNCHPAD_SHORTCUT: &str = "Ctrl+Space";
const DEFAULT_LAUNCH_ON_STARTUP: bool = true;
const LAUNCH_ON_STARTUP_SETTING_KEY: &str = "launchOnStartup";
const LANGUAGE_SETTING_KEY: &str = "language";
const WINDOWS_RUN_VALUE_NAME: &str = "DesktopGo";
const INSTALL_LANGUAGE_MARKER_FILE_NAME: &str = ".install_language";
const SHOW_ON_LAUNCH_MARKER_FILE_NAME: &str = ".show_on_launch";
const SETTINGS_WINDOW_WIDTH: f64 = 800.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 600.0;
const TRAY_ICON_ID: &str = "main";
const TRAY_STATUS_MENU_ITEM_ID: &str = "tray-status";
const TRAY_TOGGLE_MENU_ITEM_ID: &str = "tray-toggle-launchpad";
const TRAY_SETTINGS_MENU_ITEM_ID: &str = "tray-open-settings";
const TRAY_QUIT_MENU_ITEM_ID: &str = "tray-quit";
const LANGUAGE_CHANGED_EVENT: &str = "desktopgo://language-changed";

struct MainWindowState {
    ready: AtomicBool,
    pending_show: AtomicBool,
    suppress_blur: AtomicBool,
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
            let initial_language = initialize_app_language(app.handle());
            let tray_state = app.state::<TrayState>();
            tray_state.set_language(AppLanguage::from_code(initial_language));

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
            get_desktop_icons,
            get_icon_manager_items,
            launch_app,
            set_window_mode,
            sync_new_desktop_icons,
            sync_full_desktop_icons,
            sync_new_customapp_icons,
            sync_full_customapp_icons,
            hide_desktop_icons,
            unhide_desktop_icons,
            delete_desktop_icons,
            get_default_customapp_dir,
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
            get_updater_configuration_status,
            check_for_app_update,
            install_app_update,
            update_launchpad_shortcut,
            get_launch_on_startup_enabled,
            update_launch_on_startup_enabled
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

fn build_tray_menu(
    app: &tauri::AppHandle,
) -> tauri::Result<(Menu<tauri::Wry>, TrayMenuItems)> {
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
    app.store("settings.json").ok().and_then(|store| {
        store
            .get(LANGUAGE_SETTING_KEY)
            .and_then(|value| value.as_str().and_then(normalize_app_language))
    })
}

fn save_language_setting(app: &tauri::AppHandle, language: &str) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|error| format!("无法打开本地语言设置存储：{}", error))?;
    store.set(LANGUAGE_SETTING_KEY, language.to_string());
    store
        .save()
        .map_err(|error| format!("无法保存界面语言设置：{}", error))
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
    let title = app.state::<TrayState>().language().tray_menu_text().settings_window_title;

    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_title(title);
    }
}

fn read_saved_launch_on_startup(app: &tauri::AppHandle) -> Option<bool> {
    app.store("settings.json").ok().and_then(|store| {
        store
            .get(LAUNCH_ON_STARTUP_SETTING_KEY)
            .and_then(|value| value.as_bool())
    })
}

fn save_launch_on_startup_setting(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|error| format!("无法打开本地设置存储：{}", error))?;
    store.set(LAUNCH_ON_STARTUP_SETTING_KEY, enabled);
    store
        .save()
        .map_err(|error| format!("无法保存开机自启设置：{}", error))
}

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
    app.store("settings.json")
        .ok()
        .and_then(|store| {
            store
                .get("launchpadShortcut")
                .and_then(|value| value.as_str().map(str::to_owned))
        })
        .unwrap_or_else(|| DEFAULT_LAUNCHPAD_SHORTCUT.to_string())
}

fn persist_launchpad_shortcut(app: &tauri::AppHandle, shortcut: &str) {
    if let Ok(store) = app.store("settings.json") {
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
    state.suppress_blur.store(true, Ordering::SeqCst);

    if state.ready.load(Ordering::SeqCst) {
        show_main_window(app);
    } else {
        state.pending_show.store(true, Ordering::SeqCst);
    }
}

pub(crate) fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.set_focus();
        refresh_tray_menu(app);
        schedule_main_window_focus_retry(app.clone());
    }
}

pub(crate) fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(false);
        let _ = window.hide();
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
    std::thread::spawn(move || {
        for _ in 0..MAIN_WINDOW_FOCUS_RETRY_COUNT {
            std::thread::sleep(Duration::from_millis(MAIN_WINDOW_FOCUS_RETRY_DELAY_MS));

            let Some(window) = app.get_webview_window("main") else {
                return;
            };

            if !window.is_visible().unwrap_or(false) {
                return;
            }

            if window.is_focused().unwrap_or(false) {
                let state = app.state::<MainWindowState>();
                state.suppress_blur.store(false, Ordering::SeqCst);
                return;
            }

            let _ = window.set_focus();
        }

        let state = app.state::<MainWindowState>();
        state.suppress_blur.store(false, Ordering::SeqCst);
    });
}

fn create_main_window(app: &tauri::AppHandle) {
    let state = app.state::<MainWindowState>();
    state.ready.store(false, Ordering::SeqCst);

    let builder =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("DesktopGo")
            .inner_size(1920.0, 1080.0)
            .fullscreen(false)
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
            .devtools(cfg!(debug_assertions))
            .center();

    match builder.build() {
        Ok(_) => {
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

    let title = app.state::<TrayState>().language().tray_menu_text().settings_window_title;

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
                // 主窗口成功获得焦点，清除抑制标记。
                let state = app_handle.state::<MainWindowState>();
                state.suppress_blur.store(false, Ordering::SeqCst);
                refresh_tray_menu(&app_handle);
            }
            tauri::WindowEvent::Focused(false) => {
                // swap(false) 读取并清除标记：若为 true 说明正在显示流程中，跳过隐藏。
                let state = app_handle.state::<MainWindowState>();
                if !state.suppress_blur.swap(false, Ordering::SeqCst) {
                    hide_main_window(&app_handle);
                }
            }
            _ => {}
        });
    }
}

pub(crate) fn activate_webview_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd = window
            .hwnd()
            .map_err(|error| format!("Failed to resolve settings HWND: {}", error))?;

        unsafe {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOP),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
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
