mod debug_log;
mod errors;
mod installed;
mod ipc;
mod models;
mod runtime;
mod sdk;

pub use models::{SearchHit, SearchPage, SearchQuery, SearchRuntimeStatus};

/// 让搜索链路之外的命令也能往同一份 `search-debug.log` 里写诊断信息。
pub fn log_search_debug(app_handle: &tauri::AppHandle, message: impl AsRef<str>) {
    debug_log::append(app_handle, message);
}
pub use runtime::{
    get_complete_search_snapshot, get_search_runtime_status, record_search_result_run,
    search_files, shutdown_search_runtime, start_search_runtime,
};
