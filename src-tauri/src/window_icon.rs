use tauri::{WebviewWindow, WindowEvent};

#[cfg(windows)]
use std::collections::HashMap;
#[cfg(windows)]
use std::sync::{Mutex, OnceLock};

const LOGICAL_WINDOW_ICON_SIZE: f64 = 32.0;
const MIN_WINDOW_ICON_SIZE: u32 = 32;
pub(crate) const MAX_WINDOW_ICON_SIZE: u32 = 256;

#[cfg(windows)]
const APPLICATION_ICON_RESOURCE_ID: u16 = 32_512;
/// 每个窗口自己的 WM_SETICON 句柄，(ICON_BIG, ICON_SMALL)，销毁窗口时释放。
#[cfg(windows)]
static TASKBAR_ICONS: OnceLock<Mutex<HashMap<isize, (isize, isize)>>> = OnceLock::new();

pub(crate) fn build(scale_factor: f64) -> tauri::image::Image<'static> {
    let size = crate::native_icon::physical_size(
        LOGICAL_WINDOW_ICON_SIZE,
        scale_factor,
        MIN_WINDOW_ICON_SIZE,
        MAX_WINDOW_ICON_SIZE,
    );
    crate::native_icon::from_ico(size)
        .expect("public/logo.ico must contain a valid window icon frame")
}

pub(crate) fn install(window: &WebviewWindow) -> Result<(), String> {
    refresh(window)?;

    let icon_window = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::ScaleFactorChanged { scale_factor, .. } = event {
            let icon = build(*scale_factor);
            if let Err(error) = icon_window.set_icon(icon.clone()) {
                eprintln!("Warning: Failed to refresh window icon after DPI change: {error}");
            }
            #[cfg(windows)]
            if let Err(error) = install_taskbar_icon(&icon_window, &icon) {
                eprintln!("Warning: Failed to refresh taskbar icon after DPI change: {error}");
            }
        }
        #[cfg(windows)]
        if matches!(event, WindowEvent::Destroyed) {
            release_taskbar_icon(&icon_window);
        }
    });

    Ok(())
}

pub(crate) fn refresh(window: &WebviewWindow) -> Result<(), String> {
    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("Failed to resolve window scale factor: {error}"))?;
    let icon = build(scale_factor);
    window
        .set_icon(icon.clone())
        .map_err(|error| format!("Failed to set window icon: {error}"))?;
    #[cfg(windows)]
    install_taskbar_icon(window, &icon)?;
    Ok(())
}

/// 窗口类图标由同一个窗口类的所有窗口共享，不能随某个窗口销毁而释放，
/// 因此按尺寸缓存成进程级句柄，进程退出时由系统回收。
#[cfg(windows)]
fn class_icon_handle(size: i32) -> Result<isize, String> {
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{LoadImageW, IMAGE_ICON, LR_DEFAULTCOLOR};

    static CLASS_ICONS: OnceLock<Mutex<HashMap<i32, isize>>> = OnceLock::new();
    let cache = CLASS_ICONS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut cache = cache
        .lock()
        .map_err(|_| "Class icon cache is poisoned".to_string())?;
    if let Some(handle) = cache.get(&size) {
        return Ok(*handle);
    }

    let module = unsafe { GetModuleHandleW(windows::core::PCWSTR::null()) }
        .map_err(|error| format!("Failed to resolve application module: {error}"))?;
    let resource =
        windows::core::PCWSTR::from_raw(APPLICATION_ICON_RESOURCE_ID as usize as *const u16);
    // 这里不能用 LR_SHARED：它按资源 ID 缓存句柄并忽略请求尺寸，先加载大图标再请求
    // 小图标会拿回同一个大句柄，小图标槽因此塞进超尺寸图标，任务栏缩放后发虚。
    let handle = unsafe {
        LoadImageW(
            Some(module.into()),
            resource,
            IMAGE_ICON,
            size,
            size,
            LR_DEFAULTCOLOR,
        )
    }
    .map_err(|error| format!("Failed to load application class icon at {size}px: {error}"))?;
    cache.insert(size, handle.0 as isize);
    Ok(handle.0 as isize)
}

