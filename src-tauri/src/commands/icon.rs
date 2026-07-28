use crate::icons::{
    self, CreateIconEntryInput, DesktopIcon, IconManagerItem, IconMutationTarget,
    ImportDroppedPathsResult, WebsiteIconResult,
};

#[tauri::command]
pub fn get_icons(app_handle: tauri::AppHandle, icon_size: i32) -> Vec<DesktopIcon> {
    icons::get_icons(app_handle, icon_size)
}

#[tauri::command]
pub fn get_icon_manager_items(
    app_handle: tauri::AppHandle,
    icon_size: i32,
) -> Vec<IconManagerItem> {
    icons::get_icon_manager_items(app_handle, icon_size)
}

#[tauri::command]
pub fn get_icon_edit_source(app_handle: tauri::AppHandle, id: String) -> Result<String, String> {
    icons::get_icon_edit_source(app_handle, &id)
}

#[tauri::command]
pub fn hide_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    icons::hide_icons(app_handle, targets)
}

#[tauri::command]
pub fn unhide_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    icons::unhide_icons(app_handle, targets)
}

#[tauri::command]
pub fn delete_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    icons::delete_icons(app_handle, targets)
}

#[tauri::command]
pub async fn scan_invalid_icons(
    app_handle: tauri::AppHandle,
) -> Result<Vec<icons::InvalidIconEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || icons::scan_invalid_icons(app_handle))
        .await
        .map_err(|error| format!("Failed to scan invalid icons: {}", error))?
}

#[tauri::command]
pub fn import_dropped_paths(
    app_handle: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<ImportDroppedPathsResult, String> {
    icons::import_dropped_paths(app_handle, paths)
}

#[tauri::command]
pub fn create_icon_entry(
    app_handle: tauri::AppHandle,
    input: CreateIconEntryInput,
) -> Result<ImportDroppedPathsResult, String> {
    icons::create_icon_entry(app_handle, input)
}

#[tauri::command]
pub fn update_icon_entry(
    app_handle: tauri::AppHandle,
    input: icons::UpdateIconEntryInput,
) -> Result<(), String> {
    icons::update_icon_entry(app_handle, input)
}

#[tauri::command]
pub async fn extract_website_icon(url: String) -> Result<WebsiteIconResult, String> {
    icons::extract_website_icon(url).await
}

#[tauri::command]
pub fn launch_app(path: String) -> Result<(), String> {
    icons::launch_app(path)
}

#[tauri::command]
pub async fn show_shell_context_menu(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<Option<String>, String> {
    crate::shell_context_menu::show_shell_context_menu(&app_handle, path).await
}

#[tauri::command]
pub async fn get_drag_preview_icon(path: String, icon_size: i32) -> Result<String, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    let size = if icon_size <= 0 { 32 } else { icon_size };
    tauri::async_runtime::spawn_blocking(move || icons::get_path_icon_base64(&trimmed, size))
        .await
        .map_err(|error| format!("Failed to extract drag preview icon: {}", error))
}

#[tauri::command]
pub async fn get_custom_icon_source(path: String) -> Result<String, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    tauri::async_runtime::spawn_blocking(move || icons::get_custom_icon_source(&trimmed))
        .await
        .map_err(|error| format!("Failed to load custom icon source: {error}"))?
}

#[tauri::command]
pub async fn optimize_icon_image(data_uri: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || icons::optimize_icon_data_uri(&data_uri))
        .await
        .map_err(|error| format!("Failed to join icon optimization: {error}"))?
}
