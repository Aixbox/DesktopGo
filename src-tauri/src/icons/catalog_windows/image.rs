use std::io::Cursor;
use std::path::{Path, PathBuf};

use base64::Engine;

use crate::icons::image_data::decode_data_uri;
use crate::icons::models::ScannedDesktopItem;
use crate::icons::platform_windows::{
    extract_icon_for_item, extract_special_shell_icon, get_dpi_scale, resolve_lnk,
};
use crate::icons::search_icon_plan::is_special_shell_path;
use crate::icons::url_shortcut::{is_url_shortcut, read_url_shortcut};

use super::item::{build_scanned_item_from_path, has_extension};
use super::source::IconSource;
use super::storage::snapshot_base_dir;

pub(super) const NATIVE_ICON_EDIT_EXTRACT_SIZE: i32 = 512;
pub(super) const LAUNCHPAD_MAX_ICON_LOGICAL_SIZE: i32 = 72;

pub(super) fn native_icon_request_size(logical_size: i32, dpi_scale: f64) -> i32 {
    (((logical_size as f64) * dpi_scale).round() as i32)
        .max(logical_size)
        .max(1)
}

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

fn image_bytes_to_data_uri(data: &[u8]) -> Option<String> {
    let mime = image_mime_type(data)?;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(data)
    ))
}

pub(super) fn image_file_to_original_data_uri(path: &Path) -> Option<String> {
    let data = std::fs::read(path).ok()?;
    image::load_from_memory(&data).ok()?;
    image_bytes_to_data_uri(&data)
}

fn image_file_to_data_uri(path: &Path, icon_size: i32) -> Option<String> {
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

fn is_supported_image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            matches!(
                value.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "tif" | "tiff"
            )
        })
        .unwrap_or(false)
}

fn shortcut_image_target(item: &ScannedDesktopItem) -> Option<PathBuf> {
    if item.item_type != "shortcut" {
        return None;
    }
    // Steam .url 快捷方式的游戏图（.ico/.jpg）记录在 IconFile 里，直接读图
    // 比走 Shell 提取更清晰可靠。
    if is_url_shortcut(Path::new(item.path.trim())) {
        let icon_file = read_url_shortcut(Path::new(item.path.trim()))?.icon_file;
        let icon_path = PathBuf::from(icon_file.trim());
        return is_supported_image_file(&icon_path).then_some(icon_path);
    }
    let target = PathBuf::from(item.target_path.trim());
    is_supported_image_file(&target).then_some(target)
}

pub(in crate::icons) fn get_path_icon_base64_windows(path: &str, icon_size: i32) -> String {
    if is_special_shell_path(path) {
        return extract_special_shell_icon(path, icon_size).unwrap_or_default();
    }

    let item_path = PathBuf::from(path);
    if !item_path.exists() {
        return String::new();
    }
    if item_path.is_file() && is_supported_image_file(&item_path) {
        if let Some(data_uri) = image_file_to_data_uri(&item_path, icon_size) {
            return data_uri;
        }
    }

    let item_path_text = item_path.to_string_lossy().to_string();
    let (target_path, item_type) = if has_extension(&item_path, "lnk") {
        (resolve_lnk(&item_path).unwrap_or_default(), "shortcut")
    } else if is_url_shortcut(&item_path) {
        (
            read_url_shortcut(&item_path)
                .map(|info| info.target)
                .unwrap_or_default(),
            "shortcut",
        )
    } else if item_path.is_dir() {
        (item_path_text.clone(), "folder")
    } else if has_extension(&item_path, "exe") {
        (item_path_text.clone(), "executable")
    } else {
        (item_path_text, "file")
    };

    extract_icon_for_item(&item_path, &target_path, item_type, icon_size)
}

pub(super) fn icon_file_rel_path(id: &str, source: IconSource) -> String {
    format!("icons/{}/{}.img", source.cache_folder_name(), id)
}

pub(super) fn read_icon_file_as_data_uri(path: &Path) -> String {
    match std::fs::read(path) {
        Ok(data) => image_bytes_to_data_uri(&data).unwrap_or_default(),
        Err(_) => String::new(),
    }
}

