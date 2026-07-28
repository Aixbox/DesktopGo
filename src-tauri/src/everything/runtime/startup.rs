use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::everything::debug_log::append as append_debug_log;
use crate::everything::errors::{build_error, SearchErrorCode};
use crate::everything::installed;
use crate::everything::ipc;
use crate::everything::models::{SearchRuntimeState, SearchRuntimeStatus};
use crate::everything::sdk;

use super::{
    build_initializing_error, ensure_runtime_defaults, set_initializing_state,
    set_not_installed_state, set_runtime_ready, set_runtime_status, set_unavailable_state,
    RUNTIME_STATE,
};

fn wait_for_ipc_ready(app_handle: &tauri::AppHandle, dll_path: &Path, timeout: Duration) -> bool {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
        if ipc::probe_connection(dll_path, app_handle).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

fn resolve_runtime_status(
    app_handle: &tauri::AppHandle,
    dll_path: &Path,
) -> Result<SearchRuntimeStatus, String> {
    match ipc::inspect_runtime(dll_path, app_handle) {
        Ok(runtime_status) => set_runtime_status(app_handle, runtime_status.database_loaded),
        Err(error) => {
            append_debug_log(
                app_handle,
                format!(
                    "start_search_runtime: inspect_runtime failed after successful probe: {}",
                    error
                ),
            );
            set_runtime_ready(app_handle)
        }
    }
}

fn reuse_ready_runtime(
    app_handle: &tauri::AppHandle,
) -> Result<Option<SearchRuntimeStatus>, String> {
    let guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    if matches!(guard.state, Some(SearchRuntimeState::InstalledReady)) && guard.dll_path.is_some() {
        append_debug_log(
            app_handle,
            "start_search_runtime: reuse installed_ready state",
        );
        return Ok(Some(guard.snapshot()));
    }
    Ok(None)
}

fn detect_installation(
    app_handle: &tauri::AppHandle,
) -> Result<installed::InstalledEverything, String> {
    let Some(installation) = installed::detect_installed_everything()? else {
        let error = build_error(
            SearchErrorCode::NotFound,
            "Installed Everything was not found",
        );
        append_debug_log(
            app_handle,
            format!("start_search_runtime: not installed: {}", error),
        );
        let _ = set_not_installed_state(error.clone());
        return Err(error);
    };
    append_debug_log(
        app_handle,
        format!(
            "start_search_runtime: installed exe={:?} version={:?}",
            installation.exe_path, installation.version
        ),
    );
    Ok(installation)
}

fn prepare_sdk(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dll_path = match sdk::ensure_sdk_dll(app_handle) {
        Ok(path) => path,
        Err(error) => {
            let error = build_error(
                SearchErrorCode::SdkUnavailable,
                format!("Everything SDK is unavailable: {}", error),
            );
            append_debug_log(
                app_handle,
                format!("start_search_runtime: sdk unavailable: {}", error),
            );
            let _ = set_unavailable_state(error.clone());
            return Err(error);
        }
    };
    append_debug_log(
        app_handle,
        format!("start_search_runtime: sdk ready at {:?}", dll_path),
    );
    Ok(dll_path)
}

fn cache_dll_path(dll_path: &Path) -> Result<(), String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    guard.dll_path = Some(dll_path.to_path_buf());
    Ok(())
}

fn probe_existing_runtime(
    app_handle: &tauri::AppHandle,
    dll_path: &Path,
) -> Result<Option<SearchRuntimeStatus>, String> {
    if ipc::probe_connection(dll_path, app_handle).is_ok() {
        append_debug_log(app_handle, "start_search_runtime: probe ok");
        return resolve_runtime_status(app_handle, dll_path).map(Some);
    }
    append_debug_log(app_handle, "start_search_runtime: initial probe failed");
    Ok(None)
}

fn start_desktop_instance(
    app_handle: &tauri::AppHandle,
    installation: &installed::InstalledEverything,
) -> Result<(), String> {
    if let Err(error) = installed::start_installed_everything(&installation.exe_path) {
        let error = build_error(
            SearchErrorCode::IpcUnavailable,
            format!(
                "Failed to start installed Everything desktop instance: {}",
                error
            ),
        );
        append_debug_log(
            app_handle,
            format!("start_search_runtime: start failed: {}", error),
        );
        let _ = set_unavailable_state(error.clone());
        return Err(error);
    }
    append_debug_log(
        app_handle,
        "start_search_runtime: desktop instance start requested",
    );
    Ok(())
}

fn wait_for_started_runtime(
    app_handle: &tauri::AppHandle,
    dll_path: &Path,
) -> Result<Option<SearchRuntimeStatus>, String> {
    if wait_for_ipc_ready(app_handle, dll_path, Duration::from_secs(5)) {
        append_debug_log(
            app_handle,
            "start_search_runtime: probe ok after desktop start",
        );
        return resolve_runtime_status(app_handle, dll_path).map(Some);
    }
    Ok(None)
}

fn resolve_startup_timeout(
    app_handle: &tauri::AppHandle,
    dll_path: &Path,
    version: Option<&str>,
) -> Result<SearchRuntimeStatus, String> {
    match ipc::inspect_runtime(dll_path, app_handle) {
        Ok(runtime_status) if runtime_status.reachable && !runtime_status.database_loaded => {
            let error = build_initializing_error(
                "Installed Everything is still starting or building its initial index",
            );
            append_debug_log(
                app_handle,
                format!("start_search_runtime: initializing: {}", error),
            );
            let _ = set_initializing_state(error.clone());
            return Err(error);
        }
        Ok(runtime_status) => append_debug_log(
            app_handle,
            format!(
                "start_search_runtime: inspect_runtime after timeout reachable={} database_loaded={}",
                runtime_status.reachable, runtime_status.database_loaded
            ),
        ),
        Err(error) => append_debug_log(
            app_handle,
            format!(
                "start_search_runtime: inspect_runtime after timeout failed: {}",
                error
            ),
        ),
    }

    let version_text = version
        .map(|version| format!(" (version {})", version))
        .unwrap_or_default();
    let error = build_error(
        SearchErrorCode::IpcUnavailable,
        format!(
            "Installed Everything{} is running but DesktopGo could not reach its desktop IPC instance",
            version_text
        ),
    );
    append_debug_log(
        app_handle,
        format!("start_search_runtime: ipc unavailable: {}", error),
    );
    let _ = set_unavailable_state(error.clone());
    Err(error)
}

pub fn start_search_runtime(app_handle: &tauri::AppHandle) -> Result<SearchRuntimeStatus, String> {
    ensure_runtime_defaults(app_handle);
    append_debug_log(app_handle, "start_search_runtime: enter");
    if let Some(status) = reuse_ready_runtime(app_handle)? {
        return Ok(status);
    }

    let installation = detect_installation(app_handle)?;
    let dll_path = prepare_sdk(app_handle)?;
    cache_dll_path(&dll_path)?;
    if let Some(status) = probe_existing_runtime(app_handle, &dll_path)? {
        return Ok(status);
    }

    start_desktop_instance(app_handle, &installation)?;
    if let Some(status) = wait_for_started_runtime(app_handle, &dll_path)? {
        return Ok(status);
    }
    resolve_startup_timeout(app_handle, &dll_path, installation.version.as_deref())
}
