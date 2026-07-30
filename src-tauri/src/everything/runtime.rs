use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;

use once_cell::sync::Lazy;
use serde::Serialize;

use crate::layout_db;

use super::debug_log::append as append_debug_log;
use super::errors::{build_error, SearchErrorCode};
use super::ipc;
use super::models::{
    SearchHit, SearchPage, SearchProvider, SearchQuery, SearchRuntimeState, SearchRuntimeStatus,
};

mod startup;

pub use startup::start_search_runtime;

const DEFAULT_SEARCH_LIMIT: u32 = 200;
const MAX_SEARCH_LIMIT: u32 = 200;
// Keep complete React snapshots bounded; larger result sets retain paged access.
const MAX_COMPLETE_SEARCH_RESULTS: u32 = 100_000;
const MAX_KEYWORD_LEN: usize = 256;

const KEY_SEARCH_AUTO_START_RUNTIME: &str = "search.autoStartRuntime";
const KEY_SEARCH_LAST_PROVIDER: &str = "search.lastProvider";

#[derive(Default)]
struct RuntimeState {
    state: Option<SearchRuntimeState>,
    provider: Option<SearchProvider>,
    message: Option<String>,
    dll_path: Option<PathBuf>,
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

fn set_json_setting<T>(app_handle: &tauri::AppHandle, key: &str, value: &T)
where
    T: Serialize,
{
    if let Ok(payload) = serde_json::to_string(value) {
        let _ = layout_db::set_layout_payload(app_handle, key, &payload);
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
}

fn persist_last_provider(app_handle: &tauri::AppHandle) {
    set_json_setting(
        app_handle,
        KEY_SEARCH_LAST_PROVIDER,
        &"installed".to_string(),
    );
}

fn set_runtime_ready(app_handle: &tauri::AppHandle) -> Result<SearchRuntimeStatus, String> {
    set_runtime_status(app_handle, true)
}

fn set_runtime_status(
    app_handle: &tauri::AppHandle,
    database_loaded: bool,
) -> Result<SearchRuntimeStatus, String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    let state = if database_loaded {
        SearchRuntimeState::InstalledReady
    } else {
        SearchRuntimeState::Initializing
    };
    let message = if database_loaded {
        None
    } else {
        Some(build_initializing_error(
            "Installed Everything is still starting or building its initial index",
        ))
    };
    guard.set_status(state, Some(SearchProvider::Installed), message);
    let snapshot = guard.snapshot();
    drop(guard);

    persist_last_provider(app_handle);
    Ok(snapshot)
}

fn set_not_installed_state(message: String) -> Result<(), String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    guard.set_status(SearchRuntimeState::NotInstalled, None, Some(message));
    Ok(())
}

fn set_unavailable_state(message: String) -> Result<(), String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    guard.set_status(SearchRuntimeState::Unavailable, None, Some(message));
    Ok(())
}

fn set_initializing_state(message: String) -> Result<(), String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    guard.set_status(
        SearchRuntimeState::Initializing,
        Some(SearchProvider::Installed),
        Some(message),
    );
    Ok(())
}

fn build_initializing_error(message: impl AsRef<str>) -> String {
    build_error(SearchErrorCode::Initializing, message)
}

fn map_search_query_error(app_handle: &tauri::AppHandle, dll_path: &Path, error: String) -> String {
    if error.starts_with("EverythingBusy") {
        return error;
    }

    if let Ok(runtime_status) = ipc::inspect_runtime(dll_path, app_handle) {
        if runtime_status.reachable && !runtime_status.database_loaded {
            return build_initializing_error(
                "Everything is still starting or building its index, please try again shortly",
            );
        }
    }

    build_error(
        SearchErrorCode::IpcUnavailable,
        format!("Everything query failed: {}", error),
    )
}

pub fn get_search_runtime_status() -> Result<SearchRuntimeStatus, String> {
    let guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    Ok(guard.snapshot())
}

pub fn search_files(
    app_handle: &tauri::AppHandle,
    mut query: SearchQuery,
) -> Result<SearchPage, String> {
    append_debug_log(
        app_handle,
        format!(
            "search_files: enter keyword={:?} offset={} limit={}",
            query.keyword, query.offset, query.limit
        ),
    );
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
    append_debug_log(
        app_handle,
        format!("search_files: runtime provider={:?}", provider),
    );

    if query.keyword.is_empty() {
        append_debug_log(app_handle, "search_files: empty keyword, return empty page");
        return Ok(SearchPage {
            items: Vec::new(),
            offset: query.offset,
            limit: query.limit,
            total_results: 0,
            has_more: false,
            provider,
            runtime_state: status.state,
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
    append_debug_log(
        app_handle,
        format!("search_files: using dll {:?}", dll_path),
    );

    let started_at = Instant::now();
    append_debug_log(app_handle, "search_files: ipc search begin");
    let response = ipc::search(&dll_path, &query, app_handle)
        .map_err(|error| map_search_query_error(app_handle, &dll_path, error))?;
    let took_ms = started_at.elapsed().as_millis() as u64;
    let has_more =
        query.offset.saturating_add(response.items.len() as u32) < response.total_results;
    append_debug_log(
        app_handle,
        format!(
            "search_files: ipc search done items={} total_results={} took_ms={} has_more={}",
            response.items.len(),
            response.total_results,
            took_ms,
            has_more
        ),
    );

    Ok(SearchPage {
        items: response.items,
        offset: query.offset,
        limit: query.limit,
        total_results: response.total_results,
        has_more,
        provider,
        runtime_state: status.state,
        took_ms,
    })
}

pub fn get_complete_search_snapshot(
    app_handle: &tauri::AppHandle,
    mut query: SearchQuery,
) -> Result<Vec<SearchHit>, String> {
    query.keyword = query.keyword.trim().to_string();
    query.offset = 0;
    query.limit = query.limit.clamp(1, MAX_COMPLETE_SEARCH_RESULTS);
    let _ = start_search_runtime(app_handle)?;
    let dll_path = {
        let guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard
            .dll_path
            .clone()
            .ok_or_else(|| "Everything DLL path is not initialized".to_string())?
    };

    ipc::complete_snapshot(&dll_path, &query, app_handle).map(|response| response.items)
}

pub fn record_search_result_run(app_handle: &tauri::AppHandle, path: &str) -> Result<(), String> {
    let trimmed_path = path.trim();
    if trimmed_path.is_empty() {
        return Ok(());
    }

    let _ = start_search_runtime(app_handle)?;
    let dll_path = {
        let guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard
            .dll_path
            .clone()
            .ok_or_else(|| "Everything DLL path is not initialized".to_string())?
    };

    ipc::increment_run_count(&dll_path, trimmed_path).map_err(|e| {
        build_error(
            SearchErrorCode::IpcUnavailable,
            format!("Failed to update Everything run count: {}", e),
        )
    })?;

    Ok(())
}

pub fn shutdown_search_runtime(app_handle: &tauri::AppHandle) {
    append_debug_log(app_handle, "shutdown_search_runtime: enter");
    ipc::shutdown_worker(app_handle);

    if let Ok(mut guard) = RUNTIME_STATE.lock() {
        guard.state = Some(SearchRuntimeState::Unknown);
        guard.provider = None;
        guard.message = None;
        guard.dll_path = None;
    }
}
