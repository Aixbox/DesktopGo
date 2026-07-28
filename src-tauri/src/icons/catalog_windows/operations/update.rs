use std::path::PathBuf;

use crate::icons::models::{ScannedDesktopItem, UpdateIconEntryInput};
use crate::icons::platform_windows::{
    create_shortcut_windows, update_shortcut_launch_options_windows,
};
use crate::icons::website::normalize_website_url;

use super::super::image::{
    build_custom_icon_path, build_data_icon_path, build_scanned_icon_path, icon_file_rel_path,
};
use super::super::item::{
    build_import_file_path, build_scanned_item_from_path, has_extension, import_identity_key,
    is_web_url, normalize_icon_color, normalize_icon_source, stable_item_key,
};
use super::super::source::IconSource;
use super::super::storage::{
    load_icon_library_snapshot, remove_cached_icon_file, write_icon_snapshot,
};
use super::import::icon_entry_dir_windows;

pub(in crate::icons) fn update_icon_entry_windows(
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
    let custom_icon_is_missing =
        !custom_icon_path.is_empty() && !PathBuf::from(&custom_icon_path).is_file();
    let has_generated_custom_icon = icon_source == "custom" && !generated_icon_base64.is_empty();
    if custom_icon_is_missing && !has_generated_custom_icon {
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
        let next_icon = if icon_source == "text" {
            if generated_icon_base64.is_empty() {
                return Err("Generated text icon is required".to_string());
            }
            build_data_icon_path(
                app_handle,
                &generated_icon_base64,
                &replacement_cache_id,
                IconSource::Library,
            )?
        } else if icon_source == "custom" {
            if generated_icon_base64.is_empty() {
                build_custom_icon_path(
                    app_handle,
                    &custom_icon_path,
                    &replacement_cache_id,
                    IconSource::Library,
                )?
            } else {
                build_data_icon_path(
                    app_handle,
                    &generated_icon_base64,
                    &replacement_cache_id,
                    IconSource::Library,
                )?
            }
        } else if !generated_icon_base64.is_empty() {
            build_data_icon_path(
                app_handle,
                &generated_icon_base64,
                &replacement_cache_id,
                IconSource::Library,
            )?
        } else if is_web && !website_icon_base64.is_empty() {
            build_data_icon_path(
                app_handle,
                &website_icon_base64,
                &replacement_cache_id,
                IconSource::Library,
            )?
        } else {
            build_scanned_icon_path(
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
        updated_item.icon = next_icon;
        updated_item.legacy_icons = None;

        write_icon_snapshot(app_handle, IconSource::Library, &snapshot)
    })();

    if let Err(error) = update_result {
        if let Some(path) = destination_path.as_ref() {
            let _ = std::fs::remove_file(path);
        }
        let _ = remove_cached_icon_file(
            app_handle,
            &icon_file_rel_path(&replacement_cache_id, IconSource::Library),
        );
        return Err(error);
    }

    let _ = remove_cached_icon_file(app_handle, &original_item.icon);

    let original_entry_path = PathBuf::from(&original_item.path);
    if original_entry_path.parent() == Some(managed_entry_dir.as_path())
        && original_entry_path.is_file()
        && destination_path.as_ref() != Some(&original_entry_path)
    {
        let _ = std::fs::remove_file(original_entry_path);
    }

    Ok(())
}
