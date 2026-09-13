use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct CreatedFileInfo {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone)]
enum NewFileKind {
    Directory,
    Empty,
    Bytes(Vec<u8>),
    /// 优先复制注册表 ShellNew 模板（Office/WPS 安装时提供，与资源管理器行为
    /// 一致）；找不到时退回内置模板，保证生成的文件始终合法可打开。
    ShellNew {
        extension: &'static str,
        fallback: &'static [u8],
    },
}

/// 内置的最小合法 xlsx 模板：未注册 ShellNew 的机器上也能生成 Excel 可打开
/// 的工作簿（含 [Content_Types].xml、workbook、sheet1 等五个必需部件）。
#[cfg(windows)]
const BUNDLED_EXCEL_TEMPLATE: &[u8] = include_bytes!("../../resources/templates/new-excel.xlsx");

const CREATE_FILE_TARGET_DIR_SETTING_KEY: &str = "createFileTargetDir";

#[tauri::command]
pub fn create_new_file(
    app_handle: tauri::AppHandle,
    kind: String,
) -> Result<CreatedFileInfo, String> {
    #[cfg(windows)]
    {
        create_new_file_windows(&app_handle, &kind)
    }
    #[cfg(not(windows))]
    {
        let _ = (app_handle, kind);
        Err("Not supported on this platform".to_string())
    }
}

/// 解析「新建」文件的保存目录：设置了自定义目录且该目录存在时优先，否则桌面。
#[cfg(windows)]
fn resolve_create_target_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri_plugin_store::StoreExt;

    if let Ok(store) = app_handle.store(crate::storage_profile::settings_store_path()) {
        if let Some(value) = store.get(CREATE_FILE_TARGET_DIR_SETTING_KEY) {
            if let Some(dir) = value.as_str() {
                if !dir.trim().is_empty() {
                    let path = PathBuf::from(dir);
                    if path.is_dir() {
                        return Ok(path);
                    }
                }
            }
        }
    }

    dirs::desktop_dir()
        .or_else(|| dirs::home_dir().map(|home| home.join("Desktop")))
        .ok_or_else(|| "无法定位保存目录".to_string())
}

#[cfg(windows)]
fn create_new_file_windows(
    app_handle: &tauri::AppHandle,
    kind: &str,
) -> Result<CreatedFileInfo, String> {
    let target_dir = resolve_create_target_dir(app_handle)?;

    let (stem, extension, template) = match kind {
        "folder" => ("新建文件夹", "", NewFileKind::Directory),
        "text" => ("新建文本文档", ".txt", NewFileKind::Empty),
        "bitmap" => ("新建位图图像", ".bmp", NewFileKind::Bytes(minimal_bmp_bytes())),
        "word" => (
            "新建 Microsoft Word 文档",
            ".docx",
            NewFileKind::ShellNew {
                extension: "docx",
                fallback: b"",
            },
        ),
        "excel" => (
            "新建 Microsoft Excel 工作表",
            ".xlsx",
            NewFileKind::ShellNew {
                extension: "xlsx",
                fallback: BUNDLED_EXCEL_TEMPLATE,
            },
        ),
        "powerpoint" => (
            "新建 Microsoft PowerPoint 演示文稿",
            ".pptx",
            NewFileKind::ShellNew {
                extension: "pptx",
                fallback: b"",
            },
        ),
        "zip" => (
            "新建压缩(zipped)文件夹",
            ".zip",
            NewFileKind::Bytes(empty_zip_bytes().to_vec()),
        ),
        other => return Err(format!("未知的文件类型：{other}")),
    };

    let target = unique_target_path(&target_dir, stem, extension);
    match template {
        NewFileKind::Directory => std::fs::create_dir_all(&target),
        NewFileKind::Empty => std::fs::write(&target, []),
        NewFileKind::Bytes(bytes) => std::fs::write(&target, bytes),
        NewFileKind::ShellNew { extension, fallback } => {
            // 1) 本机注册表模板（Office/WPS，保真度最高）；
            // 2) 项目内置模板（保证文件合法可打开）；
            // 3) 都没有时退回空文件。
            match shell_new_template_path(extension) {
                Some(template_path) => std::fs::copy(template_path, &target).map(|_| ()),
                None if !fallback.is_empty() => std::fs::write(&target, fallback),
                None => std::fs::write(&target, []),
            }
        }
    }
    .map_err(|error| format!("创建文件失败：{error}"))?;

    let name = target
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(CreatedFileInfo {
        name,
        path: target.to_string_lossy().to_string(),
    })
}

