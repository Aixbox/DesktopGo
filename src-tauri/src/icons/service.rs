use base64::Engine;
use futures_util::{stream, StreamExt};
use scraper::{Html, Selector};
use std::cmp::Reverse;
use std::collections::HashSet;
use std::io::Cursor;
use std::path::PathBuf;
use std::time::Duration;
use url::Url;

const ICON_PREVIEW_SIZE: u32 = 256;
const ICON_OPTIMIZED_OUTPUT_SIZE: u32 = 512;

#[derive(Debug, Clone, Copy)]
struct IconSharpenSettings {
    sigma: f32,
    threshold: i32,
}

use super::models::{
    CreateIconEntryInput, DesktopIcon, IconBucket, IconManagerItem, IconMutationTarget,
    IconSnapshot, ImportDroppedPathsResult, InvalidIconEntry, ScannedDesktopItem, SnapshotIconItem,
    SnapshotIconPaths, UpdateIconEntryInput, WebsiteIconResult, ICON_SOURCE_CUSTOMAPP,
    ICON_SOURCE_DESKTOP,
};
#[cfg(windows)]
use super::platform_windows::{
    create_shortcut_windows, extract_icon_for_item, extract_special_shell_icon, get_dpi_scale,
    is_special_shell_path, launch_app_windows, resolve_lnk, update_shortcut_launch_options_windows,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum IconSource {
    Library,
    Desktop,
    CustomApp,
}

impl IconSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Library => "library",
            Self::Desktop => ICON_SOURCE_DESKTOP,
            Self::CustomApp => ICON_SOURCE_CUSTOMAPP,
        }
    }

    fn snapshot_file_name(self) -> &'static str {
        match self {
            Self::Library => "icon_library_snapshot.json",
            Self::Desktop => "icons_snapshot.json",
            Self::CustomApp => "customapp_icons_snapshot.json",
        }
    }

    fn cache_folder_name(self) -> &'static str {
        self.as_str()
    }
}

pub fn get_icons(app_handle: tauri::AppHandle, icon_size: i32) -> Vec<DesktopIcon> {
    #[cfg(windows)]
    {
        match get_all_icons_windows(&app_handle, icon_size) {
            Ok(icons) => icons,
            Err(e) => {
                eprintln!("Failed to load icon snapshots: {}", e);
                Vec::new()
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = icon_size;
        Vec::new()
    }
}

pub fn get_icon_manager_items(
    app_handle: tauri::AppHandle,
    icon_size: i32,
) -> Vec<IconManagerItem> {
    #[cfg(windows)]
    {
        match get_all_icon_manager_items_windows(&app_handle, icon_size) {
            Ok(icons) => icons,
            Err(e) => {
                eprintln!("Failed to load icon manager snapshot data: {}", e);
                Vec::new()
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = icon_size;
        Vec::new()
    }
}

pub fn hide_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    #[cfg(windows)]
    {
        hide_icons_windows(&app_handle, &targets)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = targets;
        Err("Not supported on this platform".to_string())
    }
}

pub fn unhide_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    #[cfg(windows)]
    {
        unhide_icons_windows(&app_handle, &targets)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = targets;
        Err("Not supported on this platform".to_string())
    }
}

pub fn delete_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    #[cfg(windows)]
    {
        delete_icons_windows(&app_handle, &targets)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = targets;
        Err("Not supported on this platform".to_string())
    }
}

#[cfg(windows)]
fn load_icon_library_snapshot(app_handle: &tauri::AppHandle) -> Result<IconSnapshot, String> {
    if let Some(snapshot) = read_icon_snapshot(app_handle, IconSource::Library)? {
        return Ok(snapshot);
    }

    let mut icons = Vec::new();
    for legacy_source in [IconSource::Desktop, IconSource::CustomApp] {
        if let Some(snapshot) = read_icon_snapshot(app_handle, legacy_source)? {
            icons.extend(snapshot.icons);
        }
    }
    icons.sort_by(|left, right| left.display_order.cmp(&right.display_order));
    for (index, item) in icons.iter_mut().enumerate() {
        item.display_order = (index as u64).saturating_add(1);
    }
    let snapshot = IconSnapshot { version: 1, icons };
    write_icon_snapshot(app_handle, IconSource::Library, &snapshot)?;
    Ok(snapshot)
}

pub fn scan_invalid_icons(app_handle: tauri::AppHandle) -> Result<Vec<InvalidIconEntry>, String> {
    #[cfg(windows)]
    {
        scan_invalid_icons_windows(&app_handle)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        Err("Not supported on this platform".to_string())
    }
}

pub fn launch_app(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        launch_app_windows(&path)
    }
    #[cfg(not(windows))]
    {
        Err("Not supported on this platform".to_string())
    }
}

pub fn get_path_icon_base64(path: &str, icon_size: i32) -> String {
    #[cfg(windows)]
    {
        get_path_icon_base64_windows(path, icon_size)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        let _ = icon_size;
        String::new()
    }
}

pub fn import_dropped_paths(
    app_handle: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<ImportDroppedPathsResult, String> {
    #[cfg(windows)]
    {
        import_dropped_paths_windows(&app_handle, paths)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = paths;
        Err("Not supported on this platform".to_string())
    }
}

pub fn create_icon_entry(
    app_handle: tauri::AppHandle,
    input: CreateIconEntryInput,
) -> Result<ImportDroppedPathsResult, String> {
    #[cfg(windows)]
    {
        create_icon_entry_windows(&app_handle, input)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = input;
        Err("Not supported on this platform".to_string())
    }
}

pub fn update_icon_entry(
    app_handle: tauri::AppHandle,
    input: UpdateIconEntryInput,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        update_icon_entry_windows(&app_handle, input)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = input;
        Err("Not supported on this platform".to_string())
    }
}

const MAX_WEBSITE_HTML_BYTES: usize = 2 * 1024 * 1024;
const MAX_WEBSITE_ICON_BYTES: usize = 5 * 1024 * 1024;
const MAX_WEBSITE_MANIFEST_BYTES: usize = 1024 * 1024;
const MAX_WEBSITE_ICON_CANDIDATES: usize = 20;
const MAX_CONCURRENT_WEBSITE_ICON_REQUESTS: usize = 6;
const MAX_WEBSITE_ICON_RESULTS: usize = 8;

#[derive(Debug, Clone)]
struct WebsiteIconCandidate {
    url: Url,
    declared_size: u32,
    source_priority: u8,
    discovery_index: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct WebsiteIconQuality {
    resolution_tier: u8,
    square_score: u16,
    min_dimension: u32,
    max_dimension: u32,
    declared_size: u32,
    source_priority: u8,
    discovery_order: Reverse<usize>,
}

fn normalize_website_url(value: &str) -> Result<Url, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Website URL is required".to_string());
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&candidate).map_err(|error| format!("Invalid website URL: {error}"))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("Only HTTP and HTTPS website URLs are supported".to_string());
    }
    Ok(url)
}

