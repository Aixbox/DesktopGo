use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use once_cell::sync::Lazy;
use serde::Serialize;
use tauri::Manager;

use crate::layout_db;

use super::errors::{build_error, SearchErrorCode};
use super::http::{self, HttpServerConfig};
use super::installed;
use super::ipc;
use super::models::{
    SearchPage, SearchProvider, SearchQuery, SearchRuntimeState, SearchRuntimeStatus,
};
use super::sdk;

const DEFAULT_SEARCH_LIMIT: u32 = 50;
const MAX_SEARCH_LIMIT: u32 = 200;
const MAX_KEYWORD_LEN: usize = 256;

const KEY_SEARCH_AUTO_START_RUNTIME: &str = "search.autoStartRuntime";
const KEY_SEARCH_LAST_PROVIDER: &str = "search.lastProvider";

#[derive(Default)]
struct RuntimeState {
    state: Option<SearchRuntimeState>,
    provider: Option<SearchProvider>,
    message: Option<String>,
    dll_path: Option<PathBuf>,
    http_config: Option<HttpServerConfig>,
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

pub(super) fn append_debug_log(app_handle: &tauri::AppHandle, message: impl AsRef<str>) {
    let text = message.as_ref();
    eprintln!("[search-debug] {}", text);

    let base_dir = match app_handle.path().app_local_data_dir() {
        Ok(path) => path,
        Err(_) => return,
    };
    if fs::create_dir_all(&base_dir).is_err() {
        return;
    }

    let log_path = base_dir.join("search-debug.log");
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) else {
        return;
    };

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_millis())
        .unwrap_or_default();
    let _ = writeln!(file, "[{}] {}", ts, text);
}

