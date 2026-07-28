use crate::updater::{self, PendingUpdate, UpdateCheckResult, UpdaterConfigurationStatus};

#[tauri::command]
pub fn get_updater_configuration_status(
    app_handle: tauri::AppHandle,
) -> UpdaterConfigurationStatus {
    updater::get_updater_configuration_status(app_handle)
}

#[tauri::command]
pub async fn check_for_app_update(
    app_handle: tauri::AppHandle,
    pending_update: tauri::State<'_, PendingUpdate>,
) -> Result<UpdateCheckResult, String> {
    updater::check_for_app_update(app_handle, pending_update).await
}

#[tauri::command]
pub async fn install_app_update(
    app_handle: tauri::AppHandle,
    pending_update: tauri::State<'_, PendingUpdate>,
) -> Result<(), String> {
    updater::install_app_update(app_handle, pending_update).await
}