async fn read_response_limited(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<(Url, Vec<u8>), String> {
    if !response.status().is_success() {
        return Err(format!("Website returned HTTP {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("Website response is too large".to_string());
    }

    let final_url = response.url().clone();
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Failed to read website response: {error}"))?;
        if bytes.len().saturating_add(chunk.len()) > max_bytes {
            return Err("Website response is too large".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok((final_url, bytes))
}

fn declared_website_icon_size(value: Option<&str>) -> u32 {
    value
        .into_iter()
        .flat_map(str::split_ascii_whitespace)
        .filter_map(|size| {
            if size.eq_ignore_ascii_case("any") {
                return Some(1024);
            }
            let normalized = size.to_ascii_lowercase();
            let (width, height) = normalized.split_once('x')?;
            let width = width.parse::<u32>().ok()?;
            let height = height.parse::<u32>().ok()?;
            Some(width.min(height))
        })
        .max()
        .unwrap_or_default()
}

fn looks_like_website_icon(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    normalized.contains("favicon")
        || normalized.contains("apple-touch-icon")
        || normalized.contains("logo")
        || normalized.contains("site-icon")
}

fn best_srcset_candidate(value: &str) -> Option<(&str, u32)> {
    value
        .split(',')
        .filter_map(|candidate| {
            let mut parts = candidate.split_ascii_whitespace();
            let url = parts.next()?;
            let descriptor = parts.next().unwrap_or_default().to_ascii_lowercase();
            let declared_size = descriptor
                .strip_suffix('w')
                .and_then(|value| value.parse::<u32>().ok())
                .or_else(|| {
                    descriptor
                        .strip_suffix('x')
                        .and_then(|value| value.parse::<f32>().ok())
                        .map(|scale| (scale * 256.0).round() as u32)
                })
                .unwrap_or_default();
            Some((url, declared_size))
        })
        .max_by_key(|(_, declared_size)| *declared_size)
}

fn collect_json_logo_values(value: &serde_json::Value, logos: &mut Vec<String>) {
    match value {
        serde_json::Value::Array(values) => {
            for value in values {
                collect_json_logo_values(value, logos);
            }
        }
        serde_json::Value::Object(object) => {
            for (key, value) in object {
                if key.eq_ignore_ascii_case("logo") {
                    match value {
                        serde_json::Value::String(url) => logos.push(url.clone()),
                        serde_json::Value::Object(logo) => {
                            for property in ["url", "contentUrl"] {
                                if let Some(url) =
                                    logo.get(property).and_then(|value| value.as_str())
                                {
                                    logos.push(url.to_string());
                                }
                            }
                        }
                        _ => {}
                    }
                } else {
                    collect_json_logo_values(value, logos);
                }
            }
        }
        _ => {}
    }
}

fn website_icon_candidates(
    html: &str,
    page_url: &Url,
) -> (String, Vec<WebsiteIconCandidate>, Vec<Url>) {
    let document = Html::parse_document(html);
    let title_selector = Selector::parse("title").expect("valid title selector");
    let link_selector = Selector::parse("link[href]").expect("valid link selector");
    let image_selector = Selector::parse("img[src]").expect("valid image selector");
    let meta_selector = Selector::parse("meta[content]").expect("valid meta selector");
    let json_ld_selector =
        Selector::parse("script[type='application/ld+json']").expect("valid JSON-LD selector");
    let title = document
        .select(&title_selector)
        .next()
        .map(|element| element.text().collect::<String>().trim().to_string())
        .unwrap_or_default();

    let mut manifests = Vec::new();
    let mut candidates = Vec::new();

    for element in document.select(&link_selector) {
        let rel = element.value().attr("rel").unwrap_or_default();
        let rel_values = rel.split_ascii_whitespace().collect::<Vec<_>>();
        let href = element.value().attr("href").unwrap_or_default();
        let Ok(url) = page_url.join(href) else {
            continue;
        };
        if !matches!(url.scheme(), "http" | "https") {
            continue;
        }

        if rel_values
            .iter()
            .any(|value| value.eq_ignore_ascii_case("manifest"))
        {
            manifests.push(url.clone());
        }

        let is_apple_touch_icon = rel_values.iter().any(|value| {
            value.eq_ignore_ascii_case("apple-touch-icon")
                || value.eq_ignore_ascii_case("apple-touch-icon-precomposed")
        });
        let is_icon = is_apple_touch_icon
            || rel_values.iter().any(|value| {
                value.eq_ignore_ascii_case("icon")
                    || value.eq_ignore_ascii_case("mask-icon")
                    || value.eq_ignore_ascii_case("fluid-icon")
                    || value.eq_ignore_ascii_case("logo")
            });
        let is_image_preload = rel_values
            .iter()
            .any(|value| value.eq_ignore_ascii_case("preload"))
            && element
                .value()
                .attr("as")
                .is_some_and(|value| value.eq_ignore_ascii_case("image"))
            && looks_like_website_icon(href);
        if !is_icon && !is_image_preload {
            continue;
        }

        candidates.push(WebsiteIconCandidate {
            url,
            declared_size: declared_website_icon_size(element.value().attr("sizes")),
            source_priority: if is_apple_touch_icon {
                4
            } else if is_icon {
                3
            } else {
                1
            },
            discovery_index: candidates.len(),
        });
    }

    for element in document.select(&image_selector) {
        let src = element.value().attr("src").unwrap_or_default();
        let srcset = element.value().attr("srcset").unwrap_or_default();
        let semantic_text = [
            src,
            srcset,
            element.value().attr("alt").unwrap_or_default(),
            element.value().attr("class").unwrap_or_default(),
            element.value().attr("id").unwrap_or_default(),
        ]
        .join(" ");
        if !looks_like_website_icon(&semantic_text) {
            continue;
        }
        let declared_width = element
            .value()
            .attr("width")
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or_default();
        let mut sources = vec![(src, declared_width)];
        if let Some(source) = best_srcset_candidate(srcset) {
            sources.push(source);
        }
        for (source, declared_size) in sources {
            let Ok(url) = page_url.join(source) else {
                continue;
            };
            if !matches!(url.scheme(), "http" | "https") {
                continue;
            }
            candidates.push(WebsiteIconCandidate {
                url,
                declared_size,
                source_priority: 1,
                discovery_index: candidates.len(),
            });
        }
    }

    for element in document.select(&meta_selector) {
        let property = element
            .value()
            .attr("property")
            .or_else(|| element.value().attr("name"))
            .or_else(|| element.value().attr("itemprop"))
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !matches!(
            property.as_str(),
            "og:image"
                | "og:image:url"
                | "twitter:image"
                | "twitter:image:src"
                | "msapplication-tileimage"
                | "image"
                | "logo"
        ) {
            continue;
        }
        let content = element.value().attr("content").unwrap_or_default();
        let Ok(url) = page_url.join(content) else {
            continue;
        };
        if matches!(url.scheme(), "http" | "https") {
            candidates.push(WebsiteIconCandidate {
                url,
                declared_size: 0,
                source_priority: 2,
                discovery_index: candidates.len(),
            });
        }
    }

    for element in document.select(&json_ld_selector) {
        let json = element.text().collect::<String>();
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&json) else {
            continue;
        };
        let mut logos = Vec::new();
        collect_json_logo_values(&value, &mut logos);
        for logo in logos {
            let Ok(url) = page_url.join(&logo) else {
                continue;
            };
            if matches!(url.scheme(), "http" | "https") {
                candidates.push(WebsiteIconCandidate {
                    url,
                    declared_size: 0,
                    source_priority: 2,
                    discovery_index: candidates.len(),
                });
            }
        }
    }

    for (path, declared_size, source_priority) in [
        ("/favicon.svg", 1024, 2),
        ("/apple-touch-icon.png", 180, 2),
        ("/favicon.png", 64, 1),
        ("/favicon.ico", 32, 1),
    ] {
        if let Ok(url) = page_url.join(path) {
            candidates.push(WebsiteIconCandidate {
                url,
                declared_size,
                source_priority,
                discovery_index: candidates.len(),
            });
        }
    }

    (title, candidates, manifests)
}

fn website_manifest_icon_candidates(
    bytes: &[u8],
    manifest_url: &Url,
    discovery_index: usize,
) -> Vec<WebsiteIconCandidate> {
    let Ok(manifest) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return Vec::new();
    };
    let Some(icons) = manifest.get("icons").and_then(|value| value.as_array()) else {
        return Vec::new();
    };

    icons
        .iter()
        .enumerate()
        .filter_map(|(index, icon)| {
            let src = icon.get("src")?.as_str()?;
            let url = manifest_url.join(src).ok()?;
            if !matches!(url.scheme(), "http" | "https") {
                return None;
            }
            Some(WebsiteIconCandidate {
                url,
                declared_size: declared_website_icon_size(
                    icon.get("sizes").and_then(|value| value.as_str()),
                ),
                source_priority: 5,
                discovery_index: discovery_index.saturating_add(index),
            })
        })
        .collect()
}

fn sort_and_deduplicate_website_icon_candidates(candidates: &mut Vec<WebsiteIconCandidate>) {
    candidates.sort_by(|left, right| {
        right
            .declared_size
            .cmp(&left.declared_size)
            .then_with(|| right.source_priority.cmp(&left.source_priority))
            .then_with(|| left.discovery_index.cmp(&right.discovery_index))
    });
    let mut seen = HashSet::new();
    candidates.retain(|candidate| seen.insert(candidate.url.as_str().to_string()));
    for (index, candidate) in candidates.iter_mut().enumerate() {
        candidate.discovery_index = index;
    }
}

fn website_icon_quality(
    image: &image::DynamicImage,
    candidate: &WebsiteIconCandidate,
) -> WebsiteIconQuality {
    let width = image.width().max(1);
    let height = image.height().max(1);
    let min_dimension = width.min(height);
    let max_dimension = width.max(height);
    let is_reasonable_shape = max_dimension < min_dimension.saturating_mul(5);
    let resolution_tier = if is_reasonable_shape && min_dimension > 50 && max_dimension > 100 {
        2
    } else if is_reasonable_shape && (min_dimension > 50 || max_dimension > 100) {
        1
    } else {
        0
    };
    let square_score = ((min_dimension as u64 * 1000) / max_dimension as u64) as u16;

    WebsiteIconQuality {
        resolution_tier,
        square_score,
        min_dimension,
        max_dimension,
        declared_size: candidate.declared_size,
        source_priority: candidate.source_priority,
        discovery_order: Reverse(candidate.discovery_index),
    }
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

fn decode_website_icon(bytes: &[u8]) -> Option<image::DynamicImage> {
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

fn icon_sharpen_settings(image: &image::DynamicImage) -> IconSharpenSettings {
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

fn optimize_icon_pixels(image: &image::DynamicImage, size: u32) -> image::DynamicImage {
    let settings = icon_sharpen_settings(image);
    let resized = image.resize(size, size, image::imageops::FilterType::Lanczos3);
    sharpen_icon_preserving_alpha(resized, settings)
}

pub fn optimize_icon_data_uri(data_uri: &str) -> Result<String, String> {
    let icon_data = decode_data_uri_png(data_uri)?;
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

fn website_icon_to_data_uri(image: &image::DynamicImage) -> Result<String, String> {
    let image = image.resize(
        ICON_PREVIEW_SIZE,
        ICON_PREVIEW_SIZE,
        image::imageops::FilterType::Lanczos3,
    );
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|error| format!("Failed to encode website icon: {error}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(output.into_inner())
    ))
}

fn website_icon_data_uris(
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

pub async fn extract_website_icon(value: String) -> Result<WebsiteIconResult, String> {
    let url = normalize_website_url(&value)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(Duration::from_secs(12))
        .user_agent(concat!("DesktopGo/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("Failed to initialize website request: {error}"))?;
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|error| format!("Failed to open website: {error}"))?;
    let (page_url, html_bytes) = read_response_limited(response, MAX_WEBSITE_HTML_BYTES).await?;
    let html = String::from_utf8_lossy(&html_bytes);
    let (title, mut candidates, manifests) = website_icon_candidates(&html, &page_url);

    for manifest_url in manifests.into_iter().take(2) {
        let Ok(response) = client.get(manifest_url.clone()).send().await else {
            continue;
        };
        let Ok((final_manifest_url, bytes)) =
            read_response_limited(response, MAX_WEBSITE_MANIFEST_BYTES).await
        else {
            continue;
        };
        let discovery_index = candidates.len();
        candidates.extend(website_manifest_icon_candidates(
            &bytes,
            &final_manifest_url,
            discovery_index,
        ));
    }

    sort_and_deduplicate_website_icon_candidates(&mut candidates);
    let decoded_candidates = stream::iter(candidates.into_iter().take(MAX_WEBSITE_ICON_CANDIDATES))
        .map(|candidate| {
            let client = client.clone();
            async move {
                let response = client.get(candidate.url.clone()).send().await.ok()?;
                let (_, bytes) = read_response_limited(response, MAX_WEBSITE_ICON_BYTES)
                    .await
                    .ok()?;
                let image = decode_website_icon(&bytes)?;
                let quality = website_icon_quality(&image, &candidate);
                Some((quality, image))
            }
        })
        .buffer_unordered(MAX_CONCURRENT_WEBSITE_ICON_REQUESTS)
        .filter_map(|candidate| async move { candidate })
        .collect::<Vec<_>>()
        .await;
    let icons = website_icon_data_uris(decoded_candidates);
    let icon_base64 = icons.first().cloned().unwrap_or_default();

    Ok(WebsiteIconResult {
        url: url.to_string(),
        title,
        icon_base64,
        icons,
    })
}

#[cfg(test)]
mod website_icon_tests {
    use super::*;

    fn candidate(url: &str, declared_size: u32, discovery_index: usize) -> WebsiteIconCandidate {
        WebsiteIconCandidate {
            url: Url::parse(url).expect("valid test URL"),
            declared_size,
            source_priority: 3,
            discovery_index,
        }
    }

    #[test]
    fn parses_high_resolution_page_and_manifest_candidates() {
        let page_url = Url::parse("https://example.com/path/").expect("valid page URL");
        let html = r#"
            <html>
              <head>
                <title>Example</title>
                <link rel="icon" href="/__aisys__/brand-icon.svg" type="image/svg+xml">
                <link rel="icon" sizes="16x16 32x32" href="/favicon-32.png">
                <link rel="apple-touch-icon" sizes="180x180" href="touch.png">
                <link rel="manifest" href="/app.webmanifest">
                <meta property="og:image" content="/social-card.png">
                <script type="application/ld+json">
                  {"@type":"Organization","logo":"/structured-logo.png"}
                </script>
              </head>
              <body><img class="site-logo" src="/brand/logo-256.png" srcset="/brand/logo-512.png 512w" width="256"></body>
            </html>
        "#;

        let (title, candidates, manifests) = website_icon_candidates(html, &page_url);

        assert_eq!(title, "Example");
        assert!(candidates.iter().any(|candidate| {
            candidate.url.as_str() == "https://example.com/path/touch.png"
                && candidate.declared_size == 180
        }));
        assert!(candidates.iter().any(|candidate| {
            candidate.url.as_str() == "https://example.com/brand/logo-512.png"
                && candidate.declared_size == 512
        }));
        assert!(candidates.iter().any(|candidate| {
            candidate.url.as_str() == "https://example.com/__aisys__/brand-icon.svg"
        }));
        assert!(candidates
            .iter()
            .any(|candidate| candidate.url.as_str() == "https://example.com/social-card.png"));
        assert!(candidates.iter().any(|candidate| {
            candidate.url.as_str() == "https://example.com/structured-logo.png"
        }));
        assert_eq!(manifests[0].as_str(), "https://example.com/app.webmanifest");

        let manifest = br#"{
            "icons": [
                {"src": "icons/app-192.png", "sizes": "192x192"},
                {"src": "/icons/app-512.png", "sizes": "512x512"}
            ]
        }"#;
        let manifest_candidates =
            website_manifest_icon_candidates(manifest, &manifests[0], candidates.len());
        assert_eq!(manifest_candidates.len(), 2);
        assert_eq!(manifest_candidates[1].declared_size, 512);
        assert_eq!(
            manifest_candidates[1].url.as_str(),
            "https://example.com/icons/app-512.png"
        );
    }

    #[test]
    fn prefers_large_square_icons_over_small_icons_and_wide_images() {
        let tiny = image::DynamicImage::new_rgba8(16, 16);
        let touch = image::DynamicImage::new_rgba8(180, 180);
        let wide = image::DynamicImage::new_rgba8(1200, 630);
        let tiny_quality =
            website_icon_quality(&tiny, &candidate("https://example.com/favicon.ico", 16, 0));
        let touch_quality =
            website_icon_quality(&touch, &candidate("https://example.com/touch.png", 180, 1));
        let wide_quality =
            website_icon_quality(&wide, &candidate("https://example.com/banner.png", 1200, 2));

        assert!(touch_quality > tiny_quality);
        assert!(touch_quality > wide_quality);
    }

    #[test]
    fn renders_relative_size_svg_icons_as_high_resolution_images() {
        let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 256 256"><path fill="#1677ff" d="M32 32h192v192H32z"/></svg>"##;
        let image = decode_website_icon(svg).expect("render SVG icon");

        assert_eq!(image.width(), ICON_OPTIMIZED_OUTPUT_SIZE);
        assert_eq!(image.height(), ICON_OPTIMIZED_OUTPUT_SIZE);
        let center = image.to_rgba8().get_pixel(256, 256).0;
        assert_eq!(center, [0x16, 0x77, 0xff, 0xff]);
    }

    #[test]
    fn sorts_by_declared_size_and_deduplicates_urls() {
        let mut candidates = vec![
            candidate("https://example.com/icon.png", 16, 0),
            candidate("https://example.com/icon.png", 512, 1),
            candidate("https://example.com/other.png", 180, 2),
        ];

        sort_and_deduplicate_website_icon_candidates(&mut candidates);

        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].url.as_str(), "https://example.com/icon.png");
        assert_eq!(candidates[0].declared_size, 512);
        assert_eq!(candidates[1].discovery_index, 1);
    }

    #[test]
    fn returns_multiple_unique_icons_with_the_best_candidate_first() {
        let tiny = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
            16,
            16,
            image::Rgba([255, 0, 0, 255]),
        ));
        let touch = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
            180,
            180,
            image::Rgba([0, 255, 0, 255]),
        ));
        let manifest = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
            512,
            512,
            image::Rgba([0, 0, 255, 255]),
        ));
        let decoded = vec![
            (
                website_icon_quality(&tiny, &candidate("https://example.com/favicon.ico", 16, 0)),
                tiny,
            ),
            (
                website_icon_quality(&touch, &candidate("https://example.com/touch.png", 180, 1)),
                touch,
            ),
            (
                website_icon_quality(
                    &manifest,
                    &candidate("https://example.com/manifest.png", 512, 2),
                ),
                manifest.clone(),
            ),
        ];

        let icons = website_icon_data_uris(decoded);

        assert_eq!(icons.len(), 3);
        assert_eq!(icons[0], website_icon_to_data_uri(&manifest).unwrap());
    }

    #[test]
    fn optimizes_an_icon_only_when_explicitly_requested() {
        let source = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
            32,
            32,
            image::Rgba([48, 96, 144, 255]),
        ));
        let mut encoded = Cursor::new(Vec::new());
        source
            .write_to(&mut encoded, image::ImageFormat::Png)
            .expect("encode source icon");
        let data_uri = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(encoded.into_inner())
        );

        let optimized = optimize_icon_data_uri(&data_uri).expect("optimize icon");
        let optimized_bytes = decode_data_uri_png(&optimized).expect("decode optimized icon");
        let optimized_image =
            image::load_from_memory(&optimized_bytes).expect("load optimized icon");

        assert_eq!(optimized_image.width(), ICON_OPTIMIZED_OUTPUT_SIZE);
        assert_eq!(optimized_image.height(), ICON_OPTIMIZED_OUTPUT_SIZE);
    }

    #[test]
    fn adapts_sharpening_strength_and_preserves_resized_alpha() {
        let tiny = image::DynamicImage::new_rgba8(32, 32);
        let tiny_settings = icon_sharpen_settings(&tiny);
        assert_eq!(tiny_settings.sigma, 1.2);
        assert_eq!(tiny_settings.threshold, 1);

        let source = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_fn(8, 8, |x, _| {
            if x < 4 {
                image::Rgba([255, 255, 255, 0])
            } else {
                image::Rgba([40, 120, 220, 255])
            }
        }));
        let resized = source
            .resize(64, 64, image::imageops::FilterType::Lanczos3)
            .to_rgba8();
        let optimized = optimize_icon_pixels(&source, 64).to_rgba8();

        assert_eq!(optimized.dimensions(), resized.dimensions());
        assert!(optimized
            .pixels()
            .zip(resized.pixels())
            .all(|(optimized_pixel, resized_pixel)| optimized_pixel[3] == resized_pixel[3]));
    }
}

