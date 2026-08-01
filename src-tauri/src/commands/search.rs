use crate::everything::{self, SearchPage, SearchQuery, SearchRuntimeStatus};
use crate::icons;
use crate::launcher_catalog::{
    self, DefaultLauncherFolder, LauncherCatalogConfig, LauncherCatalogSnapshot,
};
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

/// 「最佳匹配」目录清单的完整条目表。扫哪些目录、收哪些类型全部由 `config` 决定，
/// 每次调用都重新枚举，目录内容与配置变化立即反映。
#[tauri::command]
pub async fn get_launcher_catalog(
    app_handle: tauri::AppHandle,
    config: Option<LauncherCatalogConfig>,
) -> Result<LauncherCatalogSnapshot, String> {
    let config = config.unwrap_or_default();
    let snapshot = tauri::async_runtime::spawn_blocking(move || {
        launcher_catalog::collect_launcher_catalog(config)
    })
    .await
    .map_err(|error| format!("Failed to join launcher catalog task: {error}"))?;
    // 走搜索调试日志，这样「最佳匹配为什么没出现某一项」可以不开 DevTools 就定位。
    // 目标解析数一并记下：合并「程序 + 它的快捷方式」全靠它，为 0 就说明去重失效了。
    let resolved = snapshot
        .entries
        .iter()
        .filter(|entry| entry.has_shortcut_target())
        .count();
    let roots = snapshot
        .roots
        .iter()
        .map(|root| format!("{}={}", root.key, root.entry_count))
        .collect::<Vec<_>>()
        .join(" ");
    everything::log_search_debug(
        &app_handle,
        format!(
            "launcher catalog: collected {} entries, {resolved} shortcut targets resolved, roots: {roots}",
            snapshot.entries.len()
        ),
    );
    Ok(snapshot)
}

/// 预设目录（开始菜单、桌面、快速启动的真实路径）。前端首次写入目录清单、
/// 以及用户点「恢复预设目录」时调用；写进清单后它们就是普通目录了。
#[tauri::command]
pub async fn get_default_launcher_folders() -> Result<Vec<DefaultLauncherFolder>, String> {
    tauri::async_runtime::spawn_blocking(launcher_catalog::default_launcher_folders)
        .await
        .map_err(|error| format!("Failed to join default launcher folders task: {error}"))
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
