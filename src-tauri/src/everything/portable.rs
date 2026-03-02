use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

use tauri::Manager;

pub const DEFAULT_PORTABLE_SERVICE_PIPE_NAME: &str = "EverythingSvcDesktopGo";
const PORTABLE_ASSET_VERSION: &str =
    concat!("desktopgo-everything-assets-", env!("CARGO_PKG_VERSION"), "-v1");
const VERSION_FILE_NAME: &str = ".asset-version";

pub struct PortableAssets {
    pub exe_path: PathBuf,
    pub dll_path: PathBuf,
}

fn resolve_resource_root(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let resource_root = resource_dir.join("everything");
        if resource_root.exists() {
            return Ok(resource_root);
        }
    }

    let dev_resource_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("everything");
    if dev_resource_root.exists() {
        return Ok(dev_resource_root);
    }

    Err("Failed to locate packaged Everything resources".to_string())
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

fn copy_if_needed(src: &Path, dst: &Path) -> Result<(), String> {
    if should_copy(src, dst)? {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {:?}: {}", parent, e))?;
        }
        fs::copy(src, dst).map_err(|e| format!("Failed to copy {:?} -> {:?}: {}", src, dst, e))?;
    }
    Ok(())
}

fn copy_always(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {:?}: {}", parent, e))?;
    }
    fs::copy(src, dst).map_err(|e| format!("Failed to copy {:?} -> {:?}: {}", src, dst, e))?;
    Ok(())
}

fn version_file_path(target_root: &Path) -> PathBuf {
    target_root.join(VERSION_FILE_NAME)
}

fn is_version_match(target_root: &Path) -> bool {
    let version_path = version_file_path(target_root);
    if !version_path.exists() {
        return false;
    }
    match fs::read_to_string(version_path) {
        Ok(text) => text.trim() == PORTABLE_ASSET_VERSION,
        Err(_) => false,
    }
}

fn write_version_file(target_root: &Path) -> Result<(), String> {
    fs::write(version_file_path(target_root), PORTABLE_ASSET_VERSION)
        .map_err(|e| format!("Failed to write portable version file: {}", e))
}

pub fn ensure_portable_assets(app_handle: &tauri::AppHandle) -> Result<PortableAssets, String> {
    let resource_root = resolve_resource_root(app_handle)?;
    let local_data_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app local data dir: {}", e))?;
    let target_root = local_data_dir.join("everything-portable");
    fs::create_dir_all(&target_root)
        .map_err(|e| format!("Failed to create portable root {:?}: {}", target_root, e))?;

    let src_exe = resource_root.join("everything.exe");
    let src_dll = resource_root.join("Everything64.dll");
    let src_license = resource_root.join("License.txt");
    let src_ini = resource_root.join("Everything.ini");

    let target_exe = target_root.join("everything.exe");
    let target_dll = target_root.join("Everything64.dll");
    let target_license = target_root.join("License.txt");
    let target_ini = target_root.join("Everything.ini");

    let force_refresh = !is_version_match(&target_root);
    if force_refresh {
        copy_always(&src_exe, &target_exe)?;
        copy_always(&src_dll, &target_dll)?;
        copy_always(&src_license, &target_license)?;
        if src_ini.exists() {
            copy_always(&src_ini, &target_ini)?;
        }
        write_version_file(&target_root)?;
    } else {
        copy_if_needed(&src_exe, &target_exe)?;
        copy_if_needed(&src_dll, &target_dll)?;
        copy_if_needed(&src_license, &target_license)?;
        if src_ini.exists() {
            copy_if_needed(&src_ini, &target_ini)?;
        }
    }

    Ok(PortableAssets {
        exe_path: target_exe,
        dll_path: target_dll,
    })
}

pub fn start_portable_service(exe_path: &Path, pipe_name: &str) -> Result<Child, String> {
    let workdir = exe_path
        .parent()
        .ok_or_else(|| format!("Failed to resolve parent directory for {:?}", exe_path))?;
    let normalized_pipe_name = if pipe_name.trim().is_empty() {
        DEFAULT_PORTABLE_SERVICE_PIPE_NAME
    } else {
        pipe_name.trim()
    };
    Command::new(exe_path)
        .arg("-svc")
        .arg("-svc-pipe-name")
        .arg(normalized_pipe_name)
        .current_dir(workdir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to start portable Everything service {:?}: {}",
                exe_path, e
            )
        })
}
