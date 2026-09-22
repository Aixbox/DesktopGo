use crate::icons::{
    self, CreateIconEntryInput, DesktopIcon, IconManagerItem, IconMutationTarget,
    ImportDroppedPathsResult, ScannedInstalledApp, WebsiteIconResult,
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

/// 「快捷导入」：扫描已安装应用并标注重复状态。COM 解析与目录枚举都可能有
/// 秒级开销，放到阻塞线程池避免卡住主线程。
#[tauri::command]
pub async fn scan_installed_apps(
    app_handle: tauri::AppHandle,
) -> Result<Vec<ScannedInstalledApp>, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(icons::scan_installed_apps(app_handle)))
        .await
        .map_err(|error| format!("Failed to scan installed apps: {}", error))?
}

/// 「快捷导入」：按用户勾选的结果批量创建图标条目。图标提取是重活，
/// 同样放到阻塞线程池执行。
#[tauri::command]
pub async fn import_app_entries(
    app_handle: tauri::AppHandle,
    entries: Vec<CreateIconEntryInput>,
) -> Result<ImportDroppedPathsResult, String> {
    tauri::async_runtime::spawn_blocking(move || icons::import_app_entries(app_handle, entries))
        .await
        .map_err(|error| format!("Failed to import app entries: {}", error))?
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
pub async fn launch_app(path: String) -> Result<(), String> {
    // 必须离开主线程：唤起已在运行的程序时要等目标窗口自己完成还原（见 running_app.rs），
    // 在启动台的 UI 线程上做这件事会让它的失焦/隐藏逻辑嵌套进跨进程的窗口操作里。
    let started = std::time::Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || icons::launch_app(path))
        .await
        .map_err(|error| format!("Failed to launch app: {error}"))?;
    eprintln!(
        "[timing] launch_app command total={}ms",
        started.elapsed().as_millis()
    );
    result
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
