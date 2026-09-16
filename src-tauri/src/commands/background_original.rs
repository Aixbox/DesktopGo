//! 自定义背景原图的本地持久化：压缩管线会把背景重编码为小体积 WebP data URI，
//! 这里把用户选定的原始图片额外另存一份，供「调整取景」始终基于原图无损重新取景。

use base64::Engine as _;
use tauri::AppHandle;

use crate::storage_profile::app_local_data_path;

const ORIGINAL_FILE_STEM: &str = "background-original";
/// 与前端 `BACKGROUND_MIME_TYPES` 保持一致：仅接受 JPEG/PNG/WebP。
const SUPPORTED_MIME_EXTENSIONS: [(&str, &str); 3] = [
    ("image/jpeg", "jpg"),
    ("image/png", "png"),
    ("image/webp", "webp"),
];
const MAX_ORIGINAL_BYTES: usize = 12 * 1024 * 1024;

/// 把 `data:image/<mime>;base64,<payload>` 拆成 mime 与 base64 载荷。
fn parse_data_uri(data_uri: &str) -> Result<(&str, &str), String> {
    let rest = data_uri
        .strip_prefix("data:")
        .ok_or("background original data URI must start with 'data:'")?;
    let (meta, encoded) = rest
        .split_once(',')
        .ok_or("background original data URI must contain a payload separator")?;
    let mime = meta
        .strip_suffix(";base64")
        .ok_or("background original data URI must use base64 encoding")?;
    Ok((mime, encoded))
}

fn extension_for_mime(mime: &str) -> Option<&'static str> {
    let lowered = mime.trim().to_ascii_lowercase();
    SUPPORTED_MIME_EXTENSIONS
        .iter()
        .find(|(candidate, _)| *candidate == lowered)
        .map(|(_, extension)| *extension)
}

fn original_path(app_handle: &AppHandle, extension: &str) -> Result<std::path::PathBuf, String> {
    app_local_data_path(app_handle, format!("{ORIGINAL_FILE_STEM}.{extension}"))
}

#[tauri::command]
pub async fn save_background_original(
    app_handle: AppHandle,
    data_uri: String,
) -> Result<(), String> {
    let (mime, encoded) = parse_data_uri(&data_uri)?;
    let extension = extension_for_mime(mime)
        .ok_or_else(|| format!("unsupported background original mime type: {mime}"))?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| format!("Failed to decode background original data: {error}"))?;
    if bytes.len() > MAX_ORIGINAL_BYTES {
        return Err("background original exceeds the 12 MB limit".to_string());
    }

    // 统一只保留当前扩展名的一份原图，避免目录里残留多份旧文件。
    for (_, candidate_extension) in SUPPORTED_MIME_EXTENSIONS {
        if candidate_extension == extension {
            continue;
        }
        if let Ok(existing) = original_path(&app_handle, candidate_extension) {
            if existing.is_file() {
                let _ = std::fs::remove_file(existing);
            }
        }
    }

    let path = original_path(&app_handle, extension)?;
    std::fs::write(&path, &bytes)
        .map_err(|error| format!("Failed to write background original {:?}: {error}", path))
}

#[tauri::command]
pub async fn load_background_original(app_handle: AppHandle) -> Result<Option<String>, String> {
    for (mime, extension) in SUPPORTED_MIME_EXTENSIONS {
        let path = original_path(&app_handle, extension)?;
        if let Ok(bytes) = std::fs::read(&path) {
            if bytes.is_empty() {
                continue;
            }
            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
            return Ok(Some(format!("data:{mime};base64,{encoded}")));
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn clear_background_original(app_handle: AppHandle) -> Result<(), String> {
    for (_, extension) in SUPPORTED_MIME_EXTENSIONS {
        let path = original_path(&app_handle, extension)?;
        if path.is_file() {
            std::fs::remove_file(&path).map_err(|error| {
                format!("Failed to remove background original {:?}: {error}", path)
            })?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_data_uri_extracts_mime_and_payload() {
        let (mime, encoded) =
            parse_data_uri("data:image/webp;base64,QUJD").expect("valid data uri should parse");
        assert_eq!(mime, "image/webp");
        assert_eq!(encoded, "QUJD");
    }

    #[test]
    fn parse_data_uri_rejects_plain_and_non_base64_payloads() {
        assert!(parse_data_uri("https://example.com/a.jpg").is_err());
        assert!(parse_data_uri("data:text/plain,hello").is_err());
        assert!(parse_data_uri("data:image/png;base64").is_err());
    }

    #[test]
    fn extension_for_mime_maps_supported_types_and_rejects_others() {
        assert_eq!(extension_for_mime("image/jpeg"), Some("jpg"));
        assert_eq!(extension_for_mime("IMAGE/WEBP "), Some("webp"));
        assert_eq!(extension_for_mime("image/png"), Some("png"));
        assert_eq!(extension_for_mime("image/gif"), None);
    }
}
