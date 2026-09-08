use std::cmp::Reverse;
use std::io::{self, Cursor};

use ico::IconDir;
use tauri::image::Image;

const LOGO_ICO: &[u8] = include_bytes!("../../public/logo.ico");

pub(crate) fn from_ico(target_size: u32) -> io::Result<Image<'static>> {
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

    let image = entry.decode()?;
    let width = image.width();
    let height = image.height();
    Ok(Image::new_owned(image.into_rgba_data(), width, height))
}

pub(crate) fn physical_size(
    logical_size: f64,
    scale_factor: f64,
    min_size: u32,
    max_size: u32,
) -> u32 {
    let scale_factor = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    (logical_size * scale_factor)
        .round()
        .clamp(min_size as f64, max_size as f64) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_the_nearest_larger_frame_when_sizes_are_equidistant() {
        assert_eq!(from_ico(16).unwrap().width(), 16);
        assert_eq!(from_ico(20).unwrap().width(), 24);
        assert_eq!(from_ico(40).unwrap().width(), 48);
    }

    #[test]
    fn decodes_a_valid_rgba_frame() {
        let image = from_ico(32).unwrap();
        assert_eq!((image.width(), image.height()), (32, 32));
        assert_eq!(image.rgba().len(), 32 * 32 * 4);
    }
}
