use super::models::{
    CreateIconEntryInput, DesktopIcon, IconManagerItem, IconMutationTarget,
    ImportDroppedPathsResult, InvalidIconEntry, UpdateIconEntryInput,
};
use super::search_cache;

#[cfg(windows)]
use super::catalog_windows;
#[cfg(windows)]
use super::platform_windows::launch_app_windows;

macro_rules! platform_result {
    ($app_handle:ident, $value:ident, $operation:ident) => {{
        #[cfg(windows)]
        {
            catalog_windows::operations::$operation(&$app_handle, &$value)
        }
        #[cfg(not(windows))]
        {
            let _ = $app_handle;
            let _ = $value;
            Err("Not supported on this platform".to_string())
        }
    }};
}

pub fn get_icons(app_handle: tauri::AppHandle, icon_size: i32) -> Vec<DesktopIcon> {
    #[cfg(windows)]
    {
        match catalog_windows::operations::get_all_icons_windows(&app_handle, icon_size) {
            Ok(icons) => icons,
            Err(error) => {
                eprintln!("Failed to load icon snapshots: {error}");
                Vec::new()
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = icon_size;
        Vec::new()
    }
}

pub fn get_icon_edit_source(app_handle: tauri::AppHandle, id: &str) -> Result<String, String> {
    #[cfg(windows)]
    {
        catalog_windows::operations::get_icon_edit_source(&app_handle, id)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = id;
        Err("Not supported on this platform".to_string())
    }
}

pub fn get_icon_manager_items(
    app_handle: tauri::AppHandle,
    icon_size: i32,
) -> Vec<IconManagerItem> {
    #[cfg(windows)]
    {
        match catalog_windows::operations::get_all_icon_manager_items_windows(
            &app_handle,
            icon_size,
        ) {
            Ok(icons) => icons,
            Err(error) => {
                eprintln!("Failed to load icon manager snapshot data: {error}");
                Vec::new()
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = icon_size;
        Vec::new()
    }
}

pub fn hide_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    platform_result!(app_handle, targets, hide_icons_windows)
}

pub fn unhide_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    platform_result!(app_handle, targets, unhide_icons_windows)
}

pub fn delete_icons(
    app_handle: tauri::AppHandle,
    targets: Vec<IconMutationTarget>,
) -> Result<usize, String> {
    platform_result!(app_handle, targets, delete_icons_windows)
}

pub fn scan_invalid_icons(app_handle: tauri::AppHandle) -> Result<Vec<InvalidIconEntry>, String> {
    #[cfg(windows)]
    {
        catalog_windows::operations::scan_invalid_icons_windows(&app_handle)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        Err("Not supported on this platform".to_string())
    }
}

pub fn launch_app(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        launch_app_windows(&path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Not supported on this platform".to_string())
    }
}

pub fn get_path_icon_base64(path: &str, icon_size: i32) -> String {
    #[cfg(windows)]
    {
        catalog_windows::get_path_icon_base64_windows(path, icon_size)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        let _ = icon_size;
        String::new()
    }
}

pub fn get_search_result_icons(paths: &[String], icon_size: i32) -> Vec<(String, String)> {
    search_cache::get_search_result_icons(paths, icon_size)
}

pub fn get_custom_icon_source(path: &str) -> Result<String, String> {
    #[cfg(windows)]
    {
        catalog_windows::operations::get_custom_icon_source(path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Not supported on this platform".to_string())
    }
}

pub fn import_dropped_paths(
    app_handle: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<ImportDroppedPathsResult, String> {
    #[cfg(windows)]
    {
        catalog_windows::operations::import_dropped_paths_windows(&app_handle, paths)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = paths;
        Err("Not supported on this platform".to_string())
    }
}

pub fn create_icon_entry(
    app_handle: tauri::AppHandle,
    input: CreateIconEntryInput,
) -> Result<ImportDroppedPathsResult, String> {
    #[cfg(windows)]
    {
        catalog_windows::operations::create_icon_entry_windows(&app_handle, input)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = input;
        Err("Not supported on this platform".to_string())
    }
}

pub fn update_icon_entry(
    app_handle: tauri::AppHandle,
    input: UpdateIconEntryInput,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        catalog_windows::operations::update_icon_entry_windows(&app_handle, input)
    }
    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = input;
        Err("Not supported on this platform".to_string())
    }
}
