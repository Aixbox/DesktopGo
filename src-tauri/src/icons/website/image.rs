use std::cmp::Reverse;
use std::collections::HashSet;
use std::io::Cursor;

use base64::Engine;
use percent_encoding::percent_decode_str;
use url::Url;

use super::candidate::website_icon_quality;
use super::candidate::{WebsiteIconCandidate, WebsiteIconQuality};
use crate::icons::image_data::decode_data_uri;

pub(super) const ICON_OPTIMIZED_OUTPUT_SIZE: u32 = 512;
const MAX_WEBSITE_ICON_RESULTS: usize = 8;

#[derive(Debug, Clone, Copy)]
pub(super) struct IconSharpenSettings {
    pub(super) sigma: f32,
    pub(super) threshold: i32,
}

pub(super) fn has_visible_icon_content(image: &image::DynamicImage) -> bool {
    let rgba = image.to_rgba8();
    let sample_step = (rgba.width().max(rgba.height()) / 128).max(1) as usize;
    (0..rgba.height() as usize).step_by(sample_step).any(|y| {
        (0..rgba.width() as usize)
            .step_by(sample_step)
            .any(|x| rgba.get_pixel(x as u32, y as u32)[3] >= 16)
    })
}

fn render_svg_website_icon(bytes: &[u8]) -> Option<image::DynamicImage> {
    let options = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_data(bytes, &options).ok()?;
    let svg_size = tree.size();
    let width = svg_size.width();
    let height = svg_size.height();
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return None;
    }

    let scale = ICON_OPTIMIZED_OUTPUT_SIZE as f32 / width.max(height);
    let output_width = (width * scale)
        .ceil()
        .clamp(1.0, ICON_OPTIMIZED_OUTPUT_SIZE as f32) as u32;
    let output_height = (height * scale)
        .ceil()
        .clamp(1.0, ICON_OPTIMIZED_OUTPUT_SIZE as f32) as u32;
    let mut pixmap = resvg::tiny_skia::Pixmap::new(output_width, output_height)?;
    let transform = resvg::tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    let mut rgba = Vec::with_capacity((output_width * output_height * 4) as usize);
    for pixel in pixmap.pixels() {
        let color = pixel.demultiply();
        rgba.extend_from_slice(&[color.red(), color.green(), color.blue(), color.alpha()]);
    }
    let buffer = image::ImageBuffer::from_raw(output_width, output_height, rgba)?;
    Some(image::DynamicImage::ImageRgba8(buffer))
}

pub(super) fn decode_data_url_bytes(url: &Url) -> Option<Vec<u8>> {
    let value = url.as_str().strip_prefix("data:")?;
    let (metadata, payload) = value.split_once(',')?;
    if metadata
        .split(';')
        .any(|value| value.eq_ignore_ascii_case("base64"))
    {
        base64::engine::general_purpose::STANDARD
            .decode(payload.as_bytes())
            .ok()
    } else {
        Some(percent_decode_str(payload).collect())
    }
}

pub(super) fn decode_website_icon(bytes: &[u8]) -> Option<image::DynamicImage> {
    image::load_from_memory(bytes)
        .ok()
        .or_else(|| render_svg_website_icon(bytes))
}

fn icon_edge_contrast_score(image: &image::DynamicImage) -> f32 {
    let rgba = image.to_rgba8();
    let width = rgba.width();
    let height = rgba.height();
    if width < 2 || height < 2 {
        return 0.0;
    }

    let sample_step = (width.max(height) / 128).max(1) as usize;
    let mut contrast_sum = 0u64;
    let mut sample_count = 0u64;
    let luma = |pixel: &image::Rgba<u8>| -> i32 {
        (pixel[0] as i32 * 77 + pixel[1] as i32 * 150 + pixel[2] as i32 * 29) >> 8
    };

    for y in (sample_step..height as usize).step_by(sample_step) {
        for x in (sample_step..width as usize).step_by(sample_step) {
            let center = rgba.get_pixel(x as u32, y as u32);
            if center[3] < 16 {
                continue;
            }
            let left = rgba.get_pixel((x - sample_step) as u32, y as u32);
            let top = rgba.get_pixel(x as u32, (y - sample_step) as u32);
            let center_luma = luma(center);
            contrast_sum += center_luma.abs_diff(luma(left)) as u64;
            contrast_sum += center_luma.abs_diff(luma(top)) as u64;
            sample_count += 2;
        }
    }
    if sample_count == 0 {
        0.0
    } else {
        contrast_sum as f32 / sample_count as f32
    }
}

