use serde::Deserialize;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Listener, Manager};
use tauri_plugin_store::StoreExt;

use crate::{storage_profile, window};

const LANGUAGE_SETTING_KEY: &str = "language";
const INSTALL_LANGUAGE_MARKER_FILE_NAME: &str = ".install_language";
const TRAY_ICON_ID: &str = "main";
const TRAY_STATUS_MENU_ITEM_ID: &str = "tray-status";
const TRAY_TOGGLE_MENU_ITEM_ID: &str = "tray-toggle-launchpad";
const TRAY_SETTINGS_MENU_ITEM_ID: &str = "tray-open-settings";
const TRAY_QUIT_MENU_ITEM_ID: &str = "tray-quit";
const LANGUAGE_CHANGED_EVENT: &str = "desktopgo://language-changed";

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

pub(crate) fn initialize_language(app: &tauri::AppHandle) {
    let language = initialize_app_language(app);
    app.state::<TrayState>()
        .set_language(AppLanguage::from_code(language));
}

pub(crate) fn install(app: &mut tauri::App) -> tauri::Result<()> {
    let tray_state = app.state::<TrayState>();
    let (menu, menu_items) = build_tray_menu(app.handle())?;
    tray_state.set_menu_items(menu_items);

    let _tray = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip(tray_state.language().tray_menu_text().tooltip)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            TRAY_TOGGLE_MENU_ITEM_ID => window::toggle_main_window_visibility(app),
            TRAY_SETTINGS_MENU_ITEM_ID => {
                if let Err(error) = window::show_settings_window(app) {
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
                } => window::request_main_window_show(app),
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
        if let Ok(payload) = serde_json::from_str::<LanguageChangedPayload>(event.payload()) {
            if let Some(language) = normalize_app_language(&payload.language) {
                tray_refresh_handle
                    .state::<TrayState>()
                    .set_language(AppLanguage::from_code(language));
                refresh_tray_menu(&tray_refresh_handle);
                refresh_settings_window_title(&tray_refresh_handle);
            }
        }
    });

    Ok(())
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

fn consume_install_language_marker() -> Option<&'static str> {
    let marker = std::env::current_exe()
        .ok()
        .as_ref()
        .and_then(|path| path.parent())
        .map(|dir| dir.join(INSTALL_LANGUAGE_MARKER_FILE_NAME));
    let path = marker?;
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

pub(crate) fn refresh_tray_menu(app: &tauri::AppHandle) {
    if let Err(error) = try_refresh_tray_menu(app) {
        eprintln!("Warning: Failed to refresh tray menu: {error}");
    }
}

pub(crate) fn settings_window_title(app: &tauri::AppHandle) -> &'static str {
    app.state::<TrayState>()
        .language()
        .tray_menu_text()
        .settings_window_title
}

pub(crate) fn refresh_settings_window_title(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_title(settings_window_title(app));
    }
}
