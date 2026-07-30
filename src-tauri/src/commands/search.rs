use crate::everything::{self, SearchPage, SearchQuery, SearchRuntimeStatus};
use crate::icons;
use crate::search_preview::{self, SearchPreview};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultIcon {
    path: String,
    icon_base64: String,
}

/// One visible row. `is_folder` is carried from the search result so the icon
/// pipeline never has to stat the path again.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchIconRequest {
    path: String,
    #[serde(default)]
    is_folder: bool,
}

#[tauri::command]
pub async fn start_search_runtime(
    app_handle: tauri::AppHandle,
) -> Result<SearchRuntimeStatus, String> {
    tauri::async_runtime::spawn_blocking(move || everything::start_search_runtime(&app_handle))
        .await
        .map_err(|error| format!("Failed to join start_search_runtime task: {}", error))?
}

#[tauri::command]
pub fn get_search_runtime_status() -> Result<SearchRuntimeStatus, String> {
    everything::get_search_runtime_status()
}

#[tauri::command]
pub async fn search_files(
    app_handle: tauri::AppHandle,
    query: SearchQuery,
) -> Result<SearchPage, String> {
    tauri::async_runtime::spawn_blocking(move || everything::search_files(&app_handle, query))
        .await
        .map_err(|error| format!("Failed to join search_files task: {}", error))?
}

#[tauri::command]
pub async fn get_complete_search_snapshot(
    app_handle: tauri::AppHandle,
    query: SearchQuery,
) -> Result<Vec<crate::everything::SearchHit>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        everything::get_complete_search_snapshot(&app_handle, query)
    })
    .await
    .map_err(|error| format!("Failed to join complete search snapshot task: {error}"))?
}

#[tauri::command]
pub async fn get_search_result_icons(
    requests: Vec<SearchIconRequest>,
    icon_size: i32,
) -> Result<Vec<SearchResultIcon>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let requests: Vec<(String, bool)> = requests
            .into_iter()
            .map(|request| (request.path, request.is_folder))
            .collect();
        icons::get_search_result_icons(&requests, icon_size)
            .into_iter()
            .map(|(path, icon_base64)| SearchResultIcon { path, icon_base64 })
            .collect()
    })
    .await
    .map_err(|error| format!("Failed to join search icon task: {error}"))
}

#[tauri::command]
pub async fn get_search_preview(path: String) -> Result<SearchPreview, String> {
    tauri::async_runtime::spawn_blocking(move || search_preview::get_search_preview(&path))
        .await
        .map_err(|error| format!("Failed to join get_search_preview task: {}", error))?
}

#[tauri::command]
pub async fn record_search_result_run(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        everything::record_search_result_run(&app_handle, &path)
    })
    .await
    .map_err(|error| format!("Failed to join record_search_result_run task: {}", error))?
}
