use std::path::{Path, PathBuf};

use crate::icons::models::{ScannedDesktopItem, SnapshotIconItem};
use crate::icons::platform_windows::resolve_lnk;
use crate::icons::search_icon_plan::is_special_shell_path;

use super::image::build_scanned_icon_path;
use super::source::{IconSource, AUTOMATIC_TARGET_ICON_CACHE_VERSION};

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

    let mut snapshot_item = SnapshotIconItem {
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
        automatic_target_icon_cache: false,
        automatic_target_icon_cache_version: 0,
        legacy_icons: None,
    };
    set_automatic_target_icon_cache(&mut snapshot_item, true);
    Ok(snapshot_item)
}

pub(super) fn resolved_icon_source(item: &SnapshotIconItem) -> String {
    match item.icon_source.as_str() {
        "target" | "custom" | "text" => item.icon_source.clone(),
        _ if !item.custom_icon_path.trim().is_empty() => "custom".to_string(),
        _ => "target".to_string(),
    }
}

pub(super) fn is_automatic_target_icon(item: &SnapshotIconItem) -> bool {
    resolved_icon_source(item) == "target"
        && item.item_type != "special"
        && item.item_type != "website"
        && !is_special_shell_path(&item.path)
        && !is_special_shell_path(&item.target_path)
        && !is_web_url(&item.path)
        && !is_web_url(&item.target_path)
}

pub(super) fn set_automatic_target_icon_cache(
    item: &mut SnapshotIconItem,
    icon_was_automatically_extracted_from_target: bool,
) {
    let has_refreshable_automatic_target_icon = icon_was_automatically_extracted_from_target
        && is_automatic_target_icon(item)
        && !item.icon.is_empty();
    item.automatic_target_icon_cache = has_refreshable_automatic_target_icon;
    item.automatic_target_icon_cache_version = if has_refreshable_automatic_target_icon {
        AUTOMATIC_TARGET_ICON_CACHE_VERSION
    } else {
        0
    };
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

#[cfg(test)]
mod tests {
    use crate::icons::models::SnapshotIconItem;

    use super::{set_automatic_target_icon_cache, AUTOMATIC_TARGET_ICON_CACHE_VERSION};

    fn target_item() -> SnapshotIconItem {
        SnapshotIconItem {
            id: "item-id".to_string(),
            key: "item-key".to_string(),
            display_order: 1,
            name: "Example".to_string(),
            path: "C:\\Icons\\example.lnk".to_string(),
            target_path: "C:\\Apps\\example.exe".to_string(),
            launch_arguments: String::new(),
            working_directory: String::new(),
            custom_icon_path: String::new(),
            icon_source: "target".to_string(),
            icon_color: "none".to_string(),
            icon_text: String::new(),
            item_type: "shortcut".to_string(),
            hidden: false,
            icon: "icons/library/item-id.img".to_string(),
            automatic_target_icon_cache: false,
            automatic_target_icon_cache_version: 0,
            legacy_icons: None,
        }
    }

    #[test]
    fn records_only_nonempty_automatic_target_icons_as_refreshable() {
        let mut automatic_target = target_item();
        set_automatic_target_icon_cache(&mut automatic_target, true);
        assert!(automatic_target.automatic_target_icon_cache);
        assert_eq!(
            automatic_target.automatic_target_icon_cache_version,
            AUTOMATIC_TARGET_ICON_CACHE_VERSION
        );

        let mut empty_target = target_item();
        empty_target.icon.clear();
        set_automatic_target_icon_cache(&mut empty_target, true);
        assert!(!empty_target.automatic_target_icon_cache);
        assert_eq!(empty_target.automatic_target_icon_cache_version, 0);

        for source in ["custom", "text"] {
            let mut item = target_item();
            item.icon_source = source.to_string();
            set_automatic_target_icon_cache(&mut item, true);
            assert!(!item.automatic_target_icon_cache);
            assert_eq!(item.automatic_target_icon_cache_version, 0);
        }

        for item_type in ["website", "special"] {
            let mut item = target_item();
            item.item_type = item_type.to_string();
            set_automatic_target_icon_cache(&mut item, true);
            assert!(!item.automatic_target_icon_cache);
            assert_eq!(item.automatic_target_icon_cache_version, 0);
        }

        let mut generated_target = target_item();
        set_automatic_target_icon_cache(&mut generated_target, false);
        assert!(!generated_target.automatic_target_icon_cache);
        assert_eq!(generated_target.automatic_target_icon_cache_version, 0);

        let mut shell_target = target_item();
        shell_target.target_path = "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}".to_string();
        set_automatic_target_icon_cache(&mut shell_target, true);
        assert!(!shell_target.automatic_target_icon_cache);
        assert_eq!(shell_target.automatic_target_icon_cache_version, 0);
    }
}
