use base64::Engine;
use serde::Serialize;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

const MAX_TEXT_PREVIEW_BYTES: usize = 32 * 1024;
const MAX_IMAGE_PREVIEW_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchPreviewKind {
    Info,
    Image,
    Text,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPreview {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub kind: SearchPreviewKind,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub modified_at: Option<u64>,
    pub mime_type: Option<String>,
    pub image_data_url: Option<String>,
    pub text_snippet: Option<String>,
    pub text_truncated: bool,
}

fn system_time_to_epoch_ms(time: std::time::SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

fn is_image_extension(ext: &str) -> bool {
    matches!(
        ext,
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "ico" | "tif" | "tiff"
    )
}

fn is_text_extension(ext: &str) -> bool {
    matches!(
        ext,
        "txt"
            | "md"
            | "markdown"
            | "log"
            | "json"
            | "jsonc"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "c"
            | "h"
            | "cpp"
            | "cc"
            | "hpp"
            | "rs"
            | "toml"
            | "yaml"
            | "yml"
            | "xml"
            | "html"
            | "htm"
            | "css"
            | "scss"
            | "less"
            | "ini"
            | "conf"
            | "py"
            | "java"
            | "cs"
            | "go"
            | "sql"
            | "sh"
            | "bat"
            | "ps1"
    )
}

fn mime_type_for_extension(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "webp" => Some("image/webp"),
        "ico" => Some("image/x-icon"),
        "tif" | "tiff" => Some("image/tiff"),
        _ if is_text_extension(ext) => Some("text/plain; charset=utf-8"),
        _ => None,
    }
}

fn read_image_data_url(path: &Path, ext: &str) -> Result<Option<String>, String> {
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read preview metadata {:?}: {}", path, e))?;
    if metadata.len() > MAX_IMAGE_PREVIEW_BYTES {
        return Ok(None);
    }

    let mime_type = mime_type_for_extension(ext).unwrap_or("application/octet-stream");
    let bytes =
        fs::read(path).map_err(|e| format!("Failed to read preview image {:?}: {}", path, e))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(Some(format!("data:{};base64,{}", mime_type, encoded)))
}

fn read_text_preview(path: &Path, file_size: u64) -> Result<(String, bool), String> {
    let mut file =
        File::open(path).map_err(|e| format!("Failed to open preview text {:?}: {}", path, e))?;
    let mut buffer = vec![0u8; MAX_TEXT_PREVIEW_BYTES];
    let bytes_read = file
        .read(&mut buffer)
        .map_err(|e| format!("Failed to read preview text {:?}: {}", path, e))?;
    buffer.truncate(bytes_read);

    let mut text = String::from_utf8_lossy(&buffer).replace('\0', "");
    if text.len() > MAX_TEXT_PREVIEW_BYTES {
        text.truncate(MAX_TEXT_PREVIEW_BYTES);
    }

    Ok((text, file_size > bytes_read as u64))
}

pub fn get_search_preview(path: &str) -> Result<SearchPreview, String> {
    let trimmed_path = path.trim();
    if trimmed_path.is_empty() {
        return Err("Preview path cannot be empty".to_string());
    }

    let preview_path = Path::new(trimmed_path);
    let metadata = fs::metadata(preview_path)
        .map_err(|e| format!("Failed to read preview metadata {:?}: {}", preview_path, e))?;
    let extension = preview_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let name = preview_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(trimmed_path)
        .to_string();
    let is_directory = metadata.is_dir();
    let size = if metadata.is_file() {
        Some(metadata.len())
    } else {
        None
    };
    let modified_at = metadata.modified().ok().and_then(system_time_to_epoch_ms);
    let mime_type = mime_type_for_extension(&extension).map(str::to_string);

    let mut preview = SearchPreview {
        path: trimmed_path.to_string(),
        name,
        extension: extension.clone(),
        kind: SearchPreviewKind::Info,
        is_directory,
        size,
        modified_at,
        mime_type,
        image_data_url: None,
        text_snippet: None,
        text_truncated: false,
    };

    if is_directory {
        return Ok(preview);
    }

    if is_image_extension(&extension) {
        if let Some(image_data_url) = read_image_data_url(preview_path, &extension)? {
            preview.kind = SearchPreviewKind::Image;
            preview.image_data_url = Some(image_data_url);
        }
        return Ok(preview);
    }

    if is_text_extension(&extension) {
        let file_size = size.unwrap_or_default();
        let (text_snippet, text_truncated) = read_text_preview(preview_path, file_size)?;
        preview.kind = SearchPreviewKind::Text;
        preview.text_snippet = Some(text_snippet);
        preview.text_truncated = text_truncated;
    }

    Ok(preview)
}
