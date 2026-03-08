use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

#[cfg(target_pointer_width = "64")]
const SDK_DLL_NAME: &str = "Everything64.dll";
#[cfg(target_pointer_width = "32")]
const SDK_DLL_NAME: &str = "Everything32.dll";

fn resolve_sdk_root(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let resource_root = resource_dir.join("everything").join("Everything-SDK").join("dll");
        if resource_root.exists() {
            return Ok(resource_root);
        }
    }

    let dev_resource_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("everything")
        .join("Everything-SDK")
        .join("dll");
    if dev_resource_root.exists() {
        return Ok(dev_resource_root);
    }

    Err("Failed to locate packaged Everything SDK resources".to_string())
}

fn should_copy(src: &Path, dst: &Path) -> Result<bool, String> {
    if !dst.exists() {
        return Ok(true);
    }

    let src_meta = fs::metadata(src)
        .map_err(|e| format!("Failed to read source metadata {:?}: {}", src, e))?;
    let dst_meta = fs::metadata(dst)
        .map_err(|e| format!("Failed to read destination metadata {:?}: {}", dst, e))?;

    if src_meta.len() != dst_meta.len() {
        return Ok(true);
    }

    let src_mtime = src_meta.modified().ok();
    let dst_mtime = dst_meta.modified().ok();
    if let (Some(src_time), Some(dst_time)) = (src_mtime, dst_mtime) {
        return Ok(src_time > dst_time);
    }

    Ok(false)
}

pub fn ensure_sdk_dll(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let sdk_root = resolve_sdk_root(app_handle)?;
    let source_dll = sdk_root.join(SDK_DLL_NAME);
    if !source_dll.exists() {
        return Err(format!("Everything SDK DLL is missing: {:?}", source_dll));
    }

    let local_data_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app local data dir: {}", e))?;
    let target_root = local_data_dir.join("everything-sdk");
    fs::create_dir_all(&target_root)
        .map_err(|e| format!("Failed to create SDK target root {:?}: {}", target_root, e))?;

    let target_dll = target_root.join(SDK_DLL_NAME);
    if should_copy(&source_dll, &target_dll)? {
        fs::copy(&source_dll, &target_dll).map_err(|e| {
            format!(
                "Failed to copy Everything SDK DLL {:?} -> {:?}: {}",
                source_dll, target_dll, e
            )
        })?;
    }

    Ok(target_dll)
}
