use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};

#[cfg(windows)]
use core::ffi::c_void;
#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{SetActiveWindow, SetFocus};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetForegroundWindow, SetForegroundWindow, SetWindowPos,
    SystemParametersInfoW, HWND_TOP, SPI_GETFOREGROUNDLOCKTIMEOUT, SPI_SETFOREGROUNDLOCKTIMEOUT,
    SWP_NOMOVE, SWP_NOSIZE, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

use crate::tray::{refresh_settings_window_title, refresh_tray_menu, settings_window_title};
use crate::window_style::{
    apply_main_window_runtime_mode, apply_main_window_style, build_window_bootstrap_script,
    main_window_persistent_enabled, main_window_should_use_transparent_surface,
    main_window_uses_delayed_reveal, read_saved_window_mode, read_saved_window_style,
    resolve_initial_main_window_size, resolve_main_window_background_color,
    resolve_saved_main_window_content_size, resolved_theme_is_dark,
    schedule_main_window_style_refresh, sync_main_window_dom_visibility, window_size_with_shadow,
};
use crate::{DisplayLayout, MainWindowState};

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
        // 改过分辨率/缩放后，旧的居中坐标已经失效，显示前先摆回工作区正中。
        align_main_window_to_display(app, &window);
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

/// 主窗口所在显示器的工作区与缩放比例。
fn resolve_display_layout(window: &tauri::WebviewWindow) -> Option<DisplayLayout> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let work_area = monitor.work_area();

    Some(DisplayLayout {
        monitor: monitor.name().cloned(),
        x: work_area.position.x,
        y: work_area.position.y,
        width: work_area.size.width,
        height: work_area.size.height,
        scale_milli: (monitor.scale_factor() * 1000.0).round() as u32,
    })
}

/// 记下当前显示器布局，作为下次判断“分辨率/缩放变了没有”的基准。
fn store_display_layout(app: &tauri::AppHandle, layout: DisplayLayout) {
    if let Ok(mut stored) = app.state::<MainWindowState>().display_layout.lock() {
        *stored = Some(layout);
    }
}

fn remember_display_layout(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    if let Some(layout) = resolve_display_layout(window) {
        store_display_layout(app, layout);
    }
}

/// 是否要按当前显示器重新摆放主窗口。
///
/// 同一台显示器换了分辨率或缩放：旧坐标已经不是居中位置，必须重排。
/// 换到另一台显示器是用户自己拖过去的，保持原样；但窗口整块落在工作区外时得拉回来。
fn main_window_needs_display_realign(
    previous: Option<&DisplayLayout>,
    current: &DisplayLayout,
    outside_work_area: bool,
) -> bool {
    let layout_changed =
        previous.is_some_and(|previous| previous.monitor == current.monitor && previous != current);
    layout_changed || outside_work_area
}

fn bounds_outside_work_area(
    left: i32,
    top: i32,
    width: u32,
    height: u32,
    layout: &DisplayLayout,
) -> bool {
    let right = left + width as i32;
    let bottom = top + height as i32;
    let area_right = layout.x + layout.width as i32;
    let area_bottom = layout.y + layout.height as i32;

    right <= layout.x || left >= area_right || bottom <= layout.y || top >= area_bottom
}

fn main_window_outside_work_area(window: &tauri::WebviewWindow, layout: &DisplayLayout) -> bool {
    let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return false;
    };

    bounds_outside_work_area(position.x, position.y, size.width, size.height, layout)
}

fn center_position_in_layout(layout: &DisplayLayout, width: u32, height: u32) -> (i32, i32) {
    (
        layout.x + (layout.width as i32 - width as i32) / 2,
        layout.y + (layout.height as i32 - height as i32) / 2,
    )
}

/// 主窗口内容区的目标物理尺寸（含四周阴影留白，与建窗时的 `inner_size` 一致）。
/// 全屏模式铺满工作区；屏幕比窗口还小时按工作区截断，免得居中出现负坐标。
fn main_window_target_size(app: &tauri::AppHandle, layout: &DisplayLayout) -> (u32, u32) {
    let (width, height) = if read_saved_window_mode(app) == Some("fullscreen") {
        (layout.width, layout.height)
    } else {
        let (content_width, content_height) = resolve_saved_main_window_content_size(app);
        let (width, height) = window_size_with_shadow(content_width, content_height);
        let scale = f64::from(layout.scale_milli) / 1000.0;
        (
            (width * scale).round() as u32,
            (height * scale).round() as u32,
        )
    };

    clamp_to_work_area(width, height, layout)
}

fn clamp_to_work_area(width: u32, height: u32, layout: &DisplayLayout) -> (u32, u32) {
    (
        width.clamp(1, layout.width.max(1)),
        height.clamp(1, layout.height.max(1)),
    )
}

