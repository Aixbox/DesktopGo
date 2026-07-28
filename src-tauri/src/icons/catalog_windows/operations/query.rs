use std::path::PathBuf;

use crate::icons::models::{DesktopIcon, IconManagerItem};

use super::super::image::{
    get_path_icon_base64_windows, image_file_to_original_data_uri, read_icon_file_as_data_uri,
    NATIVE_ICON_EXTRACT_SIZE,
};
use super::super::storage::{
    is_legacy_bucket_icon_path, load_icon_library_snapshot, snapshot_base_dir,
};
use super::super::view::{
    snapshot_to_ordered_desktop_icons, snapshot_to_ordered_icon_manager_items,
};

pub(in crate::icons) fn get_all_icons_windows(
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

pub(in crate::icons) fn get_all_icon_manager_items_windows(
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

pub(in crate::icons) fn get_icon_edit_source(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<String, String> {
    let snapshot = load_icon_library_snapshot(app_handle)?;
    let item = snapshot
        .icons
        .iter()
        .find(|item| item.id == id)
        .ok_or_else(|| "Icon entry was not found".to_string())?;
    let rel_path = item.icon.as_str();
    if rel_path.is_empty() {
        return Ok(String::new());
    }

    if is_legacy_bucket_icon_path(rel_path) && !item.custom_icon_path.is_empty() {
        let original_path = PathBuf::from(&item.custom_icon_path);
        if let Some(source) = image_file_to_original_data_uri(&original_path) {
            return Ok(source);
        }
    }

    let source = read_icon_file_as_data_uri(&snapshot_base_dir(app_handle)?.join(rel_path));
    if source.is_empty() {
        return Err("Icon edit source could not be read".to_string());
    }
    Ok(source)
}

pub(in crate::icons) fn get_custom_icon_source(path: &str) -> Result<String, String> {
    let item_path = PathBuf::from(path);
    if !item_path.is_file() {
        return Err("Custom icon path does not point to a file".to_string());
    }
    if let Some(source) = image_file_to_original_data_uri(&item_path) {
        return Ok(source);
    }

    let source = get_path_icon_base64_windows(path, NATIVE_ICON_EXTRACT_SIZE);
    if source.is_empty() {
        return Err("Custom icon could not be extracted".to_string());
    }
    Ok(source)
}
