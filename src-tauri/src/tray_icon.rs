use std::cmp::Reverse;
use std::io::{self, Cursor};

use ico::IconDir;
use tauri::image::Image;

const LOGICAL_TRAY_ICON_SIZE: f64 = 16.0;
const MIN_TRAY_ICON_SIZE: u32 = 16;
const MAX_TRAY_ICON_SIZE: u32 = 64;
const LOGO_ICO: &[u8] = include_bytes!("../../public/logo.ico");

pub(crate) fn build(scale_factor: f64) -> Image<'static> {
    let size = physical_size(scale_factor);
    let image = decode_frame(size).expect("public/logo.ico must contain a valid tray icon frame");
    let width = image.width();
    let height = image.height();
    Image::new_owned(image.into_rgba_data(), width, height)
}

fn physical_size(scale_factor: f64) -> u32 {
    let scale_factor = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    (LOGICAL_TRAY_ICON_SIZE * scale_factor)
        .round()
        .clamp(MIN_TRAY_ICON_SIZE as f64, MAX_TRAY_ICON_SIZE as f64) as u32
}

fn decode_frame(target_size: u32) -> io::Result<ico::IconImage> {
    let icon_dir = IconDir::read(Cursor::new(LOGO_ICO))?;
    let entry = icon_dir
        .entries()
        .iter()
        .filter(|entry| entry.width() == entry.height())
        .min_by_key(|entry| {
            let distance = entry.width().abs_diff(target_size);
            (distance, Reverse(entry.width()))
        })
        .ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidData, "logo.ico has no square frames")
        })?;

    entry.decode()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scales_to_physical_tray_pixels() {
        assert_eq!(physical_size(1.0), 16);
        assert_eq!(physical_size(1.25), 20);
        assert_eq!(physical_size(1.5), 24);
        assert_eq!(physical_size(2.0), 32);
    }

    #[test]
    fn uses_the_nearest_larger_ico_frame_when_sizes_are_equidistant() {
        assert_eq!(decode_frame(16).unwrap().width(), 16);
        assert_eq!(decode_frame(20).unwrap().width(), 24);
        assert_eq!(decode_frame(40).unwrap().width(), 48);
    }

    #[test]
    fn decodes_a_valid_rgba_frame() {
        let image = decode_frame(32).unwrap();
        assert_eq!(image.width(), 32);
        assert_eq!(image.height(), 32);
        assert_eq!(image.rgba_data().len(), 32 * 32 * 4);
    }
}