fn place_main_window_in_layout(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    layout: &DisplayLayout,
) -> Result<(), String> {
    let (width, height) = main_window_target_size(app, layout);
    let (x, y) = center_position_in_layout(layout, width, height);

    window
        .set_size(tauri::PhysicalSize::new(width, height))
        .map_err(|error| format!("Failed to resize main window after display change: {error}"))?;
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|error| format!("Failed to move main window after display change: {error}"))
}

/// 显示前按当前显示器校正主窗口位置。
///
/// 建窗时 `center()` 只算一次位置，之后 `show()` 不会重算，所以改了分辨率或缩放再按
/// Ctrl+Space 呼出时，窗口还停在旧工作区的坐标上。这里只在显示器布局真的变了（或窗口
/// 已经落回工作区外）时才重排，用户自己拖到别处、换到另一台显示器的位置都保留。
fn align_main_window_to_display(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    // 最小化时窗口矩形是任务栏图标位置、`SetWindowPos` 也改不了恢复位置，
    // 这一步直接跳过：既不动窗口，也不把主显示器的布局误写成基准。
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let Some(layout) = resolve_display_layout(window) else {
        return;
    };
    let state = app.state::<MainWindowState>();
    let outside = main_window_outside_work_area(window, &layout);
    let previous = state
        .display_layout
        .lock()
        .ok()
        .and_then(|stored| stored.as_ref().cloned());

    if main_window_needs_display_realign(previous.as_ref(), &layout, outside) {
        if let Err(error) = place_main_window_in_layout(app, window, &layout) {
            eprintln!("Warning: {error}");
        }
    }

    store_display_layout(app, layout);
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
            // 建窗时 `center()` 用的是当前显示器，这个快照就是后续比对的基准。
            remember_display_layout(app, &window);
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
    tab: Option<&str>,
) -> Result<(), String> {
    if app.get_webview_window("settings").is_some() {
        // 窗口已存在，激活并显示它
        return show_settings_window(app);
    }

    let bootstrap_script = build_window_bootstrap_script(app, false);
    let window_icon = crate::native_icon::from_ico(crate::window_icon::MAX_WINDOW_ICON_SIZE)
        .map_err(|error| format!("Failed to load settings window icon: {error}"))?;
    let url = match (return_to_main, tab) {
        (true, Some(tab)) => format!("index.html?page=settings&returnToMain=1&tab={}", tab),
        (true, None) => "index.html?page=settings&returnToMain=1".to_string(),
        (false, Some(tab)) => format!("index.html?page=settings&tab={}", tab),
        (false, None) => "index.html?page=settings".to_string(),
    };
    let builder = tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App(url.as_str().into()),
    )
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

/// 临时把系统的「前台锁定超时」清零，离开作用域时恢复原值。
///
/// 这是唯一既不注入键盘输入、也不碰其他线程输入队列的前台切换辅助手段。之前用的
/// `AttachThreadInput` 会让本线程与当前前台程序的线程共享输入状态（焦点、捕获、按键状态），
/// 解绑时对方线程的输入状态被重置，正是那个程序（通常就是随后要从启动台唤起的应用）
/// 会停在标题栏按钮卡悬停态、鼠标点击无响应的状态。
#[cfg(windows)]
struct ForegroundLockTimeoutReset {
    previous_timeout_ms: Option<u32>,
}

