use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use serde::Serialize;

use crate::layout_db;

use super::errors::{build_error, SearchErrorCode};
use super::installed;
use super::ipc;
use super::models::{
    SearchPage, SearchProvider, SearchQuery, SearchRuntimeState, SearchRuntimeStatus,
};
use super::portable::{self, DEFAULT_PORTABLE_SERVICE_PIPE_NAME};

const DEFAULT_SEARCH_LIMIT: u32 = 50;
const MAX_SEARCH_LIMIT: u32 = 200;
const MAX_KEYWORD_LEN: usize = 256;

const KEY_SEARCH_PREFER_INSTALLED: &str = "search.preferInstalled";
const KEY_SEARCH_AUTO_START_RUNTIME: &str = "search.autoStartRuntime";
const KEY_SEARCH_LAST_PROVIDER: &str = "search.lastProvider";
const KEY_SEARCH_PORTABLE_PIPE_NAME: &str = "search.portableServicePipeName";

#[derive(Default)]
struct RuntimeState {
    state: Option<SearchRuntimeState>,
    provider: Option<SearchProvider>,
    message: Option<String>,
    dll_path: Option<PathBuf>,
    portable_child: Option<Child>,
}

impl RuntimeState {
    fn snapshot(&self) -> SearchRuntimeStatus {
        SearchRuntimeStatus::new(
            self.state.unwrap_or(SearchRuntimeState::Unknown),
            self.provider,
            self.message.clone(),
        )
    }

    fn set_status(
        &mut self,
        state: SearchRuntimeState,
        provider: Option<SearchProvider>,
        message: Option<String>,
    ) {
        self.state = Some(state);
        self.provider = provider;
        self.message = message;
    }
}

static RUNTIME_STATE: Lazy<Mutex<RuntimeState>> = Lazy::new(|| Mutex::new(RuntimeState::default()));

