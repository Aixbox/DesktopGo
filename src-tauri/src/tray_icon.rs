use tauri::image::Image;

const LOGICAL_TRAY_ICON_SIZE: f64 = 16.0;
const MIN_TRAY_ICON_SIZE: u32 = 16;
const MAX_TRAY_ICON_SIZE: u32 = 64;

pub(crate) fn build(scale_factor: f64) -> Image<'static> {
    let size = crate::native_icon::physical_size(
        LOGICAL_TRAY_ICON_SIZE,
        scale_factor,
        MIN_TRAY_ICON_SIZE,
        MAX_TRAY_ICON_SIZE,
    );
    crate::native_icon::from_ico(size)
        .expect("public/logo.ico must contain a valid tray icon frame")
}

#[cfg(test)]
mod tests {
    #[test]
    fn scales_to_physical_tray_pixels() {
        assert_eq!(crate::native_icon::physical_size(16.0, 1.0, 16, 64), 16);
        assert_eq!(crate::native_icon::physical_size(16.0, 1.25, 16, 64), 20);
        assert_eq!(crate::native_icon::physical_size(16.0, 1.5, 16, 64), 24);
        assert_eq!(crate::native_icon::physical_size(16.0, 2.0, 16, 64), 32);
    }
}
