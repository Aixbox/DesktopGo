use crate::{request_main_window_show, storage_profile};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

pub(crate) const DEFAULT_LAUNCHPAD_SHORTCUT: &str = "Ctrl+Space";

pub(crate) struct LaunchpadShortcutState {
    current: Mutex<Option<String>>,
}

impl Default for LaunchpadShortcutState {
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
        }
    }
}

fn normalize(shortcut: &str) -> Result<String, String> {
    let trimmed = shortcut.trim();
    if trimmed.is_empty() {
        return Err("快捷键不能为空。".to_string());
    }

    let parsed: Shortcut = trimmed
        .parse()
        .map_err(|error| format!("无效快捷键：{}", error))?;

    if parsed.mods.is_empty() {
        return Err("快捷键至少需要一个修饰键，例如 Ctrl、Alt、Shift。".to_string());
    }

    Ok(parsed.into_string())
}

fn register_handler(app: &tauri::AppHandle, shortcut: &str) -> Result<String, String> {
    let normalized = normalize(shortcut)?;
    let handle = app.clone();

    app.global_shortcut()
        .on_shortcut(normalized.as_str(), move |_app, _shortcut, event| {
            if event.state != ShortcutState::Released {
                return;
            }
            request_main_window_show(&handle);
        })
        .map_err(|error| format!("无法注册启动台快捷键 `{}`：{}", normalized, error))?;

    Ok(normalized)
}

fn read_saved(app: &tauri::AppHandle) -> String {
    app.store(storage_profile::settings_store_path())
        .ok()
        .and_then(|store| {
            store
                .get("launchpadShortcut")
                .and_then(|value| value.as_str().map(str::to_owned))
        })
        .unwrap_or_else(|| DEFAULT_LAUNCHPAD_SHORTCUT.to_string())
}

fn persist(app: &tauri::AppHandle, shortcut: &str) {
    if let Ok(store) = app.store(storage_profile::settings_store_path()) {
        store.set("launchpadShortcut", shortcut.to_string());
        let _ = store.save();
    }
}

pub(crate) fn initialize(app: &tauri::AppHandle) {
    let saved_shortcut = read_saved(app);
    let shortcut_state = app.state::<LaunchpadShortcutState>();

    match update_registration(app, shortcut_state.inner(), &saved_shortcut) {
        Ok(normalized) => {
            if normalized != saved_shortcut {
                persist(app, &normalized);
            }
        }
        Err(error) => {
            eprintln!(
                "Warning: Failed to register saved launchpad shortcut `{}`: {}",
                saved_shortcut, error
            );

            if saved_shortcut == DEFAULT_LAUNCHPAD_SHORTCUT {
                return;
            }

            match update_registration(app, shortcut_state.inner(), DEFAULT_LAUNCHPAD_SHORTCUT) {
                Ok(normalized) => persist(app, &normalized),
                Err(fallback_error) => eprintln!(
                    "Warning: Failed to register default launchpad shortcut `{}`: {}",
                    DEFAULT_LAUNCHPAD_SHORTCUT, fallback_error
                ),
            }
        }
    }
}

pub(crate) fn update_registration(
    app: &tauri::AppHandle,
    shortcut_state: &LaunchpadShortcutState,
    shortcut: &str,
) -> Result<String, String> {
    let normalized = normalize(shortcut)?;
    let mut current = shortcut_state
        .current
        .lock()
        .map_err(|_| "无法锁定当前启动台快捷键状态。".to_string())?;

    if current.as_deref() == Some(normalized.as_str()) {
        return Ok(normalized);
    }

    register_handler(app, &normalized)?;

    if let Some(previous) = current.as_deref() {
        if let Err(error) = app.global_shortcut().unregister(previous) {
            let _ = app.global_shortcut().unregister(normalized.as_str());
            return Err(format!(
                "无法卸载旧的启动台快捷键 `{}`：{}",
                previous, error
            ));
        }
    }

    *current = Some(normalized.clone());
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_accepts_default_shortcut() {
        assert!(normalize(DEFAULT_LAUNCHPAD_SHORTCUT).is_ok());
    }

    #[test]
    fn normalize_requires_a_modifier() {
        assert!(normalize("Space").is_err());
    }
}
