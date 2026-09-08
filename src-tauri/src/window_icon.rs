use tauri::{WebviewWindow, WindowEvent};

const LOGICAL_WINDOW_ICON_SIZE: f64 = 32.0;
const MIN_WINDOW_ICON_SIZE: u32 = 32;
const MAX_WINDOW_ICON_SIZE: u32 = 256;

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
    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("Failed to resolve window scale factor: {error}"))?;
    window
        .set_icon(build(scale_factor))
        .map_err(|error| format!("Failed to set window icon: {error}"))?;

    let icon_window = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::ScaleFactorChanged { scale_factor, .. } = event {
            if let Err(error) = icon_window.set_icon(build(*scale_factor)) {
                eprintln!("Warning: Failed to refresh window icon after DPI change: {error}");
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn chooses_window_icon_sizes_from_dpi() {
        assert_eq!(crate::native_icon::physical_size(32.0, 1.0, 32, 256), 32);
        assert_eq!(crate::native_icon::physical_size(32.0, 1.5, 32, 256), 48);
        assert_eq!(crate::native_icon::physical_size(32.0, 2.0, 32, 256), 64);
    }
}