// ===== Windows implementations =====

#[cfg(windows)]
fn image_file_to_data_uri(path: &PathBuf, icon_size: i32) -> Option<String> {
    let size = icon_size.max(1) as u32;
    let image = image::open(path)
        .ok()?
        .resize(size, size, image::imageops::FilterType::Lanczos3);
    let mut output = Cursor::new(Vec::new());
    image.write_to(&mut output, image::ImageFormat::Png).ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(output.into_inner())
    ))
}

#[cfg(windows)]
fn get_path_icon_base64_windows(path: &str, icon_size: i32) -> String {
    if is_special_shell_path(path) {
        return extract_special_shell_icon(path, icon_size).unwrap_or_default();
    }

    let item_path = PathBuf::from(path);
    if !item_path.exists() {
        return String::new();
    }
    if item_path.is_file() {
        if let Some(data_uri) = image_file_to_data_uri(&item_path, icon_size) {
            return data_uri;
        }
    }

    let item_path_text = item_path.to_string_lossy().to_string();
    let (target_path, item_type) = if has_extension(&item_path, "lnk") {
        (resolve_lnk(&item_path).unwrap_or_default(), "shortcut")
    } else if item_path.is_dir() {
        (item_path_text.clone(), "folder")
    } else if has_extension(&item_path, "exe") {
        (item_path_text.clone(), "executable")
    } else {
        (item_path_text, "file")
    };

    extract_icon_for_item(&item_path, &target_path, item_type, icon_size)
}

