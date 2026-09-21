use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};

#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{SetActiveWindow, SetFocus};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
    SetWindowPos, HWND_TOP, SWP_NOMOVE, SWP_NOSIZE,
};

use crate::tray::{refresh_settings_window_title, refresh_tray_menu, settings_window_title};
use crate::window_style::{
    apply_main_window_runtime_mode, apply_main_window_style, build_window_bootstrap_script,
    main_window_persistent_enabled, main_window_should_use_transparent_surface,
    main_window_uses_delayed_reveal, read_saved_window_style, resolve_initial_main_window_size,
    resolve_main_window_background_color, resolved_theme_is_dark,
    schedule_main_window_style_refresh, sync_main_window_dom_visibility, window_size_with_shadow,
};
use crate::MainWindowState;

const MAIN_WINDOW_FOCUS_RETRY_DELAY_MS: u64 = 40;
const MAIN_WINDOW_BLUR_GUARD_MS: u64 = 1200;
const MAIN_WINDOW_SHOWN_EVENT: &str = "launchpad:shown";
const SETTINGS_WINDOW_WIDTH: f64 = 800.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 600.0;
const VIEWER_WINDOW_WIDTH: f64 = 1080.0;
const VIEWER_WINDOW_HEIGHT: f64 = 720.0;
const VIEWER_WINDOW_MIN_WIDTH: f64 = 640.0;
const VIEWER_WINDOW_MIN_HEIGHT: f64 = 440.0;

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
        if let Err(error) = crate::window_icon::refresh(&window) {
            eprintln!("Warning: Failed to refresh main window icon after showing: {error}");
        }
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FocusRetryStep {
    /// 窗口已隐藏或已在前台：结束重试并解除失焦保护。
    Settle,
    /// 窗口可见但仍不在前台，且保护期未过：再激活一次。
    Activate,
    /// 保护期已过：放弃激活，仅恢复失焦即隐的默认行为。
    GiveUp,
}

fn resolve_focus_retry_step(visible: bool, foreground: bool, guard_active: bool) -> FocusRetryStep {
    if !visible || foreground {
        FocusRetryStep::Settle
    } else if guard_active {
        FocusRetryStep::Activate
    } else {
        FocusRetryStep::GiveUp
    }
}

