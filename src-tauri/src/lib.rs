mod agent;
mod ai;
mod app_state;
mod autostart;
mod commands;
mod console_exit;
mod everything;
mod icons;
mod launcher_catalog;
mod launchpad_shortcut;
mod layout_db;
mod native_icon;
mod poll;
#[cfg(windows)]
mod running_app;
mod search_preview;
mod shell_context_menu;
mod shortcut_target;
mod startup;
mod storage_profile;
mod tray;
mod tray_icon;
#[cfg(windows)]
mod tray_icon_click;
mod updater;
mod window;
mod window_icon;
mod window_style;
#[cfg(windows)]
mod windows_drag_drop;

use agent::icon_agent::{ai_organize_icons_agent, ai_organize_record_apply};
use ai::{ai_cancel, ai_chat, ai_classify_icons, get_builtin_icon_categories};
use commands::{
    activate_main_window, activate_settings_window, activate_window, apply_window_style,
    check_for_app_update, clear_background_original, close_settings_window, create_icon_entry,
    create_new_file, create_settings_window, delete_icons, extract_website_icon,
    fetch_wallpaper_feed, fetch_wallpaper_image, get_complete_search_snapshot,
    get_custom_icon_source, get_default_launcher_folders, get_drag_preview_icon,
    get_icon_edit_source, get_icon_manager_items, get_icons, get_launch_on_startup_enabled,
    get_launcher_catalog, get_layout_payload, get_layout_payloads,
    get_main_window_always_on_top_enabled, get_search_preview, get_search_result_icons,
    get_search_runtime_status, get_updater_configuration_status, hide_icons, import_app_entries,
    import_dropped_paths, install_app_update, launch_app, load_background_original,
    notify_main_window_ready, open_wallpaper_viewer, optimize_icon_image, record_search_result_run,
    save_background_original, scan_installed_apps, scan_invalid_icons, search_files,
    set_layout_payload, set_layout_payloads, set_main_window_always_on_top_enabled,
    set_window_mode, show_shell_context_menu, start_search_runtime, sync_window_persistent_state,
    toggle_window, unhide_icons, update_icon_entry, update_launch_on_startup_enabled,
    update_launchpad_shortcut,
};
use std::sync::atomic::Ordering;
use tauri::{Manager, RunEvent};

pub(crate) use app_state::{
    MainWindowState, WindowPersistentChangedPayload, SETTINGS_RETURNED_TO_MAIN_EVENT,
    WINDOW_PERSISTENT_CHANGED_EVENT,
};
pub(crate) use startup::{read_launch_on_startup_enabled, set_launch_on_startup_enabled};
pub(crate) use tray::TrayState;
pub(crate) use window::{
    hide_main_window, request_main_window_show, show_main_window, show_settings_window,
};
pub(crate) use window_style::{
    apply_main_window_runtime_mode, apply_main_window_style,
    main_window_manual_always_on_top_enabled, main_window_should_recreate_for_surface_mode,
    set_main_window_manual_always_on_top_enabled, set_main_window_persistent_enabled,
};

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    log::info!(
        "DesktopGo v{} starting (pid {})",
        app.package_info().version,
        std::process::id()
    );

    // 诊断构建：注册全局热键打开 WebView Inspector（应用自定义右键菜单拦截了默认入口）。
    #[cfg(feature = "devtools")]
    register_devtools_hotkey(app.handle());

    storage_profile::ensure_dev_profile_seeded(app.handle())?;
    tray::initialize_language(app.handle());

    let main_window_state = app.state::<MainWindowState>();
    main_window_state.window_persistent_enabled.store(
        window_style::read_saved_window_persistent_enabled(app.handle()),
        Ordering::SeqCst,
    );

    tray::install(app)?;
    window::create_main_window(app.handle());
    console_exit::install(app.handle());
    startup::initialize_launch_on_startup(app.handle());
    launchpad_shortcut::initialize(app.handle());

    if startup::should_show_on_launch(app.handle()) {
        window::request_main_window_show(app.handle());
    }
    Ok(())
}

