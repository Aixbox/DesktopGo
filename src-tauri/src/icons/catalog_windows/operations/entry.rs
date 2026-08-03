use std::path::{Path, PathBuf};

use crate::icons::models::{
    CreateIconEntryInput, IconSnapshot, ScannedDesktopItem, SnapshotIconItem, UpdateIconEntryInput,
};
use crate::icons::platform_windows::{
    create_shortcut_windows, update_shortcut_launch_options_windows,
};
use crate::icons::search_icon_plan::is_special_shell_path;
use crate::icons::website::normalize_website_url;

use super::super::item::{
    build_import_file_path, build_scanned_item_from_path, has_extension, import_identity_key,
    is_web_url, normalize_icon_color, normalize_icon_source,
};

struct RawEntryInput<'a> {
    display_name: &'a str,
    target_path: &'a str,
    launch_arguments: &'a str,
    working_directory: &'a str,
    custom_icon_path: &'a str,
    website_icon_base64: &'a str,
    generated_icon_base64: &'a str,
    icon_source: &'a str,
    icon_color: &'a str,
    icon_text: &'a str,
}

#[derive(Debug)]
pub(super) struct NormalizedIconEntry {
    pub display_name: String,
    pub launch_arguments: String,
    pub working_directory: String,
    pub custom_icon_path: String,
    pub website_icon_base64: String,
    pub generated_icon_base64: String,
    pub icon_source: String,
    pub icon_color: String,
    pub icon_text: String,
    pub is_web: bool,
    pub is_special: bool,
    pub source_path: PathBuf,
    pub scanned_item: ScannedDesktopItem,
}

impl NormalizedIconEntry {
    pub fn from_create(input: &CreateIconEntryInput) -> Result<Self, String> {
        Self::normalize(
            RawEntryInput {
                display_name: &input.display_name,
                target_path: &input.target_path,
                launch_arguments: &input.launch_arguments,
                working_directory: &input.working_directory,
                custom_icon_path: &input.custom_icon_path,
                website_icon_base64: &input.website_icon_base64,
                generated_icon_base64: &input.generated_icon_base64,
                icon_source: &input.icon_source,
                icon_color: &input.icon_color,
                icon_text: &input.icon_text,
            },
            false,
        )
    }

    pub fn from_update(input: &UpdateIconEntryInput) -> Result<Self, String> {
        Self::normalize(
            RawEntryInput {
                display_name: &input.display_name,
                target_path: &input.target_path,
                launch_arguments: &input.launch_arguments,
                working_directory: &input.working_directory,
                custom_icon_path: &input.custom_icon_path,
                website_icon_base64: &input.website_icon_base64,
                generated_icon_base64: &input.generated_icon_base64,
                icon_source: &input.icon_source,
                icon_color: &input.icon_color,
                icon_text: &input.icon_text,
            },
            true,
        )
    }

    fn normalize(
        raw: RawEntryInput<'_>,
        allow_generated_custom_icon: bool,
    ) -> Result<Self, String> {
        let display_name = raw.display_name.trim().to_string();
        if display_name.is_empty() {
            return Err("Display name is required".to_string());
        }
        let raw_target_path = raw.target_path.trim();
        if raw_target_path.is_empty() {
            return Err("Target path is required".to_string());
        }

        let is_web = is_web_url(raw_target_path);
        let is_special = is_special_shell_path(raw_target_path);
        let target_path_text = if is_web {
            normalize_website_url(raw_target_path)?.to_string()
        } else {
            raw_target_path.to_string()
        };
        let launch_arguments = normalized_local_value(is_web || is_special, raw.launch_arguments);
        let working_directory = normalized_local_value(is_web || is_special, raw.working_directory);
        let custom_icon_path = raw.custom_icon_path.trim().to_string();
        let generated_icon_base64 = raw.generated_icon_base64.trim().to_string();
        let icon_source = normalize_icon_source(raw.icon_source, &custom_icon_path);
        validate_paths(
            &working_directory,
            &custom_icon_path,
            allow_generated_custom_icon
                && icon_source == "custom"
                && !generated_icon_base64.is_empty(),
        )?;

        let source_path = PathBuf::from(&target_path_text);
        let scanned_item = scanned_item(
            &source_path,
            is_web,
            is_special,
            &display_name,
            &target_path_text,
        )?;
        Ok(Self {
            display_name,
            launch_arguments,
            working_directory,
            custom_icon_path,
            website_icon_base64: raw.website_icon_base64.trim().to_string(),
            generated_icon_base64,
            icon_color: normalize_icon_color(raw.icon_color),
            icon_text: if icon_source == "text" {
                raw.icon_text.trim().to_string()
            } else {
                String::new()
            },
            icon_source,
            is_web,
            is_special,
            source_path,
            scanned_item,
        })
    }