#[cfg(windows)]
fn snapshot_base_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    crate::storage_profile::app_local_data_dir(app_handle)
}

#[cfg(windows)]
fn snapshot_file_path(
    app_handle: &tauri::AppHandle,
    source: IconSource,
) -> Result<PathBuf, String> {
    Ok(snapshot_base_dir(app_handle)?.join(source.snapshot_file_name()))
}

#[cfg(windows)]
fn max_snapshot_display_order(snapshot: &IconSnapshot) -> u64 {
    snapshot
        .icons
        .iter()
        .map(|item| item.display_order)
        .max()
        .unwrap_or(0)
}

#[cfg(windows)]
fn normalize_snapshot_display_order(snapshot: &mut IconSnapshot) -> bool {
    if snapshot.icons.is_empty() {
        return false;
    }

    let mut changed = false;
    let all_zero = snapshot.icons.iter().all(|item| item.display_order == 0);
    if all_zero {
        for (index, item) in snapshot.icons.iter_mut().enumerate() {
            let next_order = (index as u64).saturating_add(1);
            if item.display_order != next_order {
                item.display_order = next_order;
                changed = true;
            }
        }
        return changed;
    }

    let mut used_orders = HashSet::new();
    let mut next_order = max_snapshot_display_order(snapshot);
    for item in &mut snapshot.icons {
        if item.display_order == 0 || !used_orders.insert(item.display_order) {
            next_order = next_order.saturating_add(1);
            item.display_order = next_order;
            changed = true;
            let _ = used_orders.insert(item.display_order);
        }
    }

    changed
}

#[cfg(windows)]
fn read_icon_snapshot(
    app_handle: &tauri::AppHandle,
    source: IconSource,
) -> Result<Option<IconSnapshot>, String> {
    let path = snapshot_file_path(app_handle, source)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read icon snapshot file: {}", e))?;
    let mut snapshot: IconSnapshot = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse icon snapshot JSON: {}", e))?;

    let changed = normalize_snapshot_display_order(&mut snapshot);

    if changed {
        write_icon_snapshot(app_handle, source, &snapshot)?;
    }

    Ok(Some(snapshot))
}

#[cfg(windows)]
fn write_icon_snapshot(
    app_handle: &tauri::AppHandle,
    source: IconSource,
    snapshot: &IconSnapshot,
) -> Result<(), String> {
    let path = snapshot_file_path(app_handle, source)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create snapshot directory: {}", e))?;
    }

    let json = serde_json::to_string_pretty(snapshot)
        .map_err(|e| format!("Failed to serialize icon snapshot: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("Failed to write icon snapshot: {}", e))?;
    Ok(())
}

#[cfg(windows)]
fn remove_cached_icon_file(app_handle: &tauri::AppHandle, rel_path: &str) -> Result<(), String> {
    if rel_path.is_empty() {
        return Ok(());
    }

    let abs_path = snapshot_base_dir(app_handle)?.join(rel_path);
    if !abs_path.exists() {
        return Ok(());
    }

    std::fs::remove_file(&abs_path)
        .map_err(|e| format!("Failed to remove icon cache file {:?}: {}", abs_path, e))?;
    Ok(())
}

#[cfg(windows)]
fn icon_file_rel_path(id: &str, bucket: IconBucket, source: IconSource) -> String {
    format!(
        "icons/{}/{}/{}.png",
        source.cache_folder_name(),
        bucket.folder_name(),
        id
    )
}

#[cfg(windows)]
fn decode_data_uri_png(data_uri: &str) -> Result<Vec<u8>, String> {
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

#[cfg(windows)]
fn read_icon_file_as_data_uri(path: &PathBuf) -> String {
    match std::fs::read(path) {
        Ok(data) => format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(data)
        ),
        Err(_) => String::new(),
    }
}

#[cfg(windows)]
fn has_extension(path: &PathBuf, ext: &str) -> bool {
    path.extension()
        .and_then(|v| v.to_str())
        .map(|v| v.eq_ignore_ascii_case(ext))
        .unwrap_or(false)
}

#[cfg(windows)]
fn is_web_url(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    normalized.starts_with("https://") || normalized.starts_with("http://")
}

fn build_scanned_item_from_path(path: &PathBuf) -> Option<ScannedDesktopItem> {
    if !path.exists() {
        return None;
    }

    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if name.starts_with('.') || name.eq_ignore_ascii_case("desktop.ini") {
            return None;
        }
    }

    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let (target_path, item_type) = if has_extension(path, "lnk") {
        (
            resolve_lnk(path).unwrap_or_default(),
            "shortcut".to_string(),
        )
    } else if path.is_dir() {
        (path.to_string_lossy().to_string(), "folder".to_string())
    } else if has_extension(path, "exe") {
        (path.to_string_lossy().to_string(), "executable".to_string())
    } else {
        (path.to_string_lossy().to_string(), "file".to_string())
    };

    Some(ScannedDesktopItem {
        name,
        path: path.to_string_lossy().to_string(),
        target_path,
        item_type,
    })
}

