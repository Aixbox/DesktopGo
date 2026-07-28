use std::path::PathBuf;

use crate::icons::models::{CreateIconEntryInput, ImportDroppedPathsResult, ScannedDesktopItem};
use crate::icons::platform_windows::{
    create_shortcut_windows, update_shortcut_launch_options_windows,
};
use crate::icons::website::normalize_website_url;

use super::super::image::{build_custom_icon_path, build_data_icon_path};
use super::super::item::{
    build_import_file_path, build_scanned_item_from_path, build_snapshot_item, has_extension,
    import_identity_key, is_web_url, normalize_icon_color, normalize_icon_source,
};
use super::super::source::IconSource;
use super::super::storage::{
    load_icon_library_snapshot, max_snapshot_display_order, write_icon_snapshot,
};
use super::import::icon_entry_dir_windows;

pub(in crate::icons) fn create_icon_entry_windows(
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
            created_item.icon = build_data_icon_path(
                app_handle,
                &generated_icon_base64,
                &created_item.id,
                IconSource::Library,
            )?;
        } else if icon_source == "custom" {
            created_item.icon = if generated_icon_base64.is_empty() {
                build_custom_icon_path(
                    app_handle,
                    &custom_icon_path,
                    &created_item.id,
                    IconSource::Library,
                )?
            } else {
                build_data_icon_path(
                    app_handle,
                    &generated_icon_base64,
                    &created_item.id,
                    IconSource::Library,
                )?
            };
        } else if !generated_icon_base64.is_empty() {
            created_item.icon = build_data_icon_path(
                app_handle,
                &generated_icon_base64,
                &created_item.id,
                IconSource::Library,
            )?;
        } else if is_web && !website_icon_base64.is_empty() {
            created_item.icon = build_data_icon_path(
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
