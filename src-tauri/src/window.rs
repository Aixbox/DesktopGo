use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};

#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{SetActiveWindow, SetFocus};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, SetForegroundWindow, SetWindowPos, HWND_TOP, SWP_NOMOVE, SWP_NOSIZE,
};

use crate::tray::{refresh_settings_window_title, refresh_tray_menu, settings_window_title};
use crate::window_style::{
    apply_main_window_runtime_mode, apply_main_window_style, build_window_bootstrap_script,
    main_window_persistent_enabled, main_window_should_use_transparent_surface,
    main_window_uses_delayed_reveal, read_saved_window_style, resolve_initial_main_window_size,
    resolve_main_window_background_color, resolved_theme_is_dark,
    schedule_main_window_style_refresh, sync_main_window_dom_visibility,
};
use crate::MainWindowState;

const MAIN_WINDOW_FOCUS_RETRY_DELAY_MS: u64 = 40;
const MAIN_WINDOW_BLUR_GUARD_MS: u64 = 1200;
const MAIN_WINDOW_SHOWN_EVENT: &str = "launchpad:shown";
const SETTINGS_WINDOW_WIDTH: f64 = 800.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 600.0;

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

fn main_window_blur_guard_active(state: &MainWindowState) -> bool {
    state
        .suppress_blur_until
        .lock()
        .ok()
        .and_then(|guard| *guard)
        .map(|until| Instant::now() < until)
        .unwrap_or(false)
}

pub(crate) fn request_main_window_show(app: &tauri::AppHandle) {
    let state = app.state::<MainWindowState>();

    if let Ok(mut last) = state.last_show_request.lock() {
        let now = Instant::now();
        if let Some(previous) = *last {
            if now.duration_since(previous).as_millis() < 300 {
                return;
            }
        }
        *last = Some(now);
    }

    if app.get_webview_window("main").is_none() {
        create_main_window(app);
    }
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
            let _ = window.eval("document.documentElement.style.opacity='0'");
        } else {
            let _ = window.eval("document.documentElement.style.transition='';document.documentElement.style.opacity='1'");
        }

        let _ = window.hide();
        let _ = window.set_always_on_top(false);
    }

    refresh_tray_menu(app);
}

pub(crate) fn toggle_main_window_visibility(app: &tauri::AppHandle) {
    let is_visible = app
        .get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if is_visible {
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
            clear_main_window_blur_guard(&app.state::<MainWindowState>());
            return;
        }
        if window.is_focused().unwrap_or(false) {
            clear_main_window_blur_guard(&app.state::<MainWindowState>());
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

pub(crate) fn create_main_window(app: &tauri::AppHandle) {
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

    #[cfg(windows)]
    let builder = builder.disable_drag_drop_handler();

    match builder.build() {
        Ok(window) => {
            #[cfg(windows)]
            if let Err(error) = crate::windows_drag_drop::install(&window) {
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
        Err(error) => eprintln!("Failed to create main window: {}", error),
    }
}

fn create_settings_window(app: &tauri::AppHandle) -> Result<(), String> {
    if app.get_webview_window("settings").is_some() {
        return Ok(());
    }

    let bootstrap_script = build_window_bootstrap_script(app, false);
    tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("index.html?page=settings".into()),
    )
    .title(settings_window_title(app))
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