#[cfg(windows)]
fn import_identity_key(item: &ScannedDesktopItem) -> String {
    let primary = if item.target_path.trim().is_empty() {
        item.path.trim()
    } else {
        item.target_path.trim()
    };
    primary.to_lowercase()
}

#[cfg(windows)]
fn build_import_file_path(custom_dir: &PathBuf, source_path: &PathBuf) -> PathBuf {
    let ext = "lnk";
    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Imported");

    let safe_stem = stem
        .replace(":", "_")
        .replace("/", "_")
        .replace("\\", "_")
        .replace("?", "_")
        .replace("*", "_");

    let mut attempt = 0usize;
    loop {
        let file_name = if attempt == 0 {
            format!("{safe_stem}.{ext}")
        } else {
            format!("{safe_stem} ({attempt}).{ext}")
        };
        let candidate = custom_dir.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
        attempt = attempt.saturating_add(1);
    }
}

#[cfg(windows)]
fn stable_item_key(item: &ScannedDesktopItem) -> String {
    format!(
        "{}|{}|{}",
        item.item_type.to_lowercase(),
        item.path.to_lowercase(),
        item.target_path.to_lowercase()
    )
}

#[cfg(windows)]
fn extract_icon_for_scanned_item(item: &ScannedDesktopItem, icon_size: i32) -> String {
    if item.item_type == "special" {
        return extract_special_shell_icon(&item.path, icon_size).unwrap_or_default();
    }

    let item_path = PathBuf::from(&item.path);
    extract_icon_for_item(&item_path, &item.target_path, &item.item_type, icon_size)
}

#[cfg(windows)]
fn bucket_actual_size(bucket: IconBucket) -> i32 {
    let scaled = (bucket.logical_size() as f64 * get_dpi_scale()).round() as i32;
    scaled.max(bucket.logical_size())
}

#[cfg(windows)]
fn save_scanned_icon_for_bucket(
    app_handle: &tauri::AppHandle,
    item: &ScannedDesktopItem,
    id: &str,
    bucket: IconBucket,
    source: IconSource,
) -> Result<String, String> {
    let icon_data_uri = extract_icon_for_scanned_item(item, bucket_actual_size(bucket));
    if icon_data_uri.is_empty() {
        return Ok(String::new());
    }

    let icon_data = match decode_data_uri_png(&icon_data_uri) {
        Ok(data) => data,
        Err(_) => return Ok(String::new()),
    };

    let rel_path = icon_file_rel_path(id, bucket, source);
    let abs_path = snapshot_base_dir(app_handle)?.join(&rel_path);
    if let Some(parent) = abs_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create icon cache directory {:?}: {}", parent, e))?;
    }
    std::fs::write(&abs_path, icon_data)
        .map_err(|e| format!("Failed to write icon file {:?}: {}", abs_path, e))?;
    Ok(rel_path)
}

#[cfg(windows)]
fn build_custom_icon_paths(
    app_handle: &tauri::AppHandle,
    custom_icon_path: &str,
    id: &str,
    source: IconSource,
) -> Result<SnapshotIconPaths, String> {
    let icon_path = PathBuf::from(custom_icon_path);
    if !icon_path.is_file() {
        return Err("Custom icon path does not point to a file".to_string());
    }
    if let Ok(source_image) = image::open(&icon_path) {
        return Ok(SnapshotIconPaths {
            small: save_data_icon_for_bucket(
                app_handle,
                &source_image,
                id,
                IconBucket::Small,
                source,
            )?,
            medium: save_data_icon_for_bucket(
                app_handle,
                &source_image,
                id,
                IconBucket::Medium,
                source,
            )?,
            large: save_data_icon_for_bucket(
                app_handle,
                &source_image,
                id,
                IconBucket::Large,
                source,
            )?,
        });
    }
    let icon_item = build_scanned_item_from_path(&icon_path)
        .ok_or_else(|| "Custom icon file does not exist or is not supported".to_string())?;
    let icons = SnapshotIconPaths {
        small: save_scanned_icon_for_bucket(app_handle, &icon_item, id, IconBucket::Small, source)?,
        medium: save_scanned_icon_for_bucket(
            app_handle,
            &icon_item,
            id,
            IconBucket::Medium,
            source,
        )?,
        large: save_scanned_icon_for_bucket(app_handle, &icon_item, id, IconBucket::Large, source)?,
    };
    if icons.small.is_empty() && icons.medium.is_empty() && icons.large.is_empty() {
        return Err("Failed to extract an icon from the custom icon file".to_string());
    }
    Ok(icons)
}

#[cfg(windows)]
fn save_data_icon_for_bucket(
    app_handle: &tauri::AppHandle,
    source_image: &image::DynamicImage,
    id: &str,
    bucket: IconBucket,
    source: IconSource,
) -> Result<String, String> {
    let size = bucket_actual_size(bucket).max(1) as u32;
    let resized = source_image.resize(size, size, image::imageops::FilterType::Lanczos3);
    let mut output = Cursor::new(Vec::new());
    resized
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|error| format!("Failed to encode cached icon: {error}"))?;

    let rel_path = icon_file_rel_path(id, bucket, source);
    let abs_path = snapshot_base_dir(app_handle)?.join(&rel_path);
    if let Some(parent) = abs_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create icon cache directory {:?}: {error}",
                parent
            )
        })?;
    }
    std::fs::write(&abs_path, output.into_inner())
        .map_err(|error| format!("Failed to write icon file {:?}: {error}", abs_path))?;
    Ok(rel_path)
}

#[cfg(windows)]
fn build_data_icon_paths(
    app_handle: &tauri::AppHandle,
    data_uri: &str,
    id: &str,
    source: IconSource,
) -> Result<SnapshotIconPaths, String> {
    let icon_data = decode_data_uri_png(data_uri)?;
    let source_image = image::load_from_memory(&icon_data)
        .map_err(|error| format!("Failed to decode generated icon: {error}"))?;
    Ok(SnapshotIconPaths {
        small: save_data_icon_for_bucket(app_handle, &source_image, id, IconBucket::Small, source)?,
        medium: save_data_icon_for_bucket(
            app_handle,
            &source_image,
            id,
            IconBucket::Medium,
            source,
        )?,
        large: save_data_icon_for_bucket(app_handle, &source_image, id, IconBucket::Large, source)?,
    })
}

#[cfg(windows)]
fn build_scanned_icon_paths(
    app_handle: &tauri::AppHandle,
    item: &ScannedDesktopItem,
    id: &str,
    source: IconSource,
) -> Result<SnapshotIconPaths, String> {
    Ok(SnapshotIconPaths {
        small: save_scanned_icon_for_bucket(app_handle, item, id, IconBucket::Small, source)?,
        medium: save_scanned_icon_for_bucket(app_handle, item, id, IconBucket::Medium, source)?,
        large: save_scanned_icon_for_bucket(app_handle, item, id, IconBucket::Large, source)?,
    })
}

#[cfg(windows)]
fn build_snapshot_item(
    app_handle: &tauri::AppHandle,
    item: &ScannedDesktopItem,
    source: IconSource,
    display_order: u64,
) -> Result<SnapshotIconItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let key = stable_item_key(item);
    let icons = build_scanned_icon_paths(app_handle, item, &id, source)?;

    Ok(SnapshotIconItem {
        id,
        key,
        display_order,
        name: item.name.clone(),
        path: item.path.clone(),
        target_path: item.target_path.clone(),
        launch_arguments: String::new(),
        working_directory: String::new(),
        custom_icon_path: String::new(),
        icon_source: "target".to_string(),
        icon_color: "none".to_string(),
        icon_text: String::new(),
        item_type: item.item_type.clone(),
        hidden: false,
        icons,
    })
}

#[cfg(windows)]
fn resolved_icon_source(item: &SnapshotIconItem) -> String {
    match item.icon_source.as_str() {
        "target" | "custom" | "text" => item.icon_source.clone(),
        _ if !item.custom_icon_path.trim().is_empty() => "custom".to_string(),
        _ => "target".to_string(),
    }
}

#[cfg(windows)]
fn resolved_icon_color(item: &SnapshotIconItem) -> String {
    match item.icon_color.as_str() {
        "none" | "ocean" | "emerald" | "amber" | "coral" | "plum" => item.icon_color.clone(),
        _ => "none".to_string(),
    }
}

#[cfg(windows)]
fn normalize_icon_source(value: &str, custom_icon_path: &str) -> String {
    match value.trim() {
        "text" => "text".to_string(),
        "custom" if !custom_icon_path.is_empty() => "custom".to_string(),
        _ => "target".to_string(),
    }
}