/// 注册全局共享状态。从 build_app 拆出：invoke_handler 命令列表天然偏长，
/// 再叠 manage 链会顶过 clippy too_many_lines(80) 上限。
fn manage_shared_state(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        .manage(updater::PendingUpdate::default())
        .manage(MainWindowState::default())
        .manage(launchpad_shortcut::LaunchpadShortcutState::default())
        .manage(TrayState::default())
        .manage(ai::AiRunRegistry::default())
}

/// 诊断日志：文件（应用日志目录）+ stdout，Info 级。
/// 文件位置：`%LOCALAPPDATA%\com.aixbox.desktopgo\logs\`。
/// 前端 console 经 attachConsole 转发进同一份日志。
fn with_diagnostics_plugin(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.plugin(
        tauri_plugin_log::Builder::new()
            .targets([
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                    file_name: Some("desktopgo".into()),
                }),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            ])
            .level(log::LevelFilter::Info)
            .max_file_size(512_000)
            .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
            .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
            .build(),
    )
}

/// 诊断构建：注册打开 Inspector 的全局热键。F12 常被截图/输入法等软件的全局
/// 热键占用，注册失败会降级到备用键；热键不可用只记警告，绝不阻断应用启动。
#[cfg(feature = "devtools")]
fn register_devtools_hotkey(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};
    fn open_devtools(app_handle: &tauri::AppHandle, _shortcut: &Shortcut, event: ShortcutEvent) {
        if event.state != ShortcutState::Pressed {
            return;
        }
        if let Some(window) = app_handle.get_webview_window("main") {
            window.open_devtools();
            log::info!("devtools opened via global hotkey");
        }
    }
    let manager = app.global_shortcut();
    for accelerator in ["F12", "Ctrl+Shift+I"] {
        match manager.on_shortcut(accelerator, open_devtools) {
            Ok(()) => {
                log::info!("devtools global hotkey registered: {accelerator}");
                return;
            }
            Err(err) => log::warn!("devtools hotkey {accelerator} unavailable: {err}"),
        }
    }
    log::warn!("no devtools hotkey available; Inspector hotkey disabled in this build");
}

/// 构建应用：插件注册、托盘/主窗口 setup 与全部命令的 invoke_handler。
/// 独立成函数以保持 `run()` 精简（clippy too_many_lines 上限 80 行）。
fn build_app() -> tauri::App {
    let builder = with_diagnostics_plugin(
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_store::Builder::default().build()),
    );
    let builder = manage_shared_state(builder);

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    let app = builder
        .setup(setup_app)
        .invoke_handler(tauri::generate_handler![
            toggle_window,
            activate_main_window,
            activate_window,
            create_settings_window,
            activate_settings_window,
            get_icons,
            get_icon_manager_items,
            get_icon_edit_source,
            launch_app,
            show_shell_context_menu,
            set_window_mode,
            import_dropped_paths,
            create_icon_entry,
            import_app_entries,
            scan_installed_apps,
            create_new_file,
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
            get_launcher_catalog,
            get_default_launcher_folders,
            search_files,
            get_complete_search_snapshot,
            get_search_result_icons,
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
            get_custom_icon_source,
            optimize_icon_image,
            update_launchpad_shortcut,
            close_settings_window,
            sync_window_persistent_state,
            get_launch_on_startup_enabled,
            update_launch_on_startup_enabled,
            ai_classify_icons,
            ai_chat,
            get_builtin_icon_categories,
            ai_cancel,
            ai_organize_icons_agent,
            ai_organize_record_apply,
            fetch_wallpaper_feed,
            fetch_wallpaper_image,
            // generate_handler 的参数会被 rustfmt 展开成一行一项，压行数无效；
            // build_app 再超 too_many_lines(80) 时优先继续拆函数。
            save_background_original,
            load_background_original,
            clear_background_original,
            open_wallpaper_viewer
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = build_app();

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            everything::shutdown_search_runtime(app_handle);
        }
    });
}
