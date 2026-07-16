use base64::Engine;
use futures_util::StreamExt;
use scraper::{Html, Selector};
use std::collections::HashSet;
use std::io::Cursor;
use std::path::PathBuf;
use std::time::Duration;
use url::Url;

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

fn website_icon_candidates(html: &str, page_url: &Url) -> (String, Vec<Url>) {
    let document = Html::parse_document(html);
    let title_selector = Selector::parse("title").expect("valid title selector");
    let link_selector = Selector::parse("link[href]").expect("valid link selector");
    let title = document
        .select(&title_selector)
        .next()
        .map(|element| element.text().collect::<String>().trim().to_string())
        .unwrap_or_default();

    let mut scored_candidates = document
        .select(&link_selector)
        .filter_map(|element| {
            let rel = element.value().attr("rel")?;
            let is_icon = rel.split_ascii_whitespace().any(|value| {
                value.eq_ignore_ascii_case("icon") || value.eq_ignore_ascii_case("apple-touch-icon")
            });
            if !is_icon {
                return None;
            }
            let href = element.value().attr("href")?;
            let url = page_url.join(href).ok()?;
            if !matches!(url.scheme(), "http" | "https") {
                return None;
            }
            let score = if rel.to_ascii_lowercase().contains("apple-touch-icon") {
                30
            } else if element.value().attr("sizes").is_some() {
                20
            } else {
                10
            };
            Some((score, url))
        })
        .collect::<Vec<_>>();
    scored_candidates.sort_by(|left, right| right.0.cmp(&left.0));

    let mut seen = HashSet::new();
    let mut candidates = scored_candidates
        .into_iter()
        .map(|(_, url)| url)
        .filter(|url| seen.insert(url.as_str().to_string()))
        .collect::<Vec<_>>();
    if let Ok(fallback) = page_url.join("/favicon.ico") {
        if seen.insert(fallback.as_str().to_string()) {
            candidates.push(fallback);
        }
    }
    (title, candidates)
}

fn website_icon_to_data_uri(bytes: &[u8]) -> Result<String, String> {
    let image = image::load_from_memory(bytes)
        .map_err(|error| format!("Unsupported website icon format: {error}"))?
        .thumbnail(256, 256);
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|error| format!("Failed to encode website icon: {error}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(output.into_inner())
    ))
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
    let (title, candidates) = website_icon_candidates(&html, &page_url);

    let mut icon_base64 = String::new();
    for candidate in candidates.into_iter().take(8) {
        let Ok(response) = client.get(candidate).send().await else {
            continue;
        };
        let Ok((_, bytes)) = read_response_limited(response, MAX_WEBSITE_ICON_BYTES).await else {
            continue;
        };
        if let Ok(data_uri) = website_icon_to_data_uri(&bytes) {
            icon_base64 = data_uri;
            break;
        }
    }

    Ok(WebsiteIconResult {
        url: url.to_string(),
        title,
        icon_base64,
    })
}

// ===== Windows implementations =====

#[cfg(windows)]
fn get_path_icon_base64_windows(path: &str, icon_size: i32) -> String {
    if is_special_shell_path(path) {
        return extract_special_shell_icon(path, icon_size).unwrap_or_default();
    }

    let item_path = PathBuf::from(path);
    if !item_path.exists() {
        return String::new();
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
        "ocean" | "emerald" | "amber" | "coral" | "plum" => value.trim().to_string(),
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
