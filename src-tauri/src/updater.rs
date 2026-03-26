use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

const UPDATE_TIMEOUT_SECONDS: u64 = 30;
pub const UPDATE_PROGRESS_EVENT: &str = "desktopgo://updater-progress";

const BUILD_UPDATER_PUBKEY: Option<&str> = option_env!("DESKTOPGO_UPDATER_PUBKEY");
const BUILD_UPDATER_ENDPOINTS: Option<&str> = option_env!("DESKTOPGO_UPDATER_ENDPOINTS");
const BUILD_UPDATER_TARGET: Option<&str> = option_env!("DESKTOPGO_UPDATER_TARGET");

static INSTALL_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
pub struct PendingUpdate(pub Mutex<Option<Update>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterConfigurationStatus {
    pub configured: bool,
    pub current_version: String,
    pub target: String,
    pub endpoints: Vec<String>,
    pub message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub version: String,
    pub current_version: String,
    pub target: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub configured: bool,
    pub available: bool,
    pub current_version: String,
    pub target: String,
    pub endpoints: Vec<String>,
    pub update: Option<UpdateMetadata>,
    pub message: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum UpdateProgressEvent {
    Started {
        content_length: Option<u64>,
    },
    Progress {
        chunk_length: u64,
        downloaded_length: u64,
        content_length: Option<u64>,
    },
    Installing,
    Finished,
    BeforeExit,
    Error {
        message: String,
    },
}

struct UpdaterBuildConfig {
    pubkey: String,
    endpoints: Vec<String>,
    target: Option<String>,
}

pub fn get_updater_configuration_status(app_handle: AppHandle) -> UpdaterConfigurationStatus {
    let current_version = app_handle.package_info().version.to_string();
    let target = resolved_target();

    match resolve_build_config() {
        Ok(config) => match parse_endpoint_urls(&config.endpoints) {
            Ok(_) => UpdaterConfigurationStatus {
                configured: true,
                current_version,
                target,
                endpoints: config.endpoints,
                message: Some("已检测到更新配置，可以直接检查更新。".into()),
            },
            Err(message) => UpdaterConfigurationStatus {
                configured: false,
                current_version,
                target,
                endpoints: config.endpoints,
                message: Some(message),
            },
        },
        Err(message) => UpdaterConfigurationStatus {
            configured: false,
            current_version,
            target,
            endpoints: Vec::new(),
            message: Some(message),
        },
    }
}

pub async fn check_for_app_update(
    app_handle: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<UpdateCheckResult, String> {
    let status = get_updater_configuration_status(app_handle.clone());
    if !status.configured {
        *pending_update
            .0
            .lock()
            .map_err(|_| "无法读取待安装更新状态".to_string())? = None;
        return Ok(UpdateCheckResult {
            configured: false,
            available: false,
            current_version: status.current_version,
            target: status.target,
            endpoints: status.endpoints,
            update: None,
            message: status.message,
        });
    }

    let update = build_updater(&app_handle)?
        .check()
        .await
        .map_err(|e| format!("检查更新失败：{e}"))?;

    let metadata = update.as_ref().map(|update| UpdateMetadata {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        target: update.target.clone(),
        body: update.body.clone(),
        date: update.date.map(|date| date.to_string()),
    });
    let has_update = metadata.is_some();

    *pending_update.0.lock().map_err(|_| "无法写入待安装更新状态".to_string())? = update;

    Ok(UpdateCheckResult {
        configured: true,
        available: has_update,
        current_version: status.current_version,
        target: status.target,
        endpoints: status.endpoints,
        update: metadata,
        message: if has_update {
            Some("检测到可用更新。".into())
        } else {
            Some("当前已是最新版本。".into())
        },
    })
}

pub async fn install_app_update(
    app_handle: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<(), String> {
    if INSTALL_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("更新安装已在进行中，请稍候。".into());
    }

    let update = pending_update
        .0
        .lock()
        .map_err(|_| "无法读取待安装更新状态".to_string())?
        .take()
        .ok_or_else(|| "没有待安装的更新，请先执行“检查更新”。".to_string())?;

    let app_handle_started = app_handle.clone();
    let app_handle_installing = app_handle.clone();
    let app_handle_error = app_handle.clone();
    let emitted_started = AtomicBool::new(false);
    let downloaded_length = AtomicU64::new(0);

    let install_result = update
        .download_and_install(
            move |chunk_length, content_length| {
                let chunk_length = chunk_length as u64;
                let next_downloaded_length =
                    downloaded_length.fetch_add(chunk_length, Ordering::Relaxed) + chunk_length;

                if !emitted_started.swap(true, Ordering::Relaxed) {
                    let _ = app_handle_started.emit(
                        UPDATE_PROGRESS_EVENT,
                        UpdateProgressEvent::Started { content_length },
                    );
                }

                let _ = app_handle_started.emit(
                    UPDATE_PROGRESS_EVENT,
                    UpdateProgressEvent::Progress {
                        chunk_length,
                        downloaded_length: next_downloaded_length,
                        content_length,
                    },
                );
            },
            move || {
                let _ = app_handle_installing.emit(
                    UPDATE_PROGRESS_EVENT,
                    UpdateProgressEvent::Installing,
                );
            },
        )
        .await;

    INSTALL_IN_PROGRESS.store(false, Ordering::SeqCst);

    match install_result {
        Ok(_) => {
            let _ = app_handle.emit(UPDATE_PROGRESS_EVENT, UpdateProgressEvent::Finished);
            Ok(())
        }
        Err(error) => {
            let message = format!("下载安装更新失败：{error}");
            let _ = app_handle_error.emit(
                UPDATE_PROGRESS_EVENT,
                UpdateProgressEvent::Error {
                    message: message.clone(),
                },
            );
            Err(message)
        }
    }
}

fn build_updater(app_handle: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let config = resolve_build_config()?;
    let endpoints = parse_endpoint_urls(&config.endpoints)?;
    let before_exit_handle = app_handle.clone();

    let mut builder = app_handle
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|e| format!("更新地址格式无效：{e}"))?
        .timeout(Duration::from_secs(UPDATE_TIMEOUT_SECONDS))
        .pubkey(config.pubkey)
        .on_before_exit(move || {
            let _ = before_exit_handle.emit(UPDATE_PROGRESS_EVENT, UpdateProgressEvent::BeforeExit);
        });

    if let Some(target) = config.target {
        builder = builder.target(target);
    }

    builder
        .build()
        .map_err(|e| format!("更新器初始化失败：{e}"))
}

fn resolve_build_config() -> Result<UpdaterBuildConfig, String> {
    let pubkey = read_build_value(BUILD_UPDATER_PUBKEY);
    let endpoints = read_build_endpoints(BUILD_UPDATER_ENDPOINTS);
    let target = read_build_value(BUILD_UPDATER_TARGET);

    let mut missing = Vec::new();
    if pubkey.is_none() {
        missing.push("DESKTOPGO_UPDATER_PUBKEY");
    }
    if endpoints.as_ref().map_or(true, Vec::is_empty) {
        missing.push("DESKTOPGO_UPDATER_ENDPOINTS");
    }

    if !missing.is_empty() {
        return Err(format!(
            "更新未配置。请在构建时注入 {}。",
            missing.join(" 和 ")
        ));
    }

    Ok(UpdaterBuildConfig {
        pubkey: pubkey.unwrap_or_default(),
        endpoints: endpoints.unwrap_or_default(),
        target,
    })
}

fn resolved_target() -> String {
    read_build_value(BUILD_UPDATER_TARGET)
        .or_else(tauri_plugin_updater::target)
        .unwrap_or_else(|| "unknown".into())
}

fn read_build_value(raw: Option<&str>) -> Option<String> {
    let value = raw
        .map(|value| value.replace("\\n", "\n").trim().to_string())
        .filter(|value| !value.is_empty())?;
    Some(value)
}

fn read_build_endpoints(raw: Option<&str>) -> Option<Vec<String>> {
    let value = read_build_value(raw)?;

    if value.starts_with('[') {
        let parsed = serde_json::from_str::<Vec<String>>(&value).ok()?;
        let endpoints = parsed
            .into_iter()
            .map(|endpoint| endpoint.trim().to_string())
            .filter(|endpoint| !endpoint.is_empty())
            .collect::<Vec<_>>();
        return if endpoints.is_empty() { None } else { Some(endpoints) };
    }

    let endpoints = value
        .split(['\n', ';', ','])
        .map(str::trim)
        .filter(|endpoint| !endpoint.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    if endpoints.is_empty() {
        None
    } else {
        Some(endpoints)
    }
}

fn parse_endpoint_urls(endpoints: &[String]) -> Result<Vec<Url>, String> {
    endpoints
        .iter()
        .map(|endpoint| {
            Url::parse(endpoint)
                .map_err(|error| format!("更新地址 `{endpoint}` 无法解析：{error}"))
        })
        .collect()
}
