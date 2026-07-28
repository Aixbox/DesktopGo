use tauri_plugin_store::StoreExt;

use crate::{autostart, storage_profile};

#[cfg(any(not(windows), not(debug_assertions)))]
const DEFAULT_LAUNCH_ON_STARTUP: bool = true;
const LAUNCH_ON_STARTUP_SETTING_KEY: &str = "launchOnStartup";
const WINDOWS_RUN_VALUE_NAME: &str = "DesktopGo";
const SHOW_ON_LAUNCH_MARKER_FILE_NAME: &str = ".show_on_launch";

pub(crate) fn should_show_on_launch(_app: &tauri::AppHandle) -> bool {
    let exe = std::env::current_exe().ok();
    let marker = exe
        .as_ref()
        .and_then(|path| path.parent())
        .map(|dir| dir.join(SHOW_ON_LAUNCH_MARKER_FILE_NAME));
    match marker {
        Some(path) if path.exists() => {
            let _ = std::fs::remove_file(&path);
            true
        }
        _ => false,
    }
}

fn read_saved_launch_on_startup(app: &tauri::AppHandle) -> Option<bool> {
    app.store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get(LAUNCH_ON_STARTUP_SETTING_KEY)
                .and_then(|value| value.as_bool())
        })
}

fn save_launch_on_startup_setting(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let store = app
        .store(storage_profile::settings_store_path())
        .map_err(|error| format!("无法打开本地设置存储：{}", error))?;
    store.set(LAUNCH_ON_STARTUP_SETTING_KEY, enabled);
    store
        .save()
        .map_err(|error| format!("无法保存开机自启设置：{}", error))
}

#[cfg(all(windows, debug_assertions))]
pub(crate) fn initialize_launch_on_startup(_app: &tauri::AppHandle) {
    match autostart::get_registered_command(WINDOWS_RUN_VALUE_NAME) {
        Ok(Some(command)) if autostart::is_debug_launch_command(&command) => {
            if let Err(error) = autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, false) {
                eprintln!(
                    "Warning: Failed to remove debug launch-on-startup registration: {}",
                    error
                );
            }
        }
        Ok(_) => {}
        Err(error) => eprintln!(
            "Warning: Failed to inspect launch-on-startup registration in debug build: {}",
            error
        ),
    }
}

#[cfg(all(windows, not(debug_assertions)))]
pub(crate) fn initialize_launch_on_startup(app: &tauri::AppHandle) {
    let saved_launch_on_startup = read_saved_launch_on_startup(app);
    let enabled = saved_launch_on_startup.unwrap_or(DEFAULT_LAUNCH_ON_STARTUP);

    match autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, enabled) {
        Ok(()) => {
            if saved_launch_on_startup.is_none() {
                if let Err(error) = save_launch_on_startup_setting(app, enabled) {
                    eprintln!(
                        "Warning: Failed to persist default launch on startup setting `{}`: {}",
                        enabled, error
                    );
                }
            }
        }
        Err(error) => eprintln!(
            "Warning: Failed to update launch on startup state `{}`: {}",
            enabled, error
        ),
    }
}

#[cfg(not(windows))]
pub(crate) fn initialize_launch_on_startup(app: &tauri::AppHandle) {
    let saved_launch_on_startup = read_saved_launch_on_startup(app);
    let enabled = saved_launch_on_startup.unwrap_or(DEFAULT_LAUNCH_ON_STARTUP);

    match autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, enabled) {
        Ok(()) => {
            if saved_launch_on_startup.is_none() {
                if let Err(error) = save_launch_on_startup_setting(app, enabled) {
                    eprintln!(
                        "Warning: Failed to persist default launch on startup setting `{}`: {}",
                        enabled, error
                    );
                }
            }
        }
        Err(error) => eprintln!(
            "Warning: Failed to update launch on startup state `{}`: {}",
            enabled, error
        ),
    }
}

#[cfg(all(windows, debug_assertions))]
pub(crate) fn read_launch_on_startup_enabled(app: &tauri::AppHandle) -> Result<bool, String> {
    let enabled = autostart::get_registered_command(WINDOWS_RUN_VALUE_NAME)?
        .map(|command| !command.trim().is_empty() && !autostart::is_debug_launch_command(&command))
        .unwrap_or(false);

    if read_saved_launch_on_startup(app) != Some(enabled) {
        if let Err(error) = save_launch_on_startup_setting(app, enabled) {
            eprintln!(
                "Warning: Failed to synchronize launch on startup setting `{}`: {}",
                enabled, error
            );
        }
    }

    Ok(enabled)
}

#[cfg(all(windows, not(debug_assertions)))]
pub(crate) fn read_launch_on_startup_enabled(app: &tauri::AppHandle) -> Result<bool, String> {
    let enabled = match autostart::get_registered_command(WINDOWS_RUN_VALUE_NAME)? {
        Some(command) => command.trim() == autostart::current_launch_command()?,
        None => false,
    };

    if read_saved_launch_on_startup(app) != Some(enabled) {
        if let Err(error) = save_launch_on_startup_setting(app, enabled) {
            eprintln!(
                "Warning: Failed to synchronize launch on startup setting `{}`: {}",
                enabled, error
            );
        }
    }

    Ok(enabled)
}

#[cfg(not(windows))]
pub(crate) fn read_launch_on_startup_enabled(app: &tauri::AppHandle) -> Result<bool, String> {
    let enabled = autostart::is_enabled(WINDOWS_RUN_VALUE_NAME)?;

    if read_saved_launch_on_startup(app) != Some(enabled) {
        if let Err(error) = save_launch_on_startup_setting(app, enabled) {
            eprintln!(
                "Warning: Failed to synchronize launch on startup setting `{}`: {}",
                enabled, error
            );
        }
    }

    Ok(enabled)
}

#[cfg(all(windows, debug_assertions))]
pub(crate) fn set_launch_on_startup_enabled(
    _app: &tauri::AppHandle,
    _enabled: bool,
) -> Result<bool, String> {
    Err("调试构建不支持开机自启，请使用安装版或发布版 DesktopGo。".to_string())
}

#[cfg(any(not(windows), all(windows, not(debug_assertions))))]
pub(crate) fn set_launch_on_startup_enabled(
    app: &tauri::AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    let previous_enabled = autostart::is_enabled(WINDOWS_RUN_VALUE_NAME)?;
    autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, enabled)?;

    if let Err(error) = save_launch_on_startup_setting(app, enabled) {
        let rollback_message =
            match autostart::set_enabled(WINDOWS_RUN_VALUE_NAME, previous_enabled) {
                Ok(()) => "已回滚系统开机自启状态。".to_string(),
                Err(rollback_error) => format!("回滚系统开机自启状态也失败了：{}", rollback_error),
            };

        return Err(format!("{} {}", error, rollback_message));
    }

    Ok(enabled)
}