fn wait_for_ipc_ready(dll_path: &PathBuf, timeout: Duration) -> bool {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
        if ipc::probe_connection(dll_path).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

fn get_json_setting<T>(app_handle: &tauri::AppHandle, key: &str) -> Option<T>
where
    T: serde::de::DeserializeOwned,
{
    let raw = layout_db::get_layout_payload(app_handle, key).ok().flatten()?;
    serde_json::from_str::<T>(&raw).ok()
}

fn set_json_setting<T>(app_handle: &tauri::AppHandle, key: &str, value: &T)
where
    T: Serialize,
{
    if let Ok(payload) = serde_json::to_string(value) {
        let _ = layout_db::set_layout_payload(app_handle, key, &payload);
    }
}

fn read_bool_setting(app_handle: &tauri::AppHandle, key: &str, default: bool) -> bool {
    get_json_setting::<bool>(app_handle, key).unwrap_or(default)
}

fn read_string_setting(app_handle: &tauri::AppHandle, key: &str, default: &str) -> String {
    let value = get_json_setting::<String>(app_handle, key).unwrap_or_else(|| default.to_string());
    if value.trim().is_empty() {
        default.to_string()
    } else {
        value
    }
}

fn ensure_runtime_defaults(app_handle: &tauri::AppHandle) {
    if layout_db::get_layout_payload(app_handle, KEY_SEARCH_PREFER_INSTALLED)
        .ok()
        .flatten()
        .is_none()
    {
        set_json_setting(app_handle, KEY_SEARCH_PREFER_INSTALLED, &true);
    }

    if layout_db::get_layout_payload(app_handle, KEY_SEARCH_AUTO_START_RUNTIME)
        .ok()
        .flatten()
        .is_none()
    {
        set_json_setting(app_handle, KEY_SEARCH_AUTO_START_RUNTIME, &true);
    }

    if layout_db::get_layout_payload(app_handle, KEY_SEARCH_PORTABLE_PIPE_NAME)
        .ok()
        .flatten()
        .is_none()
    {
        set_json_setting(
            app_handle,
            KEY_SEARCH_PORTABLE_PIPE_NAME,
            &DEFAULT_PORTABLE_SERVICE_PIPE_NAME.to_string(),
        );
    }
}

fn persist_last_provider(app_handle: &tauri::AppHandle, provider: SearchProvider) {
    let value = match provider {
        SearchProvider::Installed => "installed",
        SearchProvider::Portable => "portable",
    };
    set_json_setting(app_handle, KEY_SEARCH_LAST_PROVIDER, &value.to_string());
}

fn set_runtime_ready(
    app_handle: &tauri::AppHandle,
    provider: SearchProvider,
) -> Result<SearchRuntimeStatus, String> {
    let next_state = if provider == SearchProvider::Portable {
        SearchRuntimeState::PortableReady
    } else {
        SearchRuntimeState::InstalledReady
    };

    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    guard.set_status(next_state, Some(provider), None);
    let snapshot = guard.snapshot();
    drop(guard);

    persist_last_provider(app_handle, provider);
    Ok(snapshot)
}

fn attempt_installed_start(
    app_handle: &tauri::AppHandle,
    dll_path: &PathBuf,
    installed_probe: &installed::InstalledProbeResult,
) -> Result<Option<SearchRuntimeStatus>, String> {
    if installed_probe.executable_paths.is_empty() {
        return Ok(None);
    }

    let started = installed::try_start_installed_everything(&installed_probe.executable_paths)?;
    if !started && !installed_probe.service_running {
        return Ok(None);
    }

    if wait_for_ipc_ready(dll_path, Duration::from_secs(5)) {
        return set_runtime_ready(app_handle, SearchProvider::Installed).map(Some);
    }

    Err(build_error(
        SearchErrorCode::EverythingStartTimeout,
        "Installed Everything start timed out",
    ))
}

fn attempt_portable_start(
    app_handle: &tauri::AppHandle,
    dll_path: &PathBuf,
    portable_assets: Option<&portable::PortableAssets>,
    portable_pipe_name: &str,
) -> Result<Option<SearchRuntimeStatus>, String> {
    let Some(assets) = portable_assets else {
        return Ok(None);
    };

    let mut portable_child =
        portable::start_portable_service(&assets.exe_path, portable_pipe_name)?;
    if wait_for_ipc_ready(dll_path, Duration::from_secs(5)) {
        {
            let mut guard = RUNTIME_STATE
                .lock()
                .map_err(|_| "Failed to lock search runtime state".to_string())?;
            guard.portable_child = Some(portable_child);
        }
        return set_runtime_ready(app_handle, SearchProvider::Portable).map(Some);
    }

    let _ = portable_child.kill();
    Err(build_error(
        SearchErrorCode::EverythingStartTimeout,
        "Portable Everything start timed out",
    ))
}

pub fn get_search_runtime_status() -> Result<SearchRuntimeStatus, String> {
    let guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    Ok(guard.snapshot())
}

pub fn start_search_runtime(app_handle: &tauri::AppHandle) -> Result<SearchRuntimeStatus, String> {
    ensure_runtime_defaults(app_handle);

    {
        let guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        if let Some(dll_path) = guard.dll_path.as_ref() {
            if ipc::probe_connection(dll_path).is_ok() {
                return Ok(guard.snapshot());
            }
        }
    }

    let installed_probe = installed::probe_installed_everything()?;
    let portable_assets = portable::ensure_portable_assets(app_handle).ok();
    let dll_path = portable_assets
        .as_ref()
        .map(|assets| assets.dll_path.clone())
        .or_else(|| installed::resolve_dll_path(&installed_probe.executable_paths))
        .ok_or_else(|| {
            build_error(
                SearchErrorCode::EverythingNotFound,
                "Everything SDK DLL is unavailable",
            )
        })?;

    {
        let mut guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard.dll_path = Some(dll_path.clone());
    }

    if ipc::probe_connection(&dll_path).is_ok() {
        let provider = {
            let guard = RUNTIME_STATE
                .lock()
                .map_err(|_| "Failed to lock search runtime state".to_string())?;
            if guard.portable_child.is_some() {
                SearchProvider::Portable
            } else {
                SearchProvider::Installed
            }
        };
        return set_runtime_ready(app_handle, provider);
    }

    let prefer_installed = read_bool_setting(app_handle, KEY_SEARCH_PREFER_INSTALLED, true);
    let portable_pipe_name = read_string_setting(
        app_handle,
        KEY_SEARCH_PORTABLE_PIPE_NAME,
        DEFAULT_PORTABLE_SERVICE_PIPE_NAME,
    );

    let mut last_error = String::new();
    let installed_only_lite =
        installed_probe.lite_detected && !installed::contains_full_install(&installed_probe.executable_paths);
    let mut ready: Option<SearchRuntimeStatus> = None;

    if prefer_installed {
        match attempt_installed_start(app_handle, &dll_path, &installed_probe) {
            Ok(status) => ready = status,
            Err(e) => last_error = e,
        }
        if ready.is_none() {
            match attempt_portable_start(
                app_handle,
                &dll_path,
                portable_assets.as_ref(),
                &portable_pipe_name,
            ) {
                Ok(status) => ready = status,
                Err(e) => last_error = e,
            }
        }
    } else {
        match attempt_portable_start(
            app_handle,
            &dll_path,
            portable_assets.as_ref(),
            &portable_pipe_name,
        ) {
            Ok(status) => ready = status,
            Err(e) => last_error = e,
        }
        if ready.is_none() {
            match attempt_installed_start(app_handle, &dll_path, &installed_probe) {
                Ok(status) => ready = status,
                Err(e) => last_error = e,
            }
        }
    }

    if let Some(status) = ready {
        return Ok(status);
    }

    let no_installed = installed_probe.executable_paths.is_empty() && !installed_probe.lite_detected;
    let no_portable = portable_assets.is_none();
    let final_error = if installed_only_lite && no_portable {
        build_error(
            SearchErrorCode::EverythingLiteUnsupported,
            "Everything Lite does not support IPC. Please install full Everything.",
        )
    } else if no_installed && no_portable {
        build_error(
            SearchErrorCode::EverythingNotFound,
            "No available Everything runtime found",
        )
    } else if last_error.is_empty() {
        build_error(
            SearchErrorCode::EverythingIpcUnavailable,
            "Everything runtime is unavailable",
        )
    } else {
        last_error
    };

    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    guard.set_status(SearchRuntimeState::Unavailable, None, Some(final_error.clone()));
    Err(final_error)
}

pub fn stop_portable_runtime() -> Result<(), String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;

    if let Some(mut child) = guard.portable_child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    guard.set_status(SearchRuntimeState::Unknown, None, None);
    Ok(())
}

