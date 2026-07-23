use super::*;

#[cfg(windows)]
pub(in crate::icons) fn scan_invalid_icons_windows(
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
        remove_cached_icon_file(app_handle, &item.icon)?;
    }

    write_icon_snapshot(app_handle, source, &snapshot)?;
    Ok(removed_items.len())
}

#[cfg(windows)]
pub(in crate::icons) fn hide_icons_windows(
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
pub(in crate::icons) fn unhide_icons_windows(
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
pub(in crate::icons) fn delete_icons_windows(
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
pub(in crate::icons) fn import_dropped_paths_windows(
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

#[cfg(windows)]
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
    if !custom_icon_path.is_empty()
        && !PathBuf::from(&custom_icon_path).is_file()
        && !(icon_source == "custom" && !generated_icon_base64.is_empty())
    {
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

#[cfg(windows)]
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

#[cfg(windows)]
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
