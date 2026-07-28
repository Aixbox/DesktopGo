use std::path::{Path, PathBuf};

#[cfg(debug_assertions)]
use tauri::path::BaseDirectory;
use tauri::Manager;

#[cfg(debug_assertions)]
const DEV_PROFILE_DIR_NAME: &str = "dev";
const SETTINGS_STORE_FILE_NAME: &str = "settings.json";
#[cfg(debug_assertions)]
const APP_STATE_DB_FILE_NAME: &str = "app_state.db";

#[cfg(debug_assertions)]
fn scoped_relative_path(path: impl AsRef<Path>) -> PathBuf {
    PathBuf::from(DEV_PROFILE_DIR_NAME).join(path)
}

#[cfg(not(debug_assertions))]
fn scoped_relative_path(path: impl AsRef<Path>) -> PathBuf {
    path.as_ref().to_path_buf()
}

#[cfg(debug_assertions)]
fn scoped_local_data_dir(base_dir: PathBuf) -> PathBuf {
    base_dir.join(DEV_PROFILE_DIR_NAME)
}

#[cfg(not(debug_assertions))]
fn scoped_local_data_dir(base_dir: PathBuf) -> PathBuf {
    base_dir
}

fn ensure_parent_dir(path: &Path, label: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create {label} parent directory {:?}: {error}",
                parent
            )
        })?;
    }
    Ok(())
}

fn base_local_data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Failed to resolve app local data directory: {error}"))?;

    std::fs::create_dir_all(&base_dir).map_err(|error| {
        format!(
            "Failed to create app local data directory {:?}: {error}",
            base_dir
        )
    })?;

    Ok(base_dir)
}

#[cfg(debug_assertions)]
fn app_data_path(app_handle: &tauri::AppHandle, path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let resolved = app_handle
        .path()
        .resolve(path, BaseDirectory::AppData)
        .map_err(|error| format!("Failed to resolve app data path: {error}"))?;
    ensure_parent_dir(&resolved, "app data")?;
    Ok(resolved)
}

#[cfg(debug_assertions)]
fn seed_file(source: &Path, target: &Path, label: &str) -> Result<(), String> {
    if target.exists() || !source.exists() {
        return Ok(());
    }

    ensure_parent_dir(target, label)?;
    std::fs::copy(source, target).map_err(|error| {
        format!(
            "Failed to seed {label} file {:?} -> {:?}: {error}",
            source, target
        )
    })?;
    Ok(())
}

#[cfg(debug_assertions)]
pub(crate) fn ensure_dev_profile_seeded(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let release_settings = app_data_path(app_handle, SETTINGS_STORE_FILE_NAME)?;
    let dev_settings = app_data_path(app_handle, scoped_relative_path(SETTINGS_STORE_FILE_NAME))?;
    seed_file(&release_settings, &dev_settings, "settings store")?;

    let release_app_state = base_local_data_dir(app_handle)?.join(APP_STATE_DB_FILE_NAME);
    let dev_app_state = app_local_data_path(app_handle, APP_STATE_DB_FILE_NAME)?;
    seed_file(&release_app_state, &dev_app_state, "layout database")?;

    Ok(())
}

#[cfg(not(debug_assertions))]
pub(crate) fn ensure_dev_profile_seeded(_app_handle: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

pub(crate) fn settings_store_path() -> PathBuf {
    scoped_relative_path(SETTINGS_STORE_FILE_NAME)
}

pub(crate) fn app_local_data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let scoped_dir = scoped_local_data_dir(base_local_data_dir(app_handle)?);
    std::fs::create_dir_all(&scoped_dir).map_err(|error| {
        format!(
            "Failed to create scoped app local data directory {:?}: {error}",
            scoped_dir
        )
    })?;
    Ok(scoped_dir)
}

pub(crate) fn app_local_data_path(
    app_handle: &tauri::AppHandle,
    path: impl AsRef<Path>,
) -> Result<PathBuf, String> {
    let resolved = app_local_data_dir(app_handle)?.join(path);
    ensure_parent_dir(&resolved, "scoped app local data")?;
    Ok(resolved)
}
