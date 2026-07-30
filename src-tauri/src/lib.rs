mod agent;
mod ai;
mod app_state;
mod autostart;
mod commands;
mod console_exit;
mod everything;
mod icons;
mod launchpad_shortcut;
mod layout_db;
mod search_preview;
mod shell_context_menu;
mod startup;
mod storage_profile;
mod tray;
mod updater;
mod window;
mod window_style;
#[cfg(windows)]
mod windows_drag_drop;

use agent::icon_agent::{ai_organize_icons_agent, ai_organize_record_apply};
use ai::{ai_chat, ai_classify_icons};
use commands::{
    activate_main_window, activate_settings_window, apply_window_style, check_for_app_update,
    close_settings_window, create_icon_entry, delete_icons, extract_website_icon,
    get_complete_search_snapshot, get_custom_icon_source, get_drag_preview_icon,
    get_icon_edit_source, get_icon_manager_items, get_icons, get_launch_on_startup_enabled,
    get_layout_payload, get_layout_payloads, get_main_window_always_on_top_enabled,
    get_search_preview, get_search_result_icons, get_search_runtime_status,
    get_updater_configuration_status, hide_icons, import_dropped_paths, install_app_update,
    launch_app, notify_main_window_ready, optimize_icon_image, record_search_result_run,
    scan_invalid_icons, search_files, set_layout_payload, set_layout_payloads,
    set_main_window_always_on_top_enabled, set_window_mode, show_shell_context_menu,
    start_search_runtime, sync_window_persistent_state, toggle_window, unhide_icons,
    update_icon_entry, update_launch_on_startup_enabled, update_launchpad_shortcut,
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
        .manage(launchpad_shortcut::LaunchpadShortcutState::default())
        .manage(TrayState::default());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    let app = builder
        .setup(setup_app)
        .invoke_handler(tauri::generate_handler![
            toggle_window,
            activate_main_window,
            activate_settings_window,
            get_icons,
            get_icon_manager_items,
            get_icon_edit_source,
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