#[cfg(windows)]
fn normalize_icon_color(value: &str) -> String {
    match value.trim() {
        "ocean" | "cyan" | "emerald" | "lime" | "amber" | "coral" | "pink" | "plum"
        | "graphite" => value.trim().to_string(),
        _ => "none".to_string(),
    }
}

#[cfg(windows)]
fn snapshot_to_ordered_desktop_icons(
    app_handle: &tauri::AppHandle,
    snapshot: &IconSnapshot,
    icon_size: i32,
) -> Vec<(u64, DesktopIcon)> {
    let bucket = IconBucket::from_logical_size(icon_size);
    let base_dir = match snapshot_base_dir(app_handle) {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("Failed to resolve icon snapshot directory: {}", e);
            return Vec::new();
        }
    };

    let mut ordered_items = snapshot
        .icons
        .iter()
        .filter(|item| !item.hidden)
        .collect::<Vec<_>>();
    ordered_items.sort_by(|a, b| a.display_order.cmp(&b.display_order));

    ordered_items
        .into_iter()
        .map(|item| {
            let rel_path = match bucket {
                IconBucket::Small => &item.icons.small,
                IconBucket::Medium => &item.icons.medium,
                IconBucket::Large => &item.icons.large,
            };
            let icon_base64 = if rel_path.is_empty() {
                String::new()
            } else {
                read_icon_file_as_data_uri(&base_dir.join(rel_path))
            };

            (
                item.display_order,
                DesktopIcon {
                    id: item.id.clone(),
                    name: item.name.clone(),
                    path: item.path.clone(),
                    target_path: item.target_path.clone(),
                    launch_arguments: item.launch_arguments.clone(),
                    working_directory: item.working_directory.clone(),
                    custom_icon_path: item.custom_icon_path.clone(),
                    icon_base64,
                    icon_source: resolved_icon_source(item),
                    icon_color: resolved_icon_color(item),
                    icon_text: item.icon_text.clone(),
                    item_type: item.item_type.clone(),
                },
            )
        })
        .collect()
}

#[cfg(windows)]
fn snapshot_to_ordered_icon_manager_items(
    app_handle: &tauri::AppHandle,
    snapshot: &IconSnapshot,
    icon_size: i32,
) -> Vec<(u64, IconManagerItem)> {
    let bucket = IconBucket::from_logical_size(icon_size);
    let base_dir = match snapshot_base_dir(app_handle) {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("Failed to resolve icon snapshot directory: {}", e);
            return Vec::new();
        }
    };

    let mut ordered_items = snapshot.icons.iter().collect::<Vec<_>>();
    ordered_items.sort_by(|a, b| a.display_order.cmp(&b.display_order));

    ordered_items
        .into_iter()
        .map(|item| {
            let rel_path = match bucket {
                IconBucket::Small => &item.icons.small,
                IconBucket::Medium => &item.icons.medium,
                IconBucket::Large => &item.icons.large,
            };
            let icon_base64 = if rel_path.is_empty() {
                String::new()
            } else {
                read_icon_file_as_data_uri(&base_dir.join(rel_path))
            };

            (
                item.display_order,
                IconManagerItem {
                    id: item.id.clone(),
                    name: item.name.clone(),
                    path: item.path.clone(),
                    target_path: item.target_path.clone(),
                    launch_arguments: item.launch_arguments.clone(),
                    working_directory: item.working_directory.clone(),
                    custom_icon_path: item.custom_icon_path.clone(),
                    icon_base64,
                    icon_source: resolved_icon_source(item),
                    icon_color: resolved_icon_color(item),
                    icon_text: item.icon_text.clone(),
                    item_type: item.item_type.clone(),
                    hidden: item.hidden,
                },
            )
        })
        .collect()
}

#[cfg(windows)]
fn invalid_icon_reason(item: &SnapshotIconItem) -> Option<&'static str> {
    if item.item_type == "special"
        || item.item_type == "website"
        || is_special_shell_path(&item.path)
        || is_web_url(&item.path)
    {
        return None;
    }

    let entry_path = item.path.trim();
    if entry_path.is_empty() || !PathBuf::from(entry_path).exists() {
        return Some("entry_missing");
    }

    let target_path = item.target_path.trim();
    if item.item_type == "shortcut" && target_path.is_empty() {
        return Some("target_unresolved");
    }
    if !target_path.is_empty()
        && !is_special_shell_path(target_path)
        && !PathBuf::from(target_path).exists()
    {
        return Some("target_missing");
    }

    None
}

#[cfg(windows)]
fn scan_invalid_icons_windows(
    app_handle: &tauri::AppHandle,
) -> Result<Vec<InvalidIconEntry>, String> {
    let mut invalid_icons = Vec::new();

    for item in load_icon_library_snapshot(app_handle)?.icons {
        let Some(reason) = invalid_icon_reason(&item) else {
            continue;
        };
        invalid_icons.push(InvalidIconEntry {
            id: item.id,
            name: item.name,
            path: item.path,
            target_path: item.target_path,
            reason: reason.to_string(),
        });
    }

    invalid_icons.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
    });
    Ok(invalid_icons)
}

#[cfg(windows)]
fn set_icons_hidden_state_in_snapshot_windows(
    app_handle: &tauri::AppHandle,
    source: IconSource,
    id_set: &HashSet<String>,
    hidden: bool,
) -> Result<usize, String> {
    if id_set.is_empty() {
        return Ok(0);
    }

    let mut snapshot = match read_icon_snapshot(app_handle, source)? {
        Some(snapshot) => snapshot,
        None => return Ok(0),
    };
    let mut max_display_order = if hidden {
        0
    } else {
        max_snapshot_display_order(&snapshot)
    };

    let mut changed_count = 0usize;
    for item in &mut snapshot.icons {
        if id_set.contains(&item.id) && item.hidden != hidden {
            item.hidden = hidden;
            if !hidden {
                max_display_order = max_display_order.saturating_add(1);
                item.display_order = max_display_order;
            }
            changed_count += 1;
        }
    }

    if changed_count > 0 {
        write_icon_snapshot(app_handle, source, &snapshot)?;
    }

    Ok(changed_count)
}

#[cfg(windows)]
fn delete_icons_in_snapshot_windows(
    app_handle: &tauri::AppHandle,
    source: IconSource,
    id_set: &HashSet<String>,
) -> Result<usize, String> {
    if id_set.is_empty() {
        return Ok(0);
    }

    let mut snapshot = match read_icon_snapshot(app_handle, source)? {
        Some(snapshot) => snapshot,
        None => return Ok(0),
    };

    let mut removed_items = Vec::new();
    snapshot.icons.retain(|item| {
        if id_set.contains(&item.id) {
            removed_items.push(item.clone());
            false
        } else {
            true
        }
    });

    if removed_items.is_empty() {
        return Ok(0);
    }

    let managed_entry_dir = icon_entry_dir_windows(app_handle)?;
    for item in &removed_items {
        let entry_path = PathBuf::from(&item.path);
        if entry_path.parent() == Some(managed_entry_dir.as_path()) && entry_path.is_file() {
            std::fs::remove_file(&entry_path).map_err(|error| {
                format!(
                    "Failed to remove managed icon entry {:?}: {}",
                    entry_path, error
                )
            })?;
        }
        remove_cached_icon_file(app_handle, &item.icons.small)?;
        remove_cached_icon_file(app_handle, &item.icons.medium)?;
        remove_cached_icon_file(app_handle, &item.icons.large)?;
    }

    write_icon_snapshot(app_handle, source, &snapshot)?;
    Ok(removed_items.len())
}

#[cfg(windows)]
fn hide_icons_windows(
    app_handle: &tauri::AppHandle,
    targets: &[IconMutationTarget],
) -> Result<usize, String> {
    if targets.is_empty() {
        return Ok(0);
    }

    let id_set = targets
        .iter()
        .map(|target| target.id.clone())
        .collect::<HashSet<_>>();
    set_icons_hidden_state_in_snapshot_windows(app_handle, IconSource::Library, &id_set, true)
}

#[cfg(windows)]
fn unhide_icons_windows(
    app_handle: &tauri::AppHandle,
    targets: &[IconMutationTarget],
) -> Result<usize, String> {
    if targets.is_empty() {
        return Ok(0);
    }

    let id_set = targets
        .iter()
        .map(|target| target.id.clone())
        .collect::<HashSet<_>>();
    set_icons_hidden_state_in_snapshot_windows(app_handle, IconSource::Library, &id_set, false)
}