/// 窗口是否为系统前台窗口。
///
/// 不能用 `window.is_focused()` 判断：WebView2 子窗口一拿到键盘焦点，宿主窗口就会收到
/// `WM_KILLFOCUS`，tao 从此一直报告未聚焦，重试循环会跑满整个保护期。
#[cfg(windows)]
fn main_window_is_foreground(window: &tauri::WebviewWindow) -> bool {
    window
        .hwnd()
        .map(|hwnd| unsafe { GetForegroundWindow() } == hwnd)
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn main_window_is_foreground(window: &tauri::WebviewWindow) -> bool {
    window.is_focused().unwrap_or(false)
}

/// 显示后短暂重试把启动台带到前台。
///
/// 这里绝不能调用 `window.set_focus()`：tao 在 `SetForegroundWindow` 失败时会用 `SendInput`
/// 向当前前台程序注入一次 ALT 按下/抬起来“偷”前台权限。ALT 抬起常常在前台切换后才送达，
/// 原前台程序（通常正是稍后要从启动台打开的应用）会一直认为 ALT 被按住，
/// 之后它的窗口对鼠标点击没有反应、标题栏按钮卡在悬停态。
fn schedule_main_window_focus_retry(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(MAIN_WINDOW_FOCUS_RETRY_DELAY_MS));

        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let state = app.state::<MainWindowState>();
        let step = resolve_focus_retry_step(
            window.is_visible().unwrap_or(false),
            main_window_is_foreground(&window),
            main_window_blur_guard_active(&state),
        );
        match step {
            FocusRetryStep::Settle => {
                clear_main_window_blur_guard(&state);
                return;
            }
            FocusRetryStep::GiveUp => {
                state.suppress_blur.store(false, Ordering::SeqCst);
                return;
            }
            FocusRetryStep::Activate => {
                // SetActiveWindow / SetFocus 只对调用线程自己的窗口生效，激活必须回到主线程。
                let _ = app.run_on_main_thread(move || {
                    let _ = activate_webview_window(&window);
                });
            }
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

    let window_icon = crate::native_icon::from_ico(crate::window_icon::MAX_WINDOW_ICON_SIZE)
        .expect("public/logo.ico must contain a valid window icon frame");
    let builder =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("DesktopGo")
            .icon(window_icon)
            .expect("Failed to configure main window icon")
            .inner_size(initial_width, initial_height)
            .background_color(background_color)
            .fullscreen(false)
            .resizable(false)
            .decorations(false)
            .shadow(false)
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
            if let Err(error) = crate::window_icon::install(&window) {
                eprintln!("Warning: Failed to install main window icon: {error}");
            }
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

/// 把任意字符串编码为 URL 查询参数值（比 encodeURIComponent 更保守：非字母数字全部转义）。
fn encode_query_component(value: &str) -> String {
    percent_encoding::utf8_percent_encode(value, percent_encoding::NON_ALPHANUMERIC).to_string()
}

/// 创建壁纸独立查看窗口；已存在则直接复用。
///
/// 窗口样式与设置窗口完全一致：无边框、无原生阴影/圆角/边框（DWM），
/// 窗口尺寸含四周阴影留白（由 window-frame.css 的 --window-shadow-inset 消化）。
/// 前端渲染就绪后自行 show + 聚焦（创建时不可见，避免透明空窗闪现）。
pub(crate) fn create_wallpaper_viewer_window(
    app: &tauri::AppHandle,
    src: &str,
    title: &str,
    subtitle: &str,
) -> Result<(), String> {
    if app.get_webview_window("wallpaper-viewer").is_some() {
        return Ok(());
    }

    let window_icon = crate::native_icon::from_ico(crate::window_icon::MAX_WINDOW_ICON_SIZE)
        .map_err(|error| format!("Failed to load wallpaper viewer window icon: {error}"))?;
    let url = format!(
        "index.html?page=wallpaper-viewer&src={}&title={}&subtitle={}",
        encode_query_component(src),
        encode_query_component(title),
        encode_query_component(subtitle)
    );
    let (width, height) = window_size_with_shadow(VIEWER_WINDOW_WIDTH, VIEWER_WINDOW_HEIGHT);
    let (min_width, min_height) =
        window_size_with_shadow(VIEWER_WINDOW_MIN_WIDTH, VIEWER_WINDOW_MIN_HEIGHT);
    let builder = tauri::WebviewWindowBuilder::new(
        app,
        "wallpaper-viewer",
        tauri::WebviewUrl::App(url.into()),
    )
    .title("壁纸预览")
    .icon(window_icon)
    .map_err(|error| format!("Failed to configure wallpaper viewer window icon: {error}"))?
    .on_page_load(|window, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            if let Err(error) = crate::window_icon::refresh(&window) {
                eprintln!(
                    "Warning: Failed to refresh wallpaper viewer window icon after page load: {error}"
                );
            }
            if let Err(error) = window.set_skip_taskbar(false) {
                eprintln!(
                    "Warning: Failed to add wallpaper viewer window to taskbar after page load: {error}"
                );
            }
        }
    });

    builder
        .inner_size(width, height)
        .min_inner_size(min_width, min_height)
        .background_color(tauri::utils::config::Color(0, 0, 0, 0))
        .transparent(true)
        .center()
        .resizable(true)
        .decorations(false)
        .shadow(false)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|error| format!("Failed to create wallpaper viewer window: {error}"))
        .and_then(|window| {
            crate::window_icon::install(&window).map_err(|error| {
                format!("Failed to install wallpaper viewer window icon: {error}")
            })?;
            #[cfg(windows)]
            {
                if let Err(error) = crate::window_style::disable_window_corner_preference(&window) {
                    eprintln!("Warning: {error}");
                }
                if let Err(error) = crate::window_style::remove_native_window_border(&window) {
                    eprintln!("Warning: {error}");
                }
            }
            Ok(())
        })
        .map(|_| ())
}