/// Windows 命名习惯：重名时追加 " (2)"、" (3)" 递增序号。
#[cfg(windows)]
fn unique_target_path(dir: &Path, stem: &str, extension: &str) -> PathBuf {
    let first = dir.join(format!("{stem}{extension}"));
    if !first.exists() {
        return first;
    }
    for index in 2..u32::MAX {
        let candidate = dir.join(format!("{stem} ({index}){extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem}{extension}.new"))
}

/// 1×1 白色 24 位 BMP：资源管理器的"新建位图图像"同样是合法的最小位图文件。
#[cfg(windows)]
fn minimal_bmp_bytes() -> Vec<u8> {
    let mut bytes = Vec::with_capacity(58);
    bytes.extend_from_slice(b"BM");
    bytes.extend_from_slice(&58u32.to_le_bytes()); // 文件大小
    bytes.extend_from_slice(&0u32.to_le_bytes()); // 保留字段
    bytes.extend_from_slice(&54u32.to_le_bytes()); // 像素数据偏移
    bytes.extend_from_slice(&40u32.to_le_bytes()); // 信息头大小
    bytes.extend_from_slice(&1i32.to_le_bytes()); // 宽度
    bytes.extend_from_slice(&1i32.to_le_bytes()); // 高度
    bytes.extend_from_slice(&1u16.to_le_bytes()); // 位平面数
    bytes.extend_from_slice(&24u16.to_le_bytes()); // 位深
    bytes.extend_from_slice(&0u32.to_le_bytes()); // 压缩方式
    bytes.extend_from_slice(&4u32.to_le_bytes()); // 图像数据大小（含行填充）
    bytes.extend_from_slice(&2835i32.to_le_bytes()); // 水平分辨率（72 DPI）
    bytes.extend_from_slice(&2835i32.to_le_bytes()); // 垂直分辨率
    bytes.extend_from_slice(&0u32.to_le_bytes()); // 调色板色数
    bytes.extend_from_slice(&0u32.to_le_bytes()); // 重要色数
    bytes.extend_from_slice(&[255, 255, 255, 0]); // 1×1 白色像素（BGR + 行填充）
    bytes
}

/// 规范的空 zip：仅 End of Central Directory 记录，资源管理器可直接打开。
#[cfg(windows)]
fn empty_zip_bytes() -> [u8; 22] {
    let mut bytes = [0u8; 22];
    bytes[0] = 0x50;
    bytes[1] = 0x4B;
    bytes[2] = 0x05;
    bytes[3] = 0x06;
    bytes
}

/// 读取 HKCR 下 ShellNew 的 FileName 模板（Office 安装时提供），与资源管理
/// 器"新建"菜单复用同一份模板文件。Office 把 ShellNew 注册在
/// ".扩展名\ProgID\ShellNew"（如 .xlsx\Excel.Sheet.12\ShellNew），
/// 因此除扩展名直属键外还要按默认 ProgID 查找。
#[cfg(windows)]
fn shell_new_template_path(extension: &str) -> Option<PathBuf> {
    use winreg::enums::HKEY_CLASSES_ROOT;

    let classes = winreg::RegKey::predef(HKEY_CLASSES_ROOT);
    let mut key_paths = vec![format!(".{extension}\\ShellNew")];
    let extension_key = classes.open_subkey(format!(".{extension}")).ok()?;
    let prog_id = extension_key.get_value::<String, _>("").ok()?;
    key_paths.push(format!(".{extension}\\{prog_id}\\ShellNew"));
    key_paths.push(format!("{prog_id}\\ShellNew"));

    for key_path in key_paths {
        let Ok(key) = classes.open_subkey(&key_path) else {
            continue;
        };
        let Ok(raw) = key.get_value::<String, _>("FileName") else {
            continue;
        };
        let path = PathBuf::from(expand_environment_variables(&raw));
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

#[cfg(windows)]
fn expand_environment_variables(raw: &str) -> String {
    let mut result = raw.to_string();
    while let Some(start) = result.find('%') {
        let Some(offset) = result[start + 1..].find('%') else {
            break;
        };
        let end = start + 1 + offset;
        let variable = result[start + 1..end].to_uppercase();
        let Ok(value) = std::env::var(&variable) else {
            break;
        };
        result.replace_range(start..=end, &value);
    }
    result
}

#[cfg(all(test, windows))]
mod tests {
    use super::{empty_zip_bytes, minimal_bmp_bytes, unique_target_path};
    use std::fs;

    #[test]
    fn empty_zip_is_twenty_two_bytes_with_eocd_signature() {
        let bytes = empty_zip_bytes();
        assert_eq!(bytes.len(), 22);
        assert_eq!(&bytes[0..4], &[0x50, 0x4B, 0x05, 0x06]);
    }

    #[test]
    fn minimal_bmp_declares_one_pixel_and_correct_size() {
        let bytes = minimal_bmp_bytes();
        assert_eq!(bytes.len(), 58);
        assert_eq!(&bytes[0..2], b"BM");
    }

    #[test]
    fn unique_target_path_skips_existing_entries() {
        let dir = std::env::temp_dir().join(format!("desktopgo-new-file-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let first = unique_target_path(&dir, "新建文本文档", ".txt");
        assert_eq!(first, dir.join("新建文本文档.txt"));
        fs::write(&first, []).unwrap();

        let second = unique_target_path(&dir, "新建文本文档", ".txt");
        assert_eq!(second, dir.join("新建文本文档 (2).txt"));

        let _ = fs::remove_dir_all(&dir);
    }
}