#[cfg(windows)]
fn delete_icons_windows(
    app_handle: &tauri::AppHandle,
    targets: &[IconMutationTarget],
) -> Result<usize, String> {
    if targets.is_empty() {
        return Ok(0);
    }

    let id_set = targets
        .iter()
        .map(|target| target.id.clone())
        .collect::<HashSet<_>>();
    delete_icons_in_snapshot_windows(app_handle, IconSource::Library, &id_set)
}

#[cfg(windows)]
fn icon_entry_dir_windows(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let entry_dir = snapshot_base_dir(app_handle)?.join("icon-library-entries");
    if !entry_dir.exists() {
        std::fs::create_dir_all(&entry_dir).map_err(|e| {
            format!(
                "Failed to create icon library entry directory {:?}: {}",
                entry_dir, e
            )
        })?;
    }
    Ok(entry_dir)
}

#[cfg(windows)]
fn import_dropped_paths_windows(
    app_handle: &tauri::AppHandle,
    paths: Vec<String>,
) -> Result<ImportDroppedPathsResult, String> {
    let entry_dir = icon_entry_dir_windows(app_handle)?;
    let mut snapshot = load_icon_library_snapshot(app_handle)?;
    let mut known_keys = snapshot
        .icons
        .iter()
        .map(|item| {
            if item.target_path.trim().is_empty() {
                item.path.trim().to_lowercase()
            } else {
                item.target_path.trim().to_lowercase()
            }
        })
        .collect::<HashSet<_>>();
    let mut next_display_order = max_snapshot_display_order(&snapshot);
    let mut imported_count = 0usize;
    let mut duplicate_count = 0usize;
    let mut invalid_count = 0usize;

    for raw_path in paths {
        let trimmed = raw_path.trim();
        if trimmed.is_empty() {
            invalid_count = invalid_count.saturating_add(1);
            continue;
        }

        let source_path = PathBuf::from(trimmed);
        let Some(scanned_item) = build_scanned_item_from_path(&source_path) else {
            invalid_count = invalid_count.saturating_add(1);
            continue;
        };

        let identity_key = import_identity_key(&scanned_item);
        if known_keys.contains(&identity_key) {
            duplicate_count = duplicate_count.saturating_add(1);
            continue;
        }

        let destination_path = build_import_file_path(&entry_dir, &source_path);
        if has_extension(&source_path, "lnk") {
            std::fs::copy(&source_path, &destination_path).map_err(|error| {
                format!(
                    "Failed to copy shortcut {:?} to {:?}: {}",
                    source_path, destination_path, error
                )
            })?;
        } else {
            create_shortcut_windows(&destination_path, &source_path.to_string_lossy(), "", "")?;
        }

        let created_scan = build_scanned_item_from_path(&destination_path)
            .ok_or_else(|| "Imported icon entry could not be read".to_string())?;
        next_display_order = next_display_order.saturating_add(1);
        snapshot.icons.push(build_snapshot_item(
            app_handle,
            &created_scan,
            IconSource::Library,
            next_display_order,
        )?);

        let _ = known_keys.insert(identity_key);
        imported_count = imported_count.saturating_add(1);
    }

    if imported_count > 0 {
        write_icon_snapshot(app_handle, IconSource::Library, &snapshot)?;
    }

    Ok(ImportDroppedPathsResult {
        imported_count,
        duplicate_count,
        invalid_count,
    })
}

#[cfg(windows)]
fn create_icon_entry_windows(
    app_handle: &tauri::AppHandle,
    input: CreateIconEntryInput,
) -> Result<ImportDroppedPathsResult, String> {
    let display_name = input.display_name.trim().to_string();
    if display_name.is_empty() {
        return Err("Display name is required".to_string());
    }

    let raw_target_path = input.target_path.trim();
    if raw_target_path.is_empty() {
        return Err("Target path is required".to_string());
    }

    let is_web = is_web_url(raw_target_path);
    let target_path_text = if is_web {
        normalize_website_url(raw_target_path)?.to_string()
    } else {
        raw_target_path.to_string()
    };
    let launch_arguments = if is_web {
        String::new()
    } else {
        input.launch_arguments.trim().to_string()
    };
    let working_directory = if is_web {
        String::new()
    } else {
        input.working_directory.trim().to_string()
    };
    let custom_icon_path = input.custom_icon_path.trim().to_string();
    let website_icon_base64 = input.website_icon_base64.trim().to_string();
    let generated_icon_base64 = input.generated_icon_base64.trim().to_string();
    let icon_source = normalize_icon_source(&input.icon_source, &custom_icon_path);
    let icon_color = normalize_icon_color(&input.icon_color);
    let icon_text = if icon_source == "text" {
        input.icon_text.trim().to_string()
    } else {
        String::new()
    };
    let source_path = PathBuf::from(&target_path_text);
    let scanned_item = if is_web {
        Some(ScannedDesktopItem {
            name: display_name.clone(),
            path: target_path_text.clone(),
            target_path: target_path_text.clone(),
            item_type: "website".to_string(),
        })
    } else {
        build_scanned_item_from_path(&source_path)
    }
    .ok_or_else(|| "Target path does not exist or is not supported".to_string())?;
    if !working_directory.is_empty() && !PathBuf::from(&working_directory).is_dir() {
        return Err("Working directory does not exist or is not a folder".to_string());
    }
    if !custom_icon_path.is_empty() && !PathBuf::from(&custom_icon_path).is_file() {
        return Err("Custom icon path does not exist or is not a file".to_string());
    }

    let target_identity = import_identity_key(&scanned_item);
    {
        let snapshot = load_icon_library_snapshot(app_handle)?;
        let duplicate = snapshot.icons.iter().any(|item| {
            let item_identity = if item.target_path.trim().is_empty() {
                item.path.trim()
            } else {
                item.target_path.trim()
            };
            item_identity.eq_ignore_ascii_case(&target_identity)
                && item.launch_arguments.trim() == launch_arguments
                && item
                    .working_directory
                    .trim()
                    .eq_ignore_ascii_case(&working_directory)
        });
        if duplicate {
            return Ok(ImportDroppedPathsResult {
                imported_count: 0,
                duplicate_count: 1,
                invalid_count: 0,
            });
        }
    }

    let destination_path = if is_web {
        None
    } else {
        let entry_dir = icon_entry_dir_windows(app_handle)?;
        let destination_path = build_import_file_path(&entry_dir, &source_path);
        if has_extension(&source_path, "lnk") {
            std::fs::copy(&source_path, &destination_path).map_err(|error| {
                format!(
                    "Failed to copy shortcut {:?} to {:?}: {}",
                    source_path, destination_path, error
                )
            })?;
            if let Err(error) = update_shortcut_launch_options_windows(
                &destination_path,
                &launch_arguments,
                &working_directory,
            ) {
                let _ = std::fs::remove_file(&destination_path);
                return Err(error);
            }
        } else {
            create_shortcut_windows(
                &destination_path,
                &source_path.to_string_lossy(),
                &launch_arguments,
                &working_directory,
            )?;
        }
        Some(destination_path)
    };

    let update_result = (|| -> Result<(), String> {
        let created_scan = match destination_path.as_ref() {
            Some(path) => build_scanned_item_from_path(path)
                .ok_or_else(|| "Created icon entry could not be read".to_string())?,
            None => scanned_item.clone(),
        };
        let mut snapshot = load_icon_library_snapshot(app_handle)?;
        let display_order = max_snapshot_display_order(&snapshot).saturating_add(1);
        let mut created_item = build_snapshot_item(
            app_handle,
            &created_scan,
            IconSource::Library,
            display_order,
        )?;

        created_item.name = display_name;
        created_item.launch_arguments = launch_arguments;
        created_item.working_directory = working_directory;
        created_item.custom_icon_path = custom_icon_path.clone();
        created_item.icon_source = icon_source.clone();
        created_item.icon_color = icon_color;
        created_item.icon_text = icon_text;
        if icon_source == "text" {
            if generated_icon_base64.is_empty() {
                return Err("Generated text icon is required".to_string());
            }
            created_item.icons = build_data_icon_paths(
                app_handle,
                &generated_icon_base64,
                &created_item.id,
                IconSource::Library,
            )?;
        } else if icon_source == "custom" {
            created_item.icons = if generated_icon_base64.is_empty() {
                build_custom_icon_paths(
                    app_handle,
                    &custom_icon_path,
                    &created_item.id,
                    IconSource::Library,
                )?
            } else {
                build_data_icon_paths(
                    app_handle,
                    &generated_icon_base64,
                    &created_item.id,
                    IconSource::Library,
                )?
            };
        } else if !generated_icon_base64.is_empty() {
            created_item.icons = build_data_icon_paths(
                app_handle,
                &generated_icon_base64,
                &created_item.id,
                IconSource::Library,
            )?;
        } else if is_web && !website_icon_base64.is_empty() {
            created_item.icons = build_data_icon_paths(
                app_handle,
                &website_icon_base64,
                &created_item.id,
                IconSource::Library,
            )?;
        }
        snapshot.icons.push(created_item);

        write_icon_snapshot(app_handle, IconSource::Library, &snapshot)
    })();

    if let Err(error) = update_result {
        if let Some(path) = destination_path.as_ref() {
            let _ = std::fs::remove_file(path);
        }
        return Err(error);
    }

    Ok(ImportDroppedPathsResult {
        imported_count: 1,
        duplicate_count: 0,
        invalid_count: 0,
    })
}

