use base64::Engine;
use std::collections::HashSet;
use std::io::Cursor;
use std::path::PathBuf;

use super::image_data::decode_data_uri;
use super::models::{
    CreateIconEntryInput, DesktopIcon, IconManagerItem, IconMutationTarget, IconSnapshot,
    ImportDroppedPathsResult, InvalidIconEntry, LegacySnapshotIconPaths, ScannedDesktopItem,
    SnapshotIconItem, UpdateIconEntryInput, ICON_SOURCE_CUSTOMAPP, ICON_SOURCE_DESKTOP,
};
use super::platform_windows::{
    create_shortcut_windows, extract_icon_for_item, extract_special_shell_icon, get_dpi_scale,
    is_special_shell_path, resolve_lnk, update_shortcut_launch_options_windows,
};
use super::website::normalize_website_url;

const NATIVE_ICON_EXTRACT_SIZE: i32 = 512;
pub(super) const ICON_SNAPSHOT_VERSION: u32 = 2;

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
    let snapshot = IconSnapshot {
        version: ICON_SNAPSHOT_VERSION,
        icons,
    };
    write_icon_snapshot(app_handle, IconSource::Library, &snapshot)?;
    Ok(snapshot)
}

// ===== Windows implementations =====

#[cfg(windows)]
fn image_mime_type(data: &[u8]) -> Option<&'static str> {
    match image::guess_format(data).ok()? {
        image::ImageFormat::Png => Some("image/png"),
        image::ImageFormat::Jpeg => Some("image/jpeg"),
        image::ImageFormat::Gif => Some("image/gif"),
        image::ImageFormat::WebP => Some("image/webp"),
        image::ImageFormat::Bmp => Some("image/bmp"),
        image::ImageFormat::Ico => Some("image/x-icon"),
        image::ImageFormat::Tiff => Some("image/tiff"),
        _ => None,
    }
}

#[cfg(windows)]
fn image_bytes_to_data_uri(data: &[u8]) -> Option<String> {
    let mime = image_mime_type(data)?;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(data)
    ))
}

#[cfg(windows)]
fn image_file_to_original_data_uri(path: &PathBuf) -> Option<String> {
    let data = std::fs::read(path).ok()?;
    image::load_from_memory(&data).ok()?;
    image_bytes_to_data_uri(&data)
}