/// 创建设置窗口；已存在则直接复用。
///
/// 只能在事件循环顶层（托盘回调）或工作线程（async 命令）调用：同步 Tauri 命令跑在主线程上，
/// `build()` 会内联建窗并嵌套消息泵，主窗口可见时会把主线程卡死。
/// `return_to_main` 决定关闭设置后是否回到启动台，前端按 URL 参数读取。
pub(crate) fn create_settings_window(
    app: &tauri::AppHandle,
    return_to_main: bool,
) -> Result<(), String> {
    if app.get_webview_window("settings").is_some() {
        return Ok(());
    }

    let bootstrap_script = build_window_bootstrap_script(app, false);
    let window_icon = crate::native_icon::from_ico(crate::window_icon::MAX_WINDOW_ICON_SIZE)
        .map_err(|error| format!("Failed to load settings window icon: {error}"))?;
    let url = if return_to_main {
        "index.html?page=settings&returnToMain=1"
    } else {
        "index.html?page=settings"
    };
    let builder =
        tauri::WebviewWindowBuilder::new(app, "settings", tauri::WebviewUrl::App(url.into()))
            .title(settings_window_title(app))
            .icon(window_icon)
            .map_err(|error| format!("Failed to configure settings window icon: {error}"))?
            .on_page_load(|window, payload| {
                if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                    if let Err(error) = crate::window_icon::refresh(&window) {
                        eprintln!(
                    "Warning: Failed to refresh settings window icon after page load: {error}"
                );
                    }
                    if let Err(error) = window.set_skip_taskbar(false) {
                        eprintln!(
                    "Warning: Failed to add settings window to taskbar after page load: {error}"
                );
                    }
                }
            });
    let (width, height) = window_size_with_shadow(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT);
    builder
        .inner_size(width, height)
        .min_inner_size(width, height)
        .background_color(tauri::utils::config::Color(0, 0, 0, 0))
        .transparent(true)
        .center()
        .resizable(true)
        .decorations(false)
        .shadow(false)
        .skip_taskbar(true)
        .visible(false)
        .initialization_script(bootstrap_script)
        .build()
        .map_err(|error| format!("Failed to create settings window: {error}"))
        .and_then(|window| {
            crate::window_icon::install(&window)
                .map_err(|error| format!("Failed to install settings window icon: {error}"))?;
            #[cfg(windows)]
            {
                if let Err(error) = crate::window_style::disable_window_corner_preference(&window) {
                    eprintln!("Warning: {error}");
                }
                if let Err(error) = crate::window_style::remove_native_window_border(&window) {
                    eprintln!("Warning: {error}");
                }
            }
            Ok(window)
        })
        .map(|_| ())
}

/// 打开设置窗口时是否要隐藏启动台。
///
/// 由「窗口常驻」决定，而不是由入口决定：
/// - 常驻开启（默认）：启动台不置顶、失焦也不自动隐藏，是一个常规窗口，理应留在原地。
/// - 常驻关闭：启动台是置顶的失焦即隐面板，留着会盖住设置窗口，必须隐藏。
fn settings_should_hide_main_window(state: &MainWindowState) -> bool {
    !main_window_persistent_enabled(state)
}

