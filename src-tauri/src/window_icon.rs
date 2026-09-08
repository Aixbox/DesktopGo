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
#[cfg(windows)]
static TASKBAR_ICONS: OnceLock<Mutex<HashMap<isize, isize>>> = OnceLock::new();

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

#[cfg(windows)]
fn install_taskbar_icon(
    window: &WebviewWindow,
    image: &tauri::image::Image<'_>,
) -> Result<(), String> {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        LoadImageW, SendMessageW, SetClassLongPtrW, GCLP_HICON, GCLP_HICONSM, ICON_BIG, IMAGE_ICON,
        LR_DEFAULTCOLOR, LR_SHARED, WM_SETICON,
    };
    let module = unsafe { GetModuleHandleW(windows::core::PCWSTR::null()) }
        .map_err(|error| format!("Failed to resolve application module: {error}"))?;
    let resource =
        windows::core::PCWSTR::from_raw(APPLICATION_ICON_RESOURCE_ID as usize as *const u16);

    // TAO registers its window class without hIcon/hIconSm. A taskbar tab added
    // through ITaskbarList can therefore fall back to the class icon instead of
    // the per-window WM_SETICON value. Install both class slots from the native
    // executable resource so the Shell always has a high-resolution source.
    let class_icon = unsafe {
        LoadImageW(
            Some(module.into()),
            resource,
            IMAGE_ICON,
            MAX_WINDOW_ICON_SIZE as i32,
            MAX_WINDOW_ICON_SIZE as i32,
            LR_DEFAULTCOLOR | LR_SHARED,
        )
    }
    .map_err(|error| format!("Failed to load shared application class icon: {error}"))?;
    let class_small_icon = unsafe {
        LoadImageW(
            Some(module.into()),
            resource,
            IMAGE_ICON,
            MIN_WINDOW_ICON_SIZE as i32,
            MIN_WINDOW_ICON_SIZE as i32,
            LR_DEFAULTCOLOR | LR_SHARED,
        )
    }
    .map_err(|error| format!("Failed to load shared application small class icon: {error}"))?;
    let icon = unsafe {
        LoadImageW(
            Some(module.into()),
            resource,
            IMAGE_ICON,
            image.width() as i32,
            image.height() as i32,
            LR_DEFAULTCOLOR,
        )
    }
    .map(|handle| windows::Win32::UI::WindowsAndMessaging::HICON(handle.0))
    .map_err(|error| format!("Failed to load application taskbar icon: {error}"))?;
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("Failed to resolve window HWND: {error}"))?;
    unsafe {
        SetClassLongPtrW(hwnd, GCLP_HICON, class_icon.0 as isize);
        SetClassLongPtrW(hwnd, GCLP_HICONSM, class_small_icon.0 as isize);
        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_BIG as usize)),
            Some(LPARAM(icon.0 as isize)),
        );
    }
    let icons = TASKBAR_ICONS.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut icons) = icons.lock() {
        if let Some(previous) = icons.insert(hwnd.0 as isize, icon.0 as isize) {
            unsafe {
                let _ = windows::Win32::UI::WindowsAndMessaging::DestroyIcon(
                    windows::Win32::UI::WindowsAndMessaging::HICON(previous as _),
                );
            }
        }
    }
    Ok(())
}

#[cfg(windows)]
fn release_taskbar_icon(window: &WebviewWindow) {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, ICON_BIG, WM_SETICON};

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
    }
    let Some(icons) = TASKBAR_ICONS.get() else {
        return;
    };
    if let Ok(mut icons) = icons.lock() {
        if let Some(icon) = icons.remove(&(hwnd.0 as isize)) {
            unsafe {
                let _ = windows::Win32::UI::WindowsAndMessaging::DestroyIcon(
                    windows::Win32::UI::WindowsAndMessaging::HICON(icon as _),
                );
            }
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
