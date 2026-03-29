mod commands;
mod everything;
mod icons;
mod layout_db;
mod search_preview;
mod updater;

use commands::{
    activate_main_window, check_for_app_update, delete_desktop_icons, get_default_customapp_dir,
    get_desktop_icons, get_icon_manager_items, get_layout_payload, get_layout_payloads,
    get_search_preview, get_search_runtime_status, get_updater_configuration_status,
    hide_desktop_icons, install_app_update, launch_app, notify_main_window_ready,
    record_search_result_run, search_files, set_layout_payload, set_layout_payloads,
    set_window_mode, start_search_runtime, sync_full_customapp_icons, sync_full_desktop_icons,
    sync_new_customapp_icons, sync_new_desktop_icons, toggle_window, unhide_desktop_icons,
};
#[cfg(windows)]
use once_cell::sync::OnceCell;
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(windows)]
use std::sync::Mutex;
use std::time::Instant;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, RunEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

#[cfg(windows)]
static WINDOWS_CONSOLE_APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();
#[cfg(windows)]
static WINDOWS_CONSOLE_EXIT_REQUESTED: AtomicBool = AtomicBool::new(false);

struct MainWindowState {
    ready: AtomicBool,
    pending_show: AtomicBool,
    suppress_blur: AtomicBool,
    last_show_request: Mutex<Option<Instant>>,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(updater::PendingUpdate::default())
        .manage(MainWindowState::default());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    let app = builder
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示启动台", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        request_main_window_show(app);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        request_main_window_show(app);
                    }
                })
                .build(app)?;

            create_main_window(app.handle());
            install_windows_console_exit_handler(app.handle());

            let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);
            let handle = app.handle().clone();
            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    request_main_window_show(&handle);
                })?;
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("Warning: Failed to register Ctrl+Space: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_window,
            activate_main_window,
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
            install_app_update
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            everything::shutdown_search_runtime(app_handle);
        }
    });
}

fn request_main_window_show(app: &tauri::AppHandle) {
    let state = app.state::<MainWindowState>();

    // 防抖：忽略 300ms 内的重复请求（全局快捷键可能在按下和抬起各触发一次）
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

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.set_focus();
    }
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

fn attach_blur_handler(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        let app_handle = app.clone();
        window.on_window_event(move |event| match event {
            tauri::WindowEvent::Focused(true) => {
                // 主窗口成功获得焦点，清除抑制标记。
                let state = app_handle.state::<MainWindowState>();
                state.suppress_blur.store(false, Ordering::SeqCst);
            }
            tauri::WindowEvent::Focused(false) => {
                // swap(false) 读取并清除标记：若为 true 说明正在显示流程中，跳过隐藏。
                let state = app_handle.state::<MainWindowState>();
                if !state.suppress_blur.swap(false, Ordering::SeqCst) {
                    let _ = window_clone.hide();
                }
            }
            _ => {}
        });
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