fn extract_icon_for_scanned_item(item: &ScannedDesktopItem, icon_size: i32) -> String {
    if item.item_type == "special" {
        return extract_special_shell_icon(&item.path, icon_size).unwrap_or_default();
    }

    if let Some(target) = shortcut_image_target(item) {
        if let Some(data_uri) = image_file_to_data_uri(&target, icon_size) {
            return data_uri;
        }
    }

    let item_path = PathBuf::from(&item.path);
    extract_icon_for_item(&item_path, &item.target_path, &item.item_type, icon_size)
}

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

pub(super) fn build_data_icon_path(
    app_handle: &tauri::AppHandle,
    data_uri: &str,
    id: &str,
    source: IconSource,
) -> Result<String, String> {
    let data = decode_data_uri(data_uri)?;
    save_icon_bytes(app_handle, &data, id, source)
}

pub(super) fn build_scanned_icon_path(
    app_handle: &tauri::AppHandle,
    item: &ScannedDesktopItem,
    id: &str,
    source: IconSource,
) -> Result<String, String> {
    let logical_size = if item.item_type == "special" {
        NATIVE_ICON_EDIT_EXTRACT_SIZE
    } else {
        LAUNCHPAD_MAX_ICON_LOGICAL_SIZE
    };
    let requested_size = native_icon_request_size(logical_size, get_dpi_scale());
    let data_uri = extract_icon_for_scanned_item(item, requested_size);
    if data_uri.is_empty() {
        return Ok(String::new());
    }
    build_data_icon_path(app_handle, &data_uri, id, source)
}

pub(super) fn build_custom_icon_path(
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

#[cfg(test)]
mod image_type_tests {
    use std::path::{Path, PathBuf};

    use crate::icons::models::ScannedDesktopItem;

    use super::{
        is_supported_image_file, native_icon_request_size, shortcut_image_target,
        LAUNCHPAD_MAX_ICON_LOGICAL_SIZE,
    };

    #[test]
    fn recognizes_supported_image_extensions_case_insensitively() {
        assert!(is_supported_image_file(Path::new("preview.PNG")));
        assert!(is_supported_image_file(Path::new("preview.jpeg")));
        assert!(is_supported_image_file(Path::new("preview.TIFF")));
    }

    #[test]
    fn rejects_non_image_files_before_reading_them() {
        assert!(!is_supported_image_file(Path::new("archive.zip")));
        assert!(!is_supported_image_file(Path::new("program.exe")));
        assert!(!is_supported_image_file(Path::new("README")));
    }

    #[test]
    fn uses_image_contents_for_shortcut_targets_only() {
        let shortcut = ScannedDesktopItem {
            name: "Preview".to_string(),
            path: r"C:\Icons\Preview.lnk".to_string(),
            target_path: r"C:\Pictures\Preview.PNG".to_string(),
            item_type: "shortcut".to_string(),
        };
        assert_eq!(
            shortcut_image_target(&shortcut),
            Some(PathBuf::from(r"C:\Pictures\Preview.PNG"))
        );

        let mut non_image_target = shortcut.clone();
        non_image_target.target_path = r"C:\Documents\Preview.pdf".to_string();
        assert_eq!(shortcut_image_target(&non_image_target), None);

        let mut direct_file = shortcut;
        direct_file.item_type = "file".to_string();
        assert_eq!(shortcut_image_target(&direct_file), None);
    }

    #[test]
    fn scales_launchpad_icon_request_to_the_display_dpi() {
        assert_eq!(
            native_icon_request_size(LAUNCHPAD_MAX_ICON_LOGICAL_SIZE, 1.0),
            72
        );
        assert_eq!(
            native_icon_request_size(LAUNCHPAD_MAX_ICON_LOGICAL_SIZE, 1.5),
            108
        );
        assert_eq!(
            native_icon_request_size(LAUNCHPAD_MAX_ICON_LOGICAL_SIZE, 2.0),
            144
        );
    }
}
