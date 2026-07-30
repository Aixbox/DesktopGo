use base64::Engine;

pub(super) fn decode_data_uri(data_uri: &str) -> Result<Vec<u8>, String> {
    if data_uri.is_empty() {
        return Ok(Vec::new());
    }

    let (_, raw) = data_uri
        .split_once(',')
        .ok_or_else(|| "Invalid data URI for icon data".to_string())?;
    base64::engine::general_purpose::STANDARD
        .decode(raw)
        .map_err(|e| format!("Failed to decode icon base64 data: {}", e))
}

/// Shared tail of every native icon extraction: straight RGBA pixels become the
/// PNG data URI the WebView renders.
pub(super) fn encode_rgba_png_data_uri(rgba: &[u8], width: u32, height: u32) -> Option<String> {
    if width == 0 || height == 0 || rgba.len() < (width as usize) * (height as usize) * 4 {
        return None;
    }

    let mut png = Vec::new();
    {
        use image::ImageEncoder;
        image::codecs::png::PngEncoder::new(&mut png)
            .write_image(rgba, width, height, image::ExtendedColorType::Rgba8)
            .ok()?;
    }

    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&png)
    ))
}

/// Windows hands back bottom-up BGRA; the encoder wants straight RGBA.
pub(super) fn bgra_to_rgba(bgra: &[u8]) -> Vec<u8> {
    let mut rgba = bgra.to_vec();
    for pixel in rgba.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    rgba
}

/// A fully transparent result means the source carried no alpha channel at all,
/// not that the icon is invisible.
pub(super) fn is_fully_transparent(rgba: &[u8]) -> bool {
    rgba.iter().skip(3).step_by(4).all(|alpha| *alpha == 0)
}

#[cfg(test)]
mod tests {
    use super::{bgra_to_rgba, encode_rgba_png_data_uri, is_fully_transparent};

    #[test]
    fn converts_bgra_pixels_to_rgba() {
        assert_eq!(bgra_to_rgba(&[1, 2, 3, 4]), vec![3, 2, 1, 4]);
    }

    #[test]
    fn detects_missing_alpha_channel() {
        assert!(is_fully_transparent(&[9, 9, 9, 0, 8, 8, 8, 0]));
        assert!(!is_fully_transparent(&[9, 9, 9, 0, 8, 8, 8, 255]));
    }

    #[test]
    fn rejects_pixel_buffers_that_do_not_match_the_reported_size() {
        assert!(encode_rgba_png_data_uri(&[0, 0, 0, 0], 2, 2).is_none());
        assert!(encode_rgba_png_data_uri(&[], 0, 0).is_none());
    }

    #[test]
    fn encodes_a_png_data_uri() {
        let icon = encode_rgba_png_data_uri(&[1, 2, 3, 255], 1, 1).expect("icon data uri");
        assert!(icon.starts_with("data:image/png;base64,"));
    }
}
