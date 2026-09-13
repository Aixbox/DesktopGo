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
        other => return Err(format!("未知的文件类型：{other}")),
    };

    let target = unique_target_path(&target_dir, stem, extension);
    match template {
        NewFileKind::Directory => std::fs::create_dir_all(&target),
        NewFileKind::Empty => std::fs::write(&target, []),
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
    use super::unique_target_path;
    use std::fs;

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