#[cfg(windows)]
fn install_taskbar_icon(
    window: &WebviewWindow,
    image: &tauri::image::Image<'_>,
) -> Result<(), String> {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, LoadImageW, SendMessageW, SetClassLongPtrW, GCLP_HICON, GCLP_HICONSM,
        ICON_BIG, ICON_SMALL, IMAGE_ICON, LR_DEFAULTCOLOR, SM_CXICON, SM_CXSMICON, WM_SETICON,
    };

    let module = unsafe { GetModuleHandleW(windows::core::PCWSTR::null()) }
        .map_err(|error| format!("Failed to resolve application module: {error}"))?;
    let resource =
        windows::core::PCWSTR::from_raw(APPLICATION_ICON_RESOURCE_ID as usize as *const u16);

    // TAO registers its window class without hIcon/hIconSm. A taskbar tab added
    // through ITaskbarList can therefore fall back to the class icon instead of
    // the per-window WM_SETICON value. Install both class slots from the native
    // executable resource so the Shell always has a high-resolution source.
    // 尺寸取系统当前 DPI 下的图标度量，硬编码会让 Shell 再缩放一次。
    let class_icon_size = unsafe { GetSystemMetrics(SM_CXICON) }.max(MIN_WINDOW_ICON_SIZE as i32);
    let class_small_icon_size = unsafe { GetSystemMetrics(SM_CXSMICON) }.max(1);
    let class_icon = class_icon_handle(class_icon_size)?;
    let class_small_icon = class_icon_handle(class_small_icon_size)?;

    // 窗口自己的图标槽按 DPI 选帧；小图标槽必须单独设置，否则任务栏只能回落到类图标。
    let load_window_icon = |size: i32| -> Result<isize, String> {
        unsafe {
            LoadImageW(
                Some(module.into()),
                resource,
                IMAGE_ICON,
                size,
                size,
                LR_DEFAULTCOLOR,
            )
        }
        .map(|handle| handle.0 as isize)
        .map_err(|error| format!("Failed to load application taskbar icon at {size}px: {error}"))
    };
    let icon = load_window_icon(image.width() as i32)?;
    let small_icon = load_window_icon(class_small_icon_size)?;

    let hwnd = window
        .hwnd()
        .map_err(|error| format!("Failed to resolve window HWND: {error}"))?;
    unsafe {
        SetClassLongPtrW(hwnd, GCLP_HICON, class_icon);
        SetClassLongPtrW(hwnd, GCLP_HICONSM, class_small_icon);
        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_BIG as usize)),
            Some(LPARAM(icon)),
        );
        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_SMALL as usize)),
            Some(LPARAM(small_icon)),
        );
    }
    let icons = TASKBAR_ICONS.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut icons) = icons.lock() {
        if let Some((previous_big, previous_small)) =
            icons.insert(hwnd.0 as isize, (icon, small_icon))
        {
            destroy_icon(previous_big);
            destroy_icon(previous_small);
        }
    }
    Ok(())
}

#[cfg(windows)]
fn destroy_icon(handle: isize) {
    if handle == 0 {
        return;
    }
    unsafe {
        let _ = windows::Win32::UI::WindowsAndMessaging::DestroyIcon(
            windows::Win32::UI::WindowsAndMessaging::HICON(handle as _),
        );
    }
}

#[cfg(windows)]
fn release_taskbar_icon(window: &WebviewWindow) {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, ICON_BIG, ICON_SMALL, WM_SETICON};

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    unsafe {
        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_BIG as usize)),
            Some(LPARAM(0)),
        );
        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_SMALL as usize)),
            Some(LPARAM(0)),
        );
    }
    let Some(icons) = TASKBAR_ICONS.get() else {
        return;
    };
    if let Ok(mut icons) = icons.lock() {
        if let Some((big, small)) = icons.remove(&(hwnd.0 as isize)) {
            destroy_icon(big);
            destroy_icon(small);
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn chooses_window_icon_sizes_from_dpi() {
        assert_eq!(crate::native_icon::physical_size(32.0, 1.0, 32, 256), 32);
        assert_eq!(crate::native_icon::physical_size(32.0, 1.5, 32, 256), 48);
        assert_eq!(crate::native_icon::physical_size(32.0, 2.0, 32, 256), 64);
    }

    #[test]
    fn builds_the_matching_high_dpi_ico_frame() {
        assert_eq!(super::build(1.5).width(), 48);
        assert_eq!(super::build(2.0).width(), 64);
    }
}
