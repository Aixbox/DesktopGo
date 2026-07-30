mod debug_log;
mod errors;
mod installed;
mod ipc;
mod models;
mod runtime;
mod sdk;

pub use models::{SearchHit, SearchPage, SearchQuery, SearchRuntimeStatus};
pub use runtime::{
    get_complete_search_snapshot, get_search_runtime_status, record_search_result_run,
    search_files, shutdown_search_runtime, start_search_runtime,
};