#[cfg(windows)]
fn image_file_to_data_uri(path: &PathBuf, icon_size: i32) -> Option<String> {
    let size = icon_size.max(1) as u32;
    let image = image::load_from_memory(&std::fs::read(path).ok()?)
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
pub(super) fn get_path_icon_base64_windows(path: &str, icon_size: i32) -> String {
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

fn best_legacy_icon_path(paths: &LegacySnapshotIconPaths) -> &str {
    [
        paths.master.as_str(),
        paths.large.as_str(),
        paths.medium.as_str(),
        paths.small.as_str(),
    ]
    .into_iter()
    .find(|path| !path.is_empty())
    .unwrap_or_default()
}

pub(super) fn is_legacy_bucket_icon_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    ["/small/", "/medium/", "/large/"]
        .iter()
        .any(|segment| normalized.contains(segment))
}

pub(super) fn migrate_snapshot_to_single_icon(snapshot: &mut IconSnapshot) -> bool {
    let mut changed = snapshot.version != ICON_SNAPSHOT_VERSION;
    snapshot.version = ICON_SNAPSHOT_VERSION;

    for item in &mut snapshot.icons {
        if item.icon.is_empty() {
            if let Some(paths) = item.legacy_icons.as_ref() {
                item.icon = best_legacy_icon_path(paths).to_string();
            }
        }
        if item.legacy_icons.take().is_some() {
            changed = true;
        }
    }

    changed
}

fn obsolete_legacy_icon_paths(snapshot: &IconSnapshot) -> HashSet<String> {
    let mut obsolete = HashSet::new();
    for item in &snapshot.icons {
        let Some(paths) = item.legacy_icons.as_ref() else {
            continue;
        };
        let retained = if item.icon.is_empty() {
            best_legacy_icon_path(paths)
        } else {
            item.icon.as_str()
        };
        for path in [&paths.master, &paths.large, &paths.medium, &paths.small] {
            if !path.is_empty() && path != retained {
                obsolete.insert(path.clone());
            }
        }
    }
    obsolete
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

    let obsolete_icon_paths = obsolete_legacy_icon_paths(&snapshot);
    let changed = normalize_snapshot_display_order(&mut snapshot)
        | migrate_snapshot_to_single_icon(&mut snapshot);

    if changed {
        write_icon_snapshot(app_handle, source, &snapshot)?;
        for rel_path in obsolete_icon_paths {
            let _ = remove_cached_icon_file(app_handle, &rel_path);
        }
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
fn icon_file_rel_path(id: &str, source: IconSource) -> String {
    format!("icons/{}/{}.img", source.cache_folder_name(), id)
}

#[cfg(windows)]
#[cfg(windows)]
fn read_icon_file_as_data_uri(path: &PathBuf) -> String {
    match std::fs::read(path) {
        Ok(data) => image_bytes_to_data_uri(&data).unwrap_or_default(),
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
fn save_icon_bytes(
    app_handle: &tauri::AppHandle,
    data: &[u8],
    id: &str,
    source: IconSource,
) -> Result<String, String> {
    image_mime_type(data).ok_or_else(|| "Icon image data is not supported".to_string())?;
    image::load_from_memory(data)
        .map_err(|error| format!("Icon image data could not be decoded: {error}"))?;

    let rel_path = icon_file_rel_path(id, source);
    let abs_path = snapshot_base_dir(app_handle)?.join(&rel_path);
    if let Some(parent) = abs_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create icon directory {:?}: {error}", parent))?;
    }
    std::fs::write(&abs_path, data)
        .map_err(|error| format!("Failed to write icon file {:?}: {error}", abs_path))?;
    Ok(rel_path)
}

#[cfg(windows)]
fn build_data_icon_path(
    app_handle: &tauri::AppHandle,
    data_uri: &str,
    id: &str,
    source: IconSource,
) -> Result<String, String> {
    let data = decode_data_uri(data_uri)?;
    save_icon_bytes(app_handle, &data, id, source)
}

#[cfg(windows)]
fn build_scanned_icon_path(
    app_handle: &tauri::AppHandle,
    item: &ScannedDesktopItem,
    id: &str,
    source: IconSource,
) -> Result<String, String> {
    let requested_size = ((NATIVE_ICON_EXTRACT_SIZE as f64) * get_dpi_scale()).round() as i32;
    let data_uri =
        extract_icon_for_scanned_item(item, requested_size.max(NATIVE_ICON_EXTRACT_SIZE));
    if data_uri.is_empty() {
        return Ok(String::new());
    }
    build_data_icon_path(app_handle, &data_uri, id, source)
}

#[cfg(windows)]
fn build_custom_icon_path(
    app_handle: &tauri::AppHandle,
    custom_icon_path: &str,
    id: &str,
    source: IconSource,
) -> Result<String, String> {
    let path = PathBuf::from(custom_icon_path);
    if !path.is_file() {
        return Err("Custom icon path does not point to a file".to_string());
    }

    let data = std::fs::read(&path)
        .map_err(|error| format!("Failed to read custom icon {:?}: {error}", path))?;
    if image::load_from_memory(&data).is_ok() && image_mime_type(&data).is_some() {
        return save_icon_bytes(app_handle, &data, id, source);
    }

    let item = build_scanned_item_from_path(&path)
        .ok_or_else(|| "Custom icon file does not exist or is not supported".to_string())?;
    let icon = build_scanned_icon_path(app_handle, &item, id, source)?;
    if icon.is_empty() {
        return Err("Failed to extract an icon from the custom icon file".to_string());
    }
    Ok(icon)
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
    let icon = build_scanned_icon_path(app_handle, item, &id, source)?;

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
        icon,
        legacy_icons: None,
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
    _icon_size: i32,
) -> Vec<(u64, DesktopIcon)> {
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
            let rel_path = &item.icon;
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
    _icon_size: i32,
) -> Vec<(u64, IconManagerItem)> {
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
            let rel_path = &item.icon;
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

pub(super) mod operations;