    pub fn apply_metadata(&self, item: &mut SnapshotIconItem) {
        item.name.clone_from(&self.display_name);
        item.launch_arguments.clone_from(&self.launch_arguments);
        item.working_directory.clone_from(&self.working_directory);
        item.custom_icon_path.clone_from(&self.custom_icon_path);
        item.icon_source.clone_from(&self.icon_source);
        item.icon_color.clone_from(&self.icon_color);
        item.icon_text.clone_from(&self.icon_text);
    }

    pub fn writes_direct_snapshot(&self) -> bool {
        self.is_web || self.is_special
    }
}

fn normalized_local_value(is_web: bool, value: &str) -> String {
    if is_web {
        String::new()
    } else {
        value.trim().to_string()
    }
}

fn validate_paths(
    working_directory: &str,
    custom_icon_path: &str,
    has_generated_custom_icon: bool,
) -> Result<(), String> {
    if !working_directory.is_empty() && !Path::new(working_directory).is_dir() {
        return Err("Working directory does not exist or is not a folder".to_string());
    }
    if !custom_icon_path.is_empty()
        && !Path::new(custom_icon_path).is_file()
        && !has_generated_custom_icon
    {
        return Err("Custom icon path does not exist or is not a file".to_string());
    }
    Ok(())
}

fn scanned_item(
    source_path: &Path,
    is_web: bool,
    is_special: bool,
    display_name: &str,
    target_path_text: &str,
) -> Result<ScannedDesktopItem, String> {
    if is_web {
        return Ok(ScannedDesktopItem {
            name: display_name.to_string(),
            path: target_path_text.to_string(),
            target_path: target_path_text.to_string(),
            item_type: "website".to_string(),
        });
    }
    if is_special {
        return Ok(ScannedDesktopItem {
            name: display_name.to_string(),
            path: target_path_text.to_string(),
            target_path: target_path_text.to_string(),
            item_type: "special".to_string(),
        });
    }
    build_scanned_item_from_path(source_path)
        .ok_or_else(|| "Target path does not exist or is not supported".to_string())
}

pub(super) fn has_duplicate_entry(
    snapshot: &IconSnapshot,
    excluded_id: Option<&str>,
    entry: &NormalizedIconEntry,
) -> bool {
    let target_identity = import_identity_key(&entry.scanned_item);
    snapshot.icons.iter().any(|item| {
        if excluded_id.is_some_and(|id| item.id == id) {
            return false;
        }
        let item_identity = if item.target_path.trim().is_empty() {
            item.path.trim()
        } else {
            item.target_path.trim()
        };
        item_identity.eq_ignore_ascii_case(&target_identity)
            && item.launch_arguments.trim() == entry.launch_arguments
            && item
                .working_directory
                .trim()
                .eq_ignore_ascii_case(&entry.working_directory)
    })
}

