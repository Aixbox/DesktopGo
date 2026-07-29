use crate::everything::{self, SearchPage, SearchQuery, SearchRuntimeStatus};
use crate::icons;
use crate::native_search_list::{
    self, NativeSearchBounds, NativeSearchListState, NativeSearchPalette,
};
use crate::search_preview::{self, SearchPreview};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultIcon {
    path: String,
    icon_base64: String,
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
pub async fn get_search_result_icons(
    paths: Vec<String>,
    icon_size: i32,
) -> Result<Vec<SearchResultIcon>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        icons::get_search_result_icons(&paths, icon_size)
            .into_iter()
            .map(|(path, icon_base64)| SearchResultIcon { path, icon_base64 })
            .collect()
    })
    .await
    .map_err(|error| format!("Failed to join search icon task: {error}"))
}

#[tauri::command]
pub async fn prepare_native_search_list(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, NativeSearchListState>,
    generation: u64,
    query: SearchQuery,
) -> Result<u32, String> {
    state.begin_generation(generation)?;
    let items = tauri::async_runtime::spawn_blocking(move || {
        everything::get_complete_search_snapshot(&app_handle, query)
    })
    .await
    .map_err(|error| format!("Failed to join native search snapshot task: {error}"))??;
    let count = items.len().min(u32::MAX as usize) as u32;
    if !state.commit_results(generation, items)? {
        return Err("Native search snapshot was superseded".to_string());
    }
    Ok(count)
}

#[tauri::command]
pub async fn show_native_search_list(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeSearchListState>,
    generation: u64,
    bounds: NativeSearchBounds,
    palette: NativeSearchPalette,
) -> Result<(), String> {
    native_search_list::show(window, state, generation, bounds, palette).await
}

#[tauri::command]
pub async fn hide_native_search_list(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeSearchListState>,
) -> Result<(), String> {
    native_search_list::hide(window, state).await
}

#[tauri::command]
pub async fn select_native_search_list_item(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeSearchListState>,
    index: i32,
) -> Result<(), String> {
    native_search_list::select(window, state, index).await
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
