use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use serde::Serialize;

use crate::layout_db;

use super::errors::{build_error, SearchErrorCode};
use super::ipc;
use super::models::{
    SearchPage, SearchProvider, SearchQuery, SearchRuntimeState, SearchRuntimeStatus,
};
use super::portable::{self, DEFAULT_PORTABLE_SERVICE_PIPE_NAME};

const DEFAULT_SEARCH_LIMIT: u32 = 50;
const MAX_SEARCH_LIMIT: u32 = 200;
const MAX_KEYWORD_LEN: usize = 256;

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
static IPC_CALL_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

fn with_ipc_lock<T>(f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _guard = IPC_CALL_LOCK
        .lock()
        .map_err(|_| "Failed to lock Everything IPC state".to_string())?;
    f()
}

fn wait_for_ipc_ready(dll_path: &PathBuf, timeout: Duration) -> bool {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
        if with_ipc_lock(|| ipc::probe_connection(dll_path)).is_ok() {
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

fn read_string_setting(app_handle: &tauri::AppHandle, key: &str, default: &str) -> String {
    let value = get_json_setting::<String>(app_handle, key).unwrap_or_else(|| default.to_string());
    if value.trim().is_empty() {
        default.to_string()
    } else {
        value
    }
}

fn ensure_runtime_defaults(app_handle: &tauri::AppHandle) {
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

fn persist_last_provider(app_handle: &tauri::AppHandle) {
    set_json_setting(
        app_handle,
        KEY_SEARCH_LAST_PROVIDER,
        &"portable".to_string(),
    );
}

fn set_runtime_ready(app_handle: &tauri::AppHandle) -> Result<SearchRuntimeStatus, String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    guard.set_status(
        SearchRuntimeState::PortableReady,
        Some(SearchProvider::Portable),
        None,
    );
    let snapshot = guard.snapshot();
    drop(guard);

    persist_last_provider(app_handle);
    Ok(snapshot)
}

fn cleanup_existing_portable_child() -> Result<(), String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    if let Some(mut child) = guard.portable_child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

fn attempt_portable_start(
    app_handle: &tauri::AppHandle,
    dll_path: &PathBuf,
    assets: &portable::PortableAssets,
    portable_pipe_name: &str,
) -> Result<SearchRuntimeStatus, String> {
    let mut portable_child = portable::start_portable_service(&assets.exe_path, portable_pipe_name)?;
    if wait_for_ipc_ready(dll_path, Duration::from_secs(5)) {
        {
            let mut guard = RUNTIME_STATE
                .lock()
                .map_err(|_| "Failed to lock search runtime state".to_string())?;
            guard.portable_child = Some(portable_child);
        }
        return set_runtime_ready(app_handle);
    }

    let _ = portable_child.kill();
    Err(build_error(
        SearchErrorCode::EverythingStartTimeout,
        "Portable Everything start timed out",
    ))
}

fn set_unavailable_state(message: String) -> Result<(), String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    guard.set_status(SearchRuntimeState::Unavailable, None, Some(message));
    Ok(())
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
            if with_ipc_lock(|| ipc::probe_connection(dll_path)).is_ok() {
                return set_runtime_ready(app_handle);
            }
        }
    }

    let portable_assets = portable::ensure_portable_assets(app_handle).map_err(|e| {
        build_error(
            SearchErrorCode::EverythingNotFound,
            format!("Portable Everything assets are unavailable: {}", e),
        )
    })?;
    let dll_path = portable_assets.dll_path.clone();

    {
        let mut guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard.dll_path = Some(dll_path.clone());
    }

    if with_ipc_lock(|| ipc::probe_connection(&dll_path)).is_ok() {
        return set_runtime_ready(app_handle);
    }

    cleanup_existing_portable_child()?;
    let portable_pipe_name = read_string_setting(
        app_handle,
        KEY_SEARCH_PORTABLE_PIPE_NAME,
        DEFAULT_PORTABLE_SERVICE_PIPE_NAME,
    );

    let startup_result =
        attempt_portable_start(app_handle, &dll_path, &portable_assets, &portable_pipe_name);
    if let Ok(status) = startup_result {
        return Ok(status);
    }

    let error = startup_result.err().unwrap_or_else(|| {
        build_error(
            SearchErrorCode::EverythingIpcUnavailable,
            "Portable runtime is unavailable",
        )
    });
    let _ = set_unavailable_state(error.clone());
    Err(error)
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
    let provider = status.provider.unwrap_or(SearchProvider::Portable);

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
    let items = with_ipc_lock(|| ipc::search(&dll_path, &query)).map_err(|e| {
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
