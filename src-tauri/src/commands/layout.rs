use crate::layout_db;
use crate::layout_versions;

#[tauri::command]
pub fn list_layout_versions(
    app_handle: tauri::AppHandle,
    scope: String,
) -> Result<Vec<layout_versions::LayoutVersionMeta>, String> {
    layout_versions::list_layout_versions(&app_handle, &scope)
}

#[tauri::command]
pub fn get_layout_version(
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<Option<layout_versions::LayoutVersionDetail>, String> {
    layout_versions::get_layout_version(&app_handle, &id)
}

#[tauri::command]
pub fn save_layout_version(
    app_handle: tauri::AppHandle,
    scope: String,
    kind: String,
    name: Option<String>,
    payload: String,
) -> Result<layout_versions::LayoutVersionMeta, String> {
    layout_versions::save_layout_version(&app_handle, &scope, &kind, name.as_deref(), &payload)
}

#[tauri::command]
pub fn rename_layout_version(
    app_handle: tauri::AppHandle,
    id: String,
    name: String,
) -> Result<(), String> {
    layout_versions::rename_layout_version(&app_handle, &id, &name)
}

#[tauri::command]
pub fn delete_layout_version(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    layout_versions::delete_layout_version(&app_handle, &id)
}

#[tauri::command]
pub fn get_layout_payload(
    app_handle: tauri::AppHandle,
    key: String,
) -> Result<Option<String>, String> {
    layout_db::get_layout_payload(&app_handle, &key)
}

#[tauri::command]
pub fn get_layout_payloads(
    app_handle: tauri::AppHandle,
    keys: Vec<String>,
) -> Result<Vec<layout_db::LayoutPayloadValue>, String> {
    layout_db::get_layout_payloads(&app_handle, &keys)
}

#[tauri::command]
pub fn set_layout_payload(
    app_handle: tauri::AppHandle,
    key: String,
    payload: String,
) -> Result<(), String> {
    layout_db::set_layout_payload(&app_handle, &key, &payload)
}

#[tauri::command]
pub fn set_layout_payloads(
    app_handle: tauri::AppHandle,
    entries: Vec<layout_db::LayoutPayloadEntry>,
) -> Result<(), String> {
    layout_db::set_layout_payloads(&app_handle, &entries)
}