fn wait_for_ipc_ready(app_handle: &tauri::AppHandle, dll_path: &PathBuf, timeout: Duration) -> bool {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
        if ipc::probe_connection(dll_path, app_handle).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

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

fn set_runtime_ready(
    app_handle: &tauri::AppHandle,
    http_config: Option<HttpServerConfig>,
) -> Result<SearchRuntimeStatus, String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    guard.http_config = http_config;
    guard.set_status(
        SearchRuntimeState::InstalledReady,
        Some(SearchProvider::Installed),
        None,
    );
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
    guard.http_config = None;
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
    append_debug_log(app_handle, "start_search_runtime: enter");

    {
        let guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        if matches!(guard.state, Some(SearchRuntimeState::InstalledReady))
            && (guard.dll_path.is_some() || guard.http_config.is_some())
        {
            append_debug_log(app_handle, "start_search_runtime: reuse installed_ready state");
            return Ok(guard.snapshot());
        }
    }

    let Some(installation) = installed::detect_installed_everything()? else {
        let error = build_error(
            SearchErrorCode::EverythingNotFound,
            "Installed Everything was not found",
        );
        append_debug_log(app_handle, format!("start_search_runtime: not installed: {}", error));
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

    let http_config = http::detect_http_server()?;
    if let Some(config) = http_config {
        append_debug_log(
            app_handle,
            format!("start_search_runtime: http configured on port {}", config.port),
        );
        if http::probe(config).is_ok() {
            append_debug_log(app_handle, "start_search_runtime: http probe ok");
            return set_runtime_ready(app_handle, Some(config));
        }

        append_debug_log(app_handle, "start_search_runtime: http probe failed, requesting desktop instance");
        if let Err(error) = installed::start_installed_everything(&installation.exe_path) {
            let error = build_error(
                SearchErrorCode::EverythingIpcUnavailable,
                format!("Failed to start installed Everything desktop instance: {}", error),
            );
            append_debug_log(app_handle, format!("start_search_runtime: start failed: {}", error));
            let _ = set_unavailable_state(error.clone());
            return Err(error);
        }

        let started_at = Instant::now();
        while started_at.elapsed() < Duration::from_secs(5) {
            if http::probe(config).is_ok() {
                append_debug_log(app_handle, "start_search_runtime: http probe ok after desktop start");
                return set_runtime_ready(app_handle, Some(config));
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        append_debug_log(app_handle, "start_search_runtime: http probe still unavailable after desktop start");
    }

    let dll_path = sdk::ensure_sdk_dll(app_handle).map_err(|e| {
        build_error(
            SearchErrorCode::EverythingNotFound,
            format!("Everything SDK is unavailable: {}", e),
        )
    })?;
    append_debug_log(
        app_handle,
        format!("start_search_runtime: sdk ready at {:?}", dll_path),
    );

    {
        let mut guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard.dll_path = Some(dll_path.clone());
    }

    let cached_dll_path = {
        let guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard.dll_path.clone()
    };
    if let Some(dll_path) = cached_dll_path.as_ref() {
        if ipc::probe_connection(dll_path, app_handle).is_ok() {
            append_debug_log(app_handle, "start_search_runtime: probe ok");
            return set_runtime_ready(app_handle, None);
        }
    }
    append_debug_log(app_handle, "start_search_runtime: initial probe failed");

    if let Err(error) = installed::start_installed_everything(&installation.exe_path) {
        let error = build_error(
            SearchErrorCode::EverythingIpcUnavailable,
            format!("Failed to start installed Everything desktop instance: {}", error),
        );
        append_debug_log(app_handle, format!("start_search_runtime: start failed: {}", error));
        let _ = set_unavailable_state(error.clone());
        return Err(error);
    }
    append_debug_log(app_handle, "start_search_runtime: desktop instance start requested");

    if wait_for_ipc_ready(app_handle, &dll_path, Duration::from_secs(5)) {
        append_debug_log(app_handle, "start_search_runtime: probe ok after desktop start");
        return set_runtime_ready(app_handle, None);
    }

    let version_text = installation
        .version
        .map(|version| format!(" (version {})", version))
        .unwrap_or_default();
    let error = build_error(
        SearchErrorCode::EverythingIpcUnavailable,
        format!(
            "Installed Everything{} is running but DesktopGo could not reach its desktop IPC instance",
            version_text
        ),
    );
    append_debug_log(app_handle, format!("start_search_runtime: ipc unavailable: {}", error));
    let _ = set_unavailable_state(error.clone());
    Err(error)
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
    append_debug_log(app_handle, format!("search_files: runtime provider={:?}", provider));

    if query.keyword.is_empty() {
        append_debug_log(app_handle, "search_files: empty keyword, return empty page");
        return Ok(SearchPage {
            items: Vec::new(),
            offset: query.offset,
            limit: query.limit,
            total_results: 0,
            has_more: false,
            provider,
            took_ms: 0,
        });
    }

    let http_config = {
        let guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard.http_config
    };

    if let Some(config) = http_config {
        let started_at = Instant::now();
        append_debug_log(
            app_handle,
            format!("search_files: http search begin port={}", config.port),
        );
        let response = http::search(config, &query).map_err(|e| {
            build_error(
                SearchErrorCode::EverythingIpcUnavailable,
                format!("Everything HTTP search failed: {}", e),
            )
        })?;
        let took_ms = started_at.elapsed().as_millis() as u64;
        let has_more = query.offset.saturating_add(response.items.len() as u32) < response.total_results;
        append_debug_log(
            app_handle,
            format!(
                "search_files: http search done items={} total_results={} took_ms={} has_more={}",
                response.items.len(),
                response.total_results,
                took_ms,
                has_more
            ),
        );

        return Ok(SearchPage {
            items: response.items,
            offset: query.offset,
            limit: query.limit,
            total_results: response.total_results,
            has_more,
            provider,
            took_ms,
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
    append_debug_log(app_handle, format!("search_files: using dll {:?}", dll_path));

    let started_at = Instant::now();
    append_debug_log(app_handle, "search_files: ipc search begin");
    let response = ipc::search(&dll_path, &query, app_handle).map_err(|e| {
        build_error(
            SearchErrorCode::EverythingIpcUnavailable,
            format!("Everything query failed: {}", e),
        )
    })?;
    let took_ms = started_at.elapsed().as_millis() as u64;
    let has_more = query.offset.saturating_add(response.items.len() as u32) < response.total_results;
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
        took_ms,
    })
}
