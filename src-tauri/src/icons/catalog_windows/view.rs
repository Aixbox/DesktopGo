use std::path::PathBuf;

use crate::icons::models::{DesktopIcon, IconManagerItem, IconSnapshot, SnapshotIconItem};
use crate::icons::platform_windows::is_special_shell_path;

use super::image::read_icon_file_as_data_uri;
use super::item::{is_web_url, resolved_icon_color, resolved_icon_source};
use super::storage::snapshot_base_dir;

pub(super) fn snapshot_to_ordered_desktop_icons(
    app_handle: &tauri::AppHandle,
    snapshot: &IconSnapshot,
    _icon_size: i32,
) -> Vec<(u64, DesktopIcon)> {
    let base_dir = match snapshot_base_dir(app_handle) {
        Ok(dir) => dir,
        Err(error) => {
            eprintln!("Failed to resolve icon snapshot directory: {}", error);
            return Vec::new();
        }
    };

    let mut ordered_items = snapshot
        .icons
        .iter()
        .filter(|item| !item.hidden)
        .collect::<Vec<_>>();
    ordered_items.sort_by_key(|item| item.display_order);

    ordered_items
        .into_iter()
        .map(|item| {
            let icon_base64 = if item.icon.is_empty() {
                String::new()
            } else {
                read_icon_file_as_data_uri(&base_dir.join(&item.icon))
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

pub(super) fn snapshot_to_ordered_icon_manager_items(
    app_handle: &tauri::AppHandle,
    snapshot: &IconSnapshot,
    _icon_size: i32,
) -> Vec<(u64, IconManagerItem)> {
    let base_dir = match snapshot_base_dir(app_handle) {
        Ok(dir) => dir,
        Err(error) => {
            eprintln!("Failed to resolve icon snapshot directory: {}", error);
            return Vec::new();
        }
    };

    let mut ordered_items = snapshot.icons.iter().collect::<Vec<_>>();
    ordered_items.sort_by_key(|item| item.display_order);

    ordered_items
        .into_iter()
        .map(|item| {
            let icon_base64 = if item.icon.is_empty() {
                String::new()
            } else {
                read_icon_file_as_data_uri(&base_dir.join(&item.icon))
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

pub(super) fn invalid_icon_reason(item: &SnapshotIconItem) -> Option<&'static str> {
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
