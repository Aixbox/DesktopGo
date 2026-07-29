use std::path::Path;

use super::models::{SearchHit, SearchQuery};

#[cfg(windows)]
#[path = "ipc/api.rs"]
mod api;
#[cfg(windows)]
#[path = "ipc/query.rs"]
mod query;
#[cfg(windows)]
#[path = "ipc/reply_window.rs"]
mod reply_window;
#[cfg(windows)]
#[path = "ipc/snapshot.rs"]
mod snapshot;
#[cfg(windows)]
#[path = "ipc/worker.rs"]
mod worker;

#[derive(Debug, Clone, Copy)]
pub struct RuntimeProbeStatus {
    pub reachable: bool,
    pub database_loaded: bool,
}

#[derive(Debug, Clone)]
pub struct SearchResponse {
    pub items: Vec<SearchHit>,
    pub total_results: u32,
}

#[cfg(windows)]
pub fn probe_connection(dll_path: &Path, app_handle: &tauri::AppHandle) -> Result<(), String> {
    worker::probe_connection(dll_path, app_handle)
}

#[cfg(windows)]
pub fn search(
    dll_path: &Path,
    query: &SearchQuery,
    app_handle: &tauri::AppHandle,
) -> Result<SearchResponse, String> {
    worker::search(dll_path, query, app_handle)
}

#[cfg(windows)]
pub fn complete_snapshot(
    dll_path: &Path,
    query: &SearchQuery,
    app_handle: &tauri::AppHandle,
) -> Result<SearchResponse, String> {
    worker::complete_snapshot(dll_path, query, app_handle)
}

#[cfg(windows)]
pub fn inspect_runtime(
    dll_path: &Path,
    app_handle: &tauri::AppHandle,
) -> Result<RuntimeProbeStatus, String> {
    api::inspect_runtime(dll_path, app_handle)
}

#[cfg(windows)]
pub fn increment_run_count(dll_path: &Path, file_name: &str) -> Result<u32, String> {
    api::increment_run_count(dll_path, file_name)
}

#[cfg(windows)]
pub fn shutdown_worker(app_handle: &tauri::AppHandle) {
    worker::shutdown_worker(app_handle)
}

#[cfg(not(windows))]
pub fn probe_connection(_dll_path: &Path, _app_handle: &tauri::AppHandle) -> Result<(), String> {
    Err("Everything search is only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn search(
    _dll_path: &Path,
    _query: &SearchQuery,
    _app_handle: &tauri::AppHandle,
) -> Result<SearchResponse, String> {
    Err("Everything search is only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn complete_snapshot(
    _dll_path: &Path,
    _query: &SearchQuery,
    _app_handle: &tauri::AppHandle,
) -> Result<SearchResponse, String> {
    Err("Everything search is only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn inspect_runtime(
    _dll_path: &Path,
    _app_handle: &tauri::AppHandle,
) -> Result<RuntimeProbeStatus, String> {
    Err("Everything search is only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn increment_run_count(_dll_path: &Path, _file_name: &str) -> Result<u32, String> {
    Err("Everything search is only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn shutdown_worker(_app_handle: &tauri::AppHandle) {}
