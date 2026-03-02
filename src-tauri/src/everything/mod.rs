mod errors;
mod installed;
mod ipc;
mod models;
mod portable;
mod runtime;

pub use models::{SearchPage, SearchQuery, SearchRuntimeStatus};
pub use runtime::{
    get_search_runtime_status, search_files, start_search_runtime, stop_portable_runtime,
};