#[cfg(windows)]
fn update_icon_entry_windows(
    app_handle: &tauri::AppHandle,
    input: UpdateIconEntryInput,
) -> Result<(), String> {
    let display_name = input.display_name.trim().to_string();
    if display_name.is_empty() {
        return Err("Display name is required".to_string());
    }

    let raw_target_path = input.target_path.trim();
    if raw_target_path.is_empty() {
        return Err("Target path is required".to_string());
    }

    let is_web = is_web_url(raw_target_path);
    let target_path_text = if is_web {
        normalize_website_url(raw_target_path)?.to_string()
    } else {
        raw_target_path.to_string()
    };
    let launch_arguments = if is_web {
        String::new()
    } else {
        input.launch_arguments.trim().to_string()
    };
    let working_directory = if is_web {
        String::new()
    } else {
        input.working_directory.trim().to_string()
    };
    let custom_icon_path = input.custom_icon_path.trim().to_string();
    let website_icon_base64 = input.website_icon_base64.trim().to_string();
    let generated_icon_base64 = input.generated_icon_base64.trim().to_string();
    let icon_source = normalize_icon_source(&input.icon_source, &custom_icon_path);
    let icon_color = normalize_icon_color(&input.icon_color);
    let icon_text = if icon_source == "text" {
        input.icon_text.trim().to_string()
    } else {
        String::new()
    };

    if !working_directory.is_empty() && !PathBuf::from(&working_directory).is_dir() {
        return Err("Working directory does not exist or is not a folder".to_string());
    }
    if !custom_icon_path.is_empty() && !PathBuf::from(&custom_icon_path).is_file() {
        return Err("Custom icon path does not exist or is not a file".to_string());
    }

    let source_path = PathBuf::from(&target_path_text);
    let source_item = if is_web {
        Some(ScannedDesktopItem {
            name: display_name.clone(),
            path: target_path_text.clone(),
            target_path: target_path_text.clone(),
            item_type: "website".to_string(),
        })
    } else {
        build_scanned_item_from_path(&source_path)
    }
    .ok_or_else(|| "Target path does not exist or is not supported".to_string())?;

    let mut snapshot = load_icon_library_snapshot(app_handle)?;
    let item_index = snapshot
        .icons
        .iter()
        .position(|item| item.id == input.id)
        .ok_or_else(|| "Icon entry no longer exists".to_string())?;
    let original_item = snapshot.icons[item_index].clone();
    let target_identity = import_identity_key(&source_item);
    let duplicate = snapshot.icons.iter().any(|item| {
        if item.id == input.id {
            return false;
        }
        let item_identity = if item.target_path.trim().is_empty() {
            item.path.trim()
        } else {
            item.target_path.trim()
        };
        item_identity.eq_ignore_ascii_case(&target_identity)
            && item.launch_arguments.trim() == launch_arguments
            && item
                .working_directory
                .trim()
                .eq_ignore_ascii_case(&working_directory)
    });
    if duplicate {
        return Err("An icon with the same target and launch options already exists".to_string());
    }

    let managed_entry_dir = icon_entry_dir_windows(app_handle)?;
    let destination_path = if is_web {
        None
    } else {
        let destination_path = build_import_file_path(&managed_entry_dir, &source_path);
        if has_extension(&source_path, "lnk") {
            std::fs::copy(&source_path, &destination_path).map_err(|error| {
                format!(
                    "Failed to copy shortcut {:?} to {:?}: {}",
                    source_path, destination_path, error
                )
            })?;
            if let Err(error) = update_shortcut_launch_options_windows(
                &destination_path,
                &launch_arguments,
                &working_directory,
            ) {
                let _ = std::fs::remove_file(&destination_path);
                return Err(error);
            }
        } else {
            create_shortcut_windows(
                &destination_path,
                &source_path.to_string_lossy(),
                &launch_arguments,
                &working_directory,
            )?;
        }
        Some(destination_path)
    };
    let replacement_cache_id = uuid::Uuid::new_v4().to_string();

    let update_result = (|| -> Result<(), String> {
        let updated_scan = match destination_path.as_ref() {
            Some(path) => build_scanned_item_from_path(path)
                .ok_or_else(|| "Updated icon entry could not be read".to_string())?,
            None => source_item.clone(),
        };
        let next_icons = if icon_source == "text" {
            if generated_icon_base64.is_empty() {
                return Err("Generated text icon is required".to_string());
            }
            build_data_icon_paths(
                app_handle,
                &generated_icon_base64,
                &replacement_cache_id,
                IconSource::Library,
            )?
        } else if icon_source == "custom" {
            if generated_icon_base64.is_empty() {
                build_custom_icon_paths(
                    app_handle,
                    &custom_icon_path,
                    &replacement_cache_id,
                    IconSource::Library,
                )?
            } else {
                build_data_icon_paths(
                    app_handle,
                    &generated_icon_base64,
                    &replacement_cache_id,
                    IconSource::Library,
                )?
            }
        } else if !generated_icon_base64.is_empty() {
            build_data_icon_paths(
                app_handle,
                &generated_icon_base64,
                &replacement_cache_id,
                IconSource::Library,
            )?
        } else if is_web && !website_icon_base64.is_empty() {
            build_data_icon_paths(
                app_handle,
                &website_icon_base64,
                &replacement_cache_id,
                IconSource::Library,
            )?
        } else {
            build_scanned_icon_paths(
                app_handle,
                &updated_scan,
                &replacement_cache_id,
                IconSource::Library,
            )?
        };

        let updated_item = &mut snapshot.icons[item_index];
        updated_item.key = stable_item_key(&updated_scan);
        updated_item.name = display_name;
        updated_item.path = updated_scan.path;
        updated_item.target_path = updated_scan.target_path;
        updated_item.launch_arguments = launch_arguments;
        updated_item.working_directory = working_directory;
        updated_item.custom_icon_path = custom_icon_path;
        updated_item.icon_source = icon_source;
        updated_item.icon_color = icon_color;
        updated_item.icon_text = icon_text;
        updated_item.item_type = updated_scan.item_type;
        updated_item.icons = next_icons;

        write_icon_snapshot(app_handle, IconSource::Library, &snapshot)
    })();

    if let Err(error) = update_result {
        if let Some(path) = destination_path.as_ref() {
            let _ = std::fs::remove_file(path);
        }
        for bucket in [IconBucket::Small, IconBucket::Medium, IconBucket::Large] {
            let _ = remove_cached_icon_file(
                app_handle,
                &icon_file_rel_path(&replacement_cache_id, bucket, IconSource::Library),
            );
        }
        return Err(error);
    }

    let _ = remove_cached_icon_file(app_handle, &original_item.icons.small);
    let _ = remove_cached_icon_file(app_handle, &original_item.icons.medium);
    let _ = remove_cached_icon_file(app_handle, &original_item.icons.large);

    let original_entry_path = PathBuf::from(&original_item.path);
    if original_entry_path.parent() == Some(managed_entry_dir.as_path())
        && original_entry_path.is_file()
        && destination_path.as_ref() != Some(&original_entry_path)
    {
        let _ = std::fs::remove_file(original_entry_path);
    }

    Ok(())
}

#[cfg(windows)]
fn get_all_icons_windows(
    app_handle: &tauri::AppHandle,
    icon_size: i32,
) -> Result<Vec<DesktopIcon>, String> {
    Ok(snapshot_to_ordered_desktop_icons(
        app_handle,
        &load_icon_library_snapshot(app_handle)?,
        icon_size,
    )
    .into_iter()
    .map(|(_, icon)| icon)
    .collect())
}

#[cfg(windows)]
fn get_all_icon_manager_items_windows(
    app_handle: &tauri::AppHandle,
    icon_size: i32,
) -> Result<Vec<IconManagerItem>, String> {
    Ok(snapshot_to_ordered_icon_manager_items(
        app_handle,
        &load_icon_library_snapshot(app_handle)?,
        icon_size,
    )
    .into_iter()
    .map(|(_, icon)| icon)
    .collect())
}