pub fn search_files(
    app_handle: &tauri::AppHandle,
    mut query: SearchQuery,
) -> Result<SearchPage, String> {
    query.keyword = query.keyword.trim().to_string();
    if query.keyword.chars().count() > MAX_KEYWORD_LEN {
        query.keyword = query.keyword.chars().take(MAX_KEYWORD_LEN).collect();
    }
    if query.limit == 0 {
        query.limit = DEFAULT_SEARCH_LIMIT;
    } else if query.limit > MAX_SEARCH_LIMIT {
        query.limit = MAX_SEARCH_LIMIT;
    }

    let status = start_search_runtime(app_handle)?;
    let provider = status.provider.unwrap_or(SearchProvider::Installed);

    if query.keyword.is_empty() {
        return Ok(SearchPage {
            items: Vec::new(),
            offset: query.offset,
            limit: query.limit,
            has_more: false,
            provider,
            took_ms: 0,
        });
    }

    let dll_path = {
        let guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard
            .dll_path
            .clone()
            .ok_or_else(|| "Everything DLL path is not initialized".to_string())?
    };

    let started_at = Instant::now();
    let items = ipc::search(&dll_path, &query).map_err(|e| {
        build_error(
            SearchErrorCode::EverythingIpcUnavailable,
            format!("Everything query failed: {}", e),
        )
    })?;
    let took_ms = started_at.elapsed().as_millis() as u64;
    let has_more = items.len() as u32 >= query.limit;

    Ok(SearchPage {
        items,
        offset: query.offset,
        limit: query.limit,
        has_more,
        provider,
        took_ms,
    })
}