pub(super) fn create_managed_shortcut(
    entry_dir: &Path,
    entry: &NormalizedIconEntry,
) -> Result<PathBuf, String> {
    let destination_path = build_import_file_path(entry_dir, &entry.source_path);
    if has_extension(&entry.source_path, "lnk") {
        std::fs::copy(&entry.source_path, &destination_path).map_err(|error| {
            format!(
                "Failed to copy shortcut {:?} to {:?}: {}",
                entry.source_path, destination_path, error
            )
        })?;
        if let Err(error) = update_shortcut_launch_options_windows(
            &destination_path,
            &entry.launch_arguments,
            &entry.working_directory,
        ) {
            let _ = std::fs::remove_file(&destination_path);
            return Err(error);
        }
    } else {
        create_shortcut_windows(
            &destination_path,
            &entry.source_path.to_string_lossy(),
            &entry.launch_arguments,
            &entry.working_directory,
        )?;
    }
    Ok(destination_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_input() -> CreateIconEntryInput {
        CreateIconEntryInput {
            display_name: "Example".to_string(),
            target_path: "https://example.com".to_string(),
            launch_arguments: "--ignored".to_string(),
            working_directory: "C:\\ignored".to_string(),
            custom_icon_path: String::new(),
            website_icon_base64: String::new(),
            generated_icon_base64: String::new(),
            icon_source: "target".to_string(),
            icon_color: "none".to_string(),
            icon_text: String::new(),
        }
    }

    fn update_input() -> UpdateIconEntryInput {
        let input = create_input();
        UpdateIconEntryInput {
            id: "entry-id".to_string(),
            display_name: input.display_name,
            target_path: input.target_path,
            launch_arguments: input.launch_arguments,
            working_directory: input.working_directory,
            custom_icon_path: input.custom_icon_path,
            website_icon_base64: input.website_icon_base64,
            generated_icon_base64: input.generated_icon_base64,
            icon_source: input.icon_source,
            icon_color: input.icon_color,
            icon_text: input.icon_text,
        }
    }

    #[test]
    fn website_entries_clear_local_launch_options() {
        let entry = NormalizedIconEntry::from_create(&create_input()).unwrap();

        assert!(entry.is_web);
        assert_eq!(entry.scanned_item.target_path, "https://example.com/");
        assert!(entry.launch_arguments.is_empty());
        assert!(entry.working_directory.is_empty());
    }

    #[test]
    fn shell_namespace_entries_keep_display_name_and_clear_local_launch_options() {
        let mut input = create_input();
        input.display_name = "回收站".to_string();
        input.target_path = "::{645FF040-5081-101B-9F08-00AA002F954E}".to_string();
        input.launch_arguments = "--ignored".to_string();
        input.working_directory = "C:\\ignored".to_string();

        let entry = NormalizedIconEntry::from_create(&input).unwrap();

        assert!(entry.is_special);
        assert!(!entry.is_web);
        assert!(entry.writes_direct_snapshot());
        assert_eq!(entry.scanned_item.name, "回收站");
        assert_eq!(entry.scanned_item.item_type, "special");
        assert!(entry.launch_arguments.is_empty());
        assert!(entry.working_directory.is_empty());
    }

    #[test]
    fn create_rejects_missing_custom_icon_even_with_generated_data() {
        let mut input = create_input();
        input.custom_icon_path = "Z:\\missing\\custom.ico".to_string();
        input.generated_icon_base64 = "data:image/png;base64,AA==".to_string();
        input.icon_source = "custom".to_string();

        let error = NormalizedIconEntry::from_create(&input).unwrap_err();
        assert_eq!(error, "Custom icon path does not exist or is not a file");
    }

    #[test]
    fn update_accepts_generated_custom_icon_when_source_path_is_missing() {
        let mut input = update_input();
        input.custom_icon_path = "Z:\\missing\\custom.ico".to_string();
        input.generated_icon_base64 = "data:image/png;base64,AA==".to_string();
        input.icon_source = "custom".to_string();

        let entry = NormalizedIconEntry::from_update(&input).unwrap();
        assert_eq!(entry.icon_source, "custom");
    }
}
