mod commands;
mod icons;

use commands::{
    delete_desktop_icons, get_default_customapp_dir, get_desktop_icons, get_icon_manager_items,
    hide_desktop_icons, launch_app, set_window_mode, sync_full_customapp_icons,
    sync_full_desktop_icons, sync_new_customapp_icons, sync_new_desktop_icons, toggle_window,
    unhide_desktop_icons,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "显示启动台", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        show_or_create_main_window(app);
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
                        show_or_create_main_window(app);
                    }
                })
                .build(app)?;

            attach_blur_handler(app.handle());

            let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);
            let handle = app.handle().clone();
            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, _event| {
                    show_or_create_main_window(&handle);
                })?;
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("Warning: Failed to register Ctrl+Space: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_window,
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
            get_default_customapp_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_or_create_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        let builder = tauri::WebviewWindowBuilder::new(
            app,
            "main",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("DesktopGo")
        .inner_size(1920.0, 1080.0)
        .fullscreen(false)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(true)
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
}

fn attach_blur_handler(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                let _ = window_clone.hide();
            }
        });
    }
}