pub(super) fn icon_sharpen_settings(image: &image::DynamicImage) -> IconSharpenSettings {
    let min_dimension = image.width().min(image.height());
    let edge_contrast = icon_edge_contrast_score(image);
    if min_dimension <= 64 || edge_contrast < 6.0 {
        IconSharpenSettings {
            sigma: 1.2,
            threshold: 1,
        }
    } else if min_dimension <= 128 || edge_contrast < 14.0 {
        IconSharpenSettings {
            sigma: 1.05,
            threshold: 1,
        }
    } else {
        IconSharpenSettings {
            sigma: 0.9,
            threshold: 2,
        }
    }
}

fn sharpen_icon_preserving_alpha(
    resized: image::DynamicImage,
    settings: IconSharpenSettings,
) -> image::DynamicImage {
    let original = resized.to_rgba8();
    let mut premultiplied = original.clone();
    for pixel in premultiplied.pixels_mut() {
        let alpha = pixel[3] as u16;
        pixel[0] = ((pixel[0] as u16 * alpha + 127) / 255) as u8;
        pixel[1] = ((pixel[1] as u16 * alpha + 127) / 255) as u8;
        pixel[2] = ((pixel[2] as u16 * alpha + 127) / 255) as u8;
    }

    let sharpened = image::DynamicImage::ImageRgba8(premultiplied)
        .unsharpen(settings.sigma, settings.threshold)
        .to_rgba8();
    let mut output = sharpened;
    for (output_pixel, original_pixel) in output.pixels_mut().zip(original.pixels()) {
        let alpha = original_pixel[3] as u16;
        output_pixel[3] = original_pixel[3];
        if alpha == 0 {
            output_pixel[0] = 0;
            output_pixel[1] = 0;
            output_pixel[2] = 0;
            continue;
        }
        output_pixel[0] =
            ((output_pixel[0] as u32 * 255 + alpha as u32 / 2) / alpha as u32).min(255) as u8;
        output_pixel[1] =
            ((output_pixel[1] as u32 * 255 + alpha as u32 / 2) / alpha as u32).min(255) as u8;
        output_pixel[2] =
            ((output_pixel[2] as u32 * 255 + alpha as u32 / 2) / alpha as u32).min(255) as u8;
    }
    image::DynamicImage::ImageRgba8(output)
}

pub(super) fn optimize_icon_pixels(image: &image::DynamicImage, size: u32) -> image::DynamicImage {
    let settings = icon_sharpen_settings(image);
    let resized = image.resize(size, size, image::imageops::FilterType::Lanczos3);
    sharpen_icon_preserving_alpha(resized, settings)
}

pub fn optimize_icon_data_uri(data_uri: &str) -> Result<String, String> {
    let icon_data = decode_data_uri(data_uri)?;
    let source_image = image::load_from_memory(&icon_data)
        .map_err(|error| format!("Failed to decode icon for optimization: {error}"))?;
    let optimized = optimize_icon_pixels(&source_image, ICON_OPTIMIZED_OUTPUT_SIZE);
    let mut output = Cursor::new(Vec::new());
    optimized
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|error| format!("Failed to encode optimized icon: {error}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(output.into_inner())
    ))
}

pub(super) fn website_icon_to_data_uri(image: &image::DynamicImage) -> Result<String, String> {
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|error| format!("Failed to encode website icon: {error}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(output.into_inner())
    ))
}

pub(super) fn website_icon_data_uris(
    mut decoded_candidates: Vec<(WebsiteIconQuality, image::DynamicImage)>,
) -> Vec<String> {
    decoded_candidates.sort_by_key(|(quality, _)| Reverse(*quality));
    let mut seen_icons = HashSet::new();
    decoded_candidates
        .into_iter()
        .filter_map(|(_, image)| website_icon_to_data_uri(&image).ok())
        .filter(|icon| seen_icons.insert(icon.clone()))
        .take(MAX_WEBSITE_ICON_RESULTS)
        .collect()
}

pub(super) fn decode_candidate(
    bytes: &[u8],
    candidate: &WebsiteIconCandidate,
) -> Option<(WebsiteIconQuality, image::DynamicImage)> {
    let image = decode_website_icon(bytes)?;
    has_visible_icon_content(&image).then(|| (website_icon_quality(&image, candidate), image))
}
