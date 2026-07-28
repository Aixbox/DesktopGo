use std::path::{Path, PathBuf};

use crate::icons::models::{ScannedDesktopItem, SnapshotIconItem};
use crate::icons::platform_windows::resolve_lnk;

use super::image::build_scanned_icon_path;
use super::source::IconSource;

pub(super) fn has_extension(path: &Path, ext: &str) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case(ext))
        .unwrap_or(false)
}

pub(super) fn is_web_url(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    normalized.starts_with("https://") || normalized.starts_with("http://")
}

pub(super) fn build_scanned_item_from_path(path: &Path) -> Option<ScannedDesktopItem> {
    if !path.exists() {
        return None;
    }

    if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
        if name.starts_with('.') || name.eq_ignore_ascii_case("desktop.ini") {
            return None;
        }
    }

    let name = path
        .file_stem()
        .and_then(|stem| stem.to_str())
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

pub(super) fn import_identity_key(item: &ScannedDesktopItem) -> String {
    let primary = if item.target_path.trim().is_empty() {
        item.path.trim()
    } else {
        item.target_path.trim()
    };
    primary.to_lowercase()
}

pub(super) fn build_import_file_path(custom_dir: &Path, source_path: &Path) -> PathBuf {
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

pub(super) fn stable_item_key(item: &ScannedDesktopItem) -> String {
    format!(
        "{}|{}|{}",
        item.item_type.to_lowercase(),
        item.path.to_lowercase(),
        item.target_path.to_lowercase()
    )
}

pub(super) fn build_snapshot_item(
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

pub(super) fn resolved_icon_source(item: &SnapshotIconItem) -> String {
    match item.icon_source.as_str() {
        "target" | "custom" | "text" => item.icon_source.clone(),
        _ if !item.custom_icon_path.trim().is_empty() => "custom".to_string(),
        _ => "target".to_string(),
    }
}

pub(super) fn resolved_icon_color(item: &SnapshotIconItem) -> String {
    match item.icon_color.as_str() {
        "none" | "ocean" | "emerald" | "amber" | "coral" | "plum" => item.icon_color.clone(),
        _ => "none".to_string(),
    }
}

pub(super) fn normalize_icon_source(value: &str, custom_icon_path: &str) -> String {
    match value.trim() {
        "text" => "text".to_string(),
        "custom" if !custom_icon_path.is_empty() => "custom".to_string(),
        _ => "target".to_string(),
    }
}

pub(super) fn normalize_icon_color(value: &str) -> String {
    match value.trim() {
        "ocean" | "cyan" | "emerald" | "lime" | "amber" | "coral" | "pink" | "plum"
        | "graphite" => value.trim().to_string(),
        _ => "none".to_string(),
    }
}