/// 显示已创建好的设置窗口。这里不建窗：本函数会从同步 Tauri 命令（主线程）调用，
/// 建窗必须先经 [`create_settings_window`] 在托盘回调或 async 命令里完成。
pub(crate) fn show_settings_window(app: &tauri::AppHandle) -> Result<(), String> {
    refresh_settings_window_title(app);

    let settings_window = app
        .get_webview_window("settings")
        .ok_or_else(|| "Settings window not found".to_string())?;
    let _ = settings_window.unminimize();
    // 图标在 show() 之前再刷一次：窗口一旦可见，Shell 就会按当前图标槽创建任务栏按钮并缓存，
    // 之后再刷新图标也改不回来。
    if let Err(error) = crate::window_icon::refresh(&settings_window) {
        eprintln!("Warning: Failed to refresh settings window icon before showing: {error}");
    }
    let _ = settings_window.show();
    #[cfg(windows)]
    {
        if let Err(error) = settings_window.set_skip_taskbar(true) {
            eprintln!("Warning: Failed to remove stale settings taskbar tab: {error}");
        }
        if let Err(error) = settings_window.set_skip_taskbar(false) {
            eprintln!("Warning: Failed to recreate settings taskbar tab: {error}");
        }
    }
    #[cfg(windows)]
    {
        if let Err(error) = crate::window_style::disable_window_corner_preference(&settings_window)
        {
            eprintln!("Warning: {error}");
        }
        if let Err(error) = crate::window_style::remove_native_window_border(&settings_window) {
            eprintln!("Warning: {error}");
        }
    }
    activate_webview_window(&settings_window)?;
    if settings_should_hide_main_window(&app.state::<MainWindowState>()) {
        hide_main_window(app);
    }
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

/// 把窗口设为前台窗口，失败时借前台线程的输入队列再试一次。
///
/// 这是不注入任何键盘输入的前台切换方式：`AttachThreadInput` 只是让本线程与当前前台线程
/// 临时共享输入状态，从而获得 `SetForegroundWindow` 的许可，不会给其他程序发送按键。
#[cfg(windows)]
pub(crate) unsafe fn bring_window_to_foreground(hwnd: HWND) -> bool {
    if SetForegroundWindow(hwnd).as_bool() {
        return true;
    }

    let foreground = GetForegroundWindow();
    if foreground == hwnd {
        return true;
    }
    if foreground.0.is_null() {
        return false;
    }

    let foreground_thread = GetWindowThreadProcessId(foreground, None);
    let current_thread = GetCurrentThreadId();
    if foreground_thread == 0 || foreground_thread == current_thread {
        return false;
    }
    if !AttachThreadInput(current_thread, foreground_thread, true).as_bool() {
        return false;
    }
    let activated = SetForegroundWindow(hwnd).as_bool();
    let _ = AttachThreadInput(current_thread, foreground_thread, false);
    activated
}

/// 激活窗口并交出键盘焦点。只用 Win32 前台/焦点调用，绝不经过 tao 的 `set_focus`
/// （它会向前台程序注入 ALT 按键，见 [`schedule_main_window_focus_retry`]）。
pub(crate) fn activate_webview_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd = window
            .hwnd()
            .map_err(|error| format!("Failed to resolve window HWND: {}", error))?;

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
            let _ = bring_window_to_foreground(hwnd);
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

    #[test]
    fn settings_hides_the_launchpad_only_when_it_is_not_persistent() {
        let state = MainWindowState::default();

        // 常驻关闭：启动台置顶且失焦即隐，留着会盖住设置窗口。
        state
            .window_persistent_enabled
            .store(false, Ordering::SeqCst);
        assert!(settings_should_hide_main_window(&state));

        // 常驻开启（默认）：启动台是常规窗口，打开设置不该让它消失。
        state
            .window_persistent_enabled
            .store(true, Ordering::SeqCst);
        assert!(!settings_should_hide_main_window(&state));
    }

    #[test]
    fn focus_retry_settles_once_the_window_is_hidden_or_in_front() {
        assert_eq!(
            resolve_focus_retry_step(false, false, true),
            FocusRetryStep::Settle
        );
        assert_eq!(
            resolve_focus_retry_step(true, true, true),
            FocusRetryStep::Settle
        );
        assert_eq!(
            resolve_focus_retry_step(true, true, false),
            FocusRetryStep::Settle
        );
    }

    #[test]
    fn focus_retry_keeps_activating_only_while_the_blur_guard_lasts() {
        assert_eq!(
            resolve_focus_retry_step(true, false, true),
            FocusRetryStep::Activate
        );
        assert_eq!(
            resolve_focus_retry_step(true, false, false),
            FocusRetryStep::GiveUp
        );
    }

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
