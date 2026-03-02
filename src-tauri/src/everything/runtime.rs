use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;

use super::installed;
use super::ipc;
use super::models::{
    SearchPage, SearchProvider, SearchQuery, SearchRuntimeState, SearchRuntimeStatus,
};
use super::portable;

#[derive(Default)]
struct RuntimeState {
    state: Option<SearchRuntimeState>,
    provider: Option<SearchProvider>,
    message: Option<String>,
    dll_path: Option<PathBuf>,
    portable_child: Option<Child>,
}

impl RuntimeState {
    fn snapshot(&self) -> SearchRuntimeStatus {
        SearchRuntimeStatus::new(
            self.state.unwrap_or(SearchRuntimeState::Unknown),
            self.provider,
            self.message.clone(),
        )
    }

    fn set_status(
        &mut self,
        state: SearchRuntimeState,
        provider: Option<SearchProvider>,
        message: Option<String>,
    ) {
        self.state = Some(state);
        self.provider = provider;
        self.message = message;
    }
}

static RUNTIME_STATE: Lazy<Mutex<RuntimeState>> = Lazy::new(|| Mutex::new(RuntimeState::default()));

fn wait_for_ipc_ready(dll_path: &PathBuf, timeout: Duration) -> bool {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
        if ipc::probe_connection(dll_path).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

pub fn get_search_runtime_status() -> Result<SearchRuntimeStatus, String> {
    let guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    Ok(guard.snapshot())
}

pub fn start_search_runtime(app_handle: &tauri::AppHandle) -> Result<SearchRuntimeStatus, String> {
    let assets = portable::ensure_portable_assets(app_handle)?;
    let dll_path = assets.dll_path.clone();

    {
        let mut guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard.dll_path = Some(dll_path.clone());
    }

    if ipc::probe_connection(&dll_path).is_ok() {
        let mut guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        let provider = if guard.portable_child.is_some() {
            SearchProvider::Portable
        } else {
            SearchProvider::Installed
        };
        let next_state = if provider == SearchProvider::Portable {
            SearchRuntimeState::PortableReady
        } else {
            SearchRuntimeState::InstalledReady
        };
        guard.set_status(next_state, Some(provider), None);
        return Ok(guard.snapshot());
    }

    if installed::try_start_installed_everything()?
        && wait_for_ipc_ready(&dll_path, Duration::from_secs(5))
    {
        let mut guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard.set_status(
            SearchRuntimeState::InstalledReady,
            Some(SearchProvider::Installed),
            None,
        );
        return Ok(guard.snapshot());
    }

    let mut portable_child = portable::start_portable_service(&assets.exe_path)?;
    if wait_for_ipc_ready(&dll_path, Duration::from_secs(5)) {
        let mut guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard.portable_child = Some(portable_child);
        guard.set_status(
            SearchRuntimeState::PortableReady,
            Some(SearchProvider::Portable),
            None,
        );
        return Ok(guard.snapshot());
    }

    let _ = portable_child.kill();
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;
    guard.set_status(
        SearchRuntimeState::Unavailable,
        None,
        Some("Everything runtime is unavailable".to_string()),
    );
    Err("Everything runtime is unavailable".to_string())
}

pub fn stop_portable_runtime() -> Result<(), String> {
    let mut guard = RUNTIME_STATE
        .lock()
        .map_err(|_| "Failed to lock search runtime state".to_string())?;

    if let Some(mut child) = guard.portable_child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    guard.set_status(SearchRuntimeState::Unknown, None, None);
    Ok(())
}

pub fn search_files(
    app_handle: &tauri::AppHandle,
    mut query: SearchQuery,
) -> Result<SearchPage, String> {
    query.keyword = query.keyword.trim().to_string();
    if query.limit == 0 {
        query.limit = 50;
    }

    let status = start_search_runtime(app_handle)?;
    let provider = status.provider.unwrap_or(SearchProvider::Installed);

    if query.keyword.is_empty() {
        return Ok(SearchPage {
            items: Vec::new(),
            offset: query.offset,
            limit: query.limit,
            has_more: false,
            provider,
            took_ms: 0,
        });
    }

    let dll_path = {
        let guard = RUNTIME_STATE
            .lock()
            .map_err(|_| "Failed to lock search runtime state".to_string())?;
        guard
            .dll_path
            .clone()
            .ok_or_else(|| "Everything DLL path is not initialized".to_string())?
    };

    let started_at = Instant::now();
    let items = ipc::search(&dll_path, &query)?;
    let took_ms = started_at.elapsed().as_millis() as u64;
    let has_more = items.len() as u32 >= query.limit;

    Ok(SearchPage {
        items,
        offset: query.offset,
        limit: query.limit,
        has_more,
        provider,
        took_ms,
    })
}