#[cfg(windows)]
impl ForegroundLockTimeoutReset {
    unsafe fn apply() -> Self {
        let mut previous: u32 = 0;
        let read = SystemParametersInfoW(
            SPI_GETFOREGROUNDLOCKTIMEOUT,
            0,
            Some(&mut previous as *mut u32 as *mut c_void),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .is_ok();
        if !read || previous == 0 {
            return Self {
                previous_timeout_ms: None,
            };
        }
        // 这个 SPI 用 pvParam 直接承载数值（不是指针）；标志位传 0：不写注册表、不广播设置变更。
        let cleared = SystemParametersInfoW(
            SPI_SETFOREGROUNDLOCKTIMEOUT,
            0,
            Some(std::ptr::null_mut()),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .is_ok();
        Self {
            previous_timeout_ms: cleared.then_some(previous),
        }
    }
}

#[cfg(windows)]
impl Drop for ForegroundLockTimeoutReset {
    fn drop(&mut self) {
        if let Some(previous) = self.previous_timeout_ms {
            unsafe {
                let _ = SystemParametersInfoW(
                    SPI_SETFOREGROUNDLOCKTIMEOUT,
                    0,
                    Some(previous as usize as *mut c_void),
                    SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
                );
            }
        }
    }
}

/// 把窗口设为前台窗口。
///
/// 只用 `SetForegroundWindow`，失败时清零前台锁定超时再试一次；绝不 `AttachThreadInput`、
/// 绝不模拟按键（见 [`ForegroundLockTimeoutReset`] 与 [`schedule_main_window_focus_retry`]）。
/// 还是失败就交给调用方的重试循环，宁可让用户自己点一下，也不能把别的程序搞卡。
#[cfg(windows)]
pub(crate) unsafe fn bring_window_to_foreground(hwnd: HWND) -> bool {
    if SetForegroundWindow(hwnd).as_bool() || GetForegroundWindow() == hwnd {
        return true;
    }

    let _reset = ForegroundLockTimeoutReset::apply();
    SetForegroundWindow(hwnd).as_bool() || GetForegroundWindow() == hwnd
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

    fn layout(monitor: &str, x: i32, y: i32, width: u32, height: u32) -> DisplayLayout {
        DisplayLayout {
            monitor: Some(monitor.to_string()),
            x,
            y,
            width,
            height,
            scale_milli: 1000,
        }
    }

    #[test]
    fn display_realign_ignores_the_first_snapshot() {
        // 建窗时已经居中过，没有基准就没有“变化”，不该多动一次窗口。
        assert!(!main_window_needs_display_realign(
            None,
            &layout("\\\\.\\DISPLAY1", 0, 0, 1920, 1040),
            false
        ));
    }

    #[test]
    fn display_realign_triggers_when_the_same_monitor_changes_resolution() {
        let previous = layout("\\\\.\\DISPLAY1", 0, 0, 1920, 1040);
        let current = layout("\\\\.\\DISPLAY1", 0, 0, 2560, 1400);

        assert!(main_window_needs_display_realign(
            Some(&previous),
            &current,
            false
        ));
    }

    #[test]
    fn display_realign_triggers_when_the_scale_factor_changes() {
        let previous = layout("\\\\.\\DISPLAY1", 0, 0, 1920, 1040);
        let mut current = previous.clone();
        current.scale_milli = 1500;

        assert!(main_window_needs_display_realign(
            Some(&previous),
            &current,
            false
        ));
    }

    #[test]
    fn display_realign_keeps_the_window_where_the_user_dragged_it() {
        // 用户把启动台拖到副屏：显示器换了，位置是用户挑的，不要抢回来。
        let previous = layout("\\\\.\\DISPLAY1", 0, 0, 1920, 1040);
        let current = layout("\\\\.\\DISPLAY2", 1920, 0, 2560, 1400);

        assert!(!main_window_needs_display_realign(
            Some(&previous),
            &current,
            false
        ));
    }

    #[test]
    fn display_realign_pulls_back_a_window_left_outside_the_work_area() {
        let previous = layout("\\\\.\\DISPLAY1", 0, 0, 1920, 1040);

        assert!(main_window_needs_display_realign(
            Some(&previous),
            &previous,
            true
        ));
    }

    #[test]
    fn work_area_overlap_detects_a_fully_displaced_window() {
        let area = layout("\\\\.\\DISPLAY1", 0, 0, 1920, 1040);

        // 1920x1040 缩到 1280x720 后，原来居中的 1312x752 窗口右侧和下方都出了界，
        // 但仍有重叠：不算“整块跑出去”，靠分辨率变化判断。
        assert!(!bounds_outside_work_area(304, 144, 1312, 752, &area));
        assert!(bounds_outside_work_area(-4000, 0, 1312, 752, &area));
        assert!(bounds_outside_work_area(0, 2000, 1312, 752, &area));
        assert!(bounds_outside_work_area(1920, 0, 1312, 752, &area));
    }

    #[test]
    fn center_position_follows_the_work_area_origin() {
        let primary = layout("\\\\.\\DISPLAY1", 0, 0, 1920, 1040);
        assert_eq!(center_position_in_layout(&primary, 1312, 752), (304, 144));

        // 副屏在主屏左侧时工作区 x 为负，居中位置也要跟着移。
        let secondary = layout("\\\\.\\DISPLAY2", -1920, 0, 1920, 1040);
        assert_eq!(
            center_position_in_layout(&secondary, 1312, 752),
            (-1616, 144)
        );
    }

    #[test]
    fn window_size_shrinks_only_when_it_cannot_fit_the_work_area() {
        let area = layout("\\\\.\\DISPLAY1", 0, 0, 1920, 1040);

        assert_eq!(clamp_to_work_area(1312, 752, &area), (1312, 752));
        assert_eq!(clamp_to_work_area(1632, 932, &area), (1632, 932));

        // 1280x720 的屏幕上，大窗口只能截断到工作区，否则居中出现负坐标。
        let small = layout("\\\\.\\DISPLAY1", 0, 0, 1280, 680);
        assert_eq!(clamp_to_work_area(1312, 752, &small), (1280, 680));
        assert_eq!(center_position_in_layout(&small, 1280, 680), (0, 0));
    }
}
