use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::HWND;

use super::api::{sort_to_sdk_value, to_wide_null_terminated, EverythingApi};
use super::reply_window;
use super::{SearchQuery, SearchResponse};
use crate::everything::debug_log::append as append_debug_log;
use crate::everything::models::SearchHit;
use crate::icons;

const EVERYTHING_REQUEST_FILE_NAME: u32 = 0x0000_0001;
const EVERYTHING_REQUEST_PATH: u32 = 0x0000_0002;
const EVERYTHING_REQUEST_HIGHLIGHTED_FILE_NAME: u32 = 0x0000_2000;
const EVERYTHING_REQUEST_HIGHLIGHTED_PATH: u32 = 0x0000_4000;
const SEARCH_RESULT_ICON_SIZE: i32 = 32;
const REPLY_ID_COUNT: u32 = 1;
const REPLY_ID_RANGE: u32 = 2;
const REPLY_ID_PROBE: u32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SearchRequestKind {
    Count,
    Range,
}

impl SearchRequestKind {
    fn reply_id(self) -> u32 {
        match self {
            Self::Count => REPLY_ID_COUNT,
            Self::Range => REPLY_ID_RANGE,
        }
    }

    fn reason(self) -> &'static str {
        match self {
            Self::Count => "count",
            Self::Range => "range",
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct FirstPageCache {
    pub(super) query: SearchQuery,
    pub(super) response: SearchResponse,
}

pub(super) enum ActiveRequest {
    Probe {
        reply_id: u32,
        started_at: Instant,
        timeout: Duration,
        response: Sender<Result<(), String>>,
    },
    Search {
        reply_id: u32,
        started_at: Instant,
        timeout: Duration,
        query: SearchQuery,
        request_kind: SearchRequestKind,
        response: Sender<Result<SearchResponse, String>>,
    },
}

impl ActiveRequest {
    fn reply_id(&self) -> u32 {
        match self {
            Self::Probe { reply_id, .. } | Self::Search { reply_id, .. } => *reply_id,
        }
    }

    pub(super) fn started_at(&self) -> Instant {
        match self {
            Self::Probe { started_at, .. } | Self::Search { started_at, .. } => *started_at,
        }
    }

    pub(super) fn timeout(&self) -> Duration {
        match self {
            Self::Probe { timeout, .. } | Self::Search { timeout, .. } => *timeout,
        }
    }

    pub(super) fn is_probe(&self) -> bool {
        matches!(self, Self::Probe { .. })
    }
}

fn extract_path(api: &EverythingApi, index: u32) -> Option<String> {
    let mut buffer = vec![0u16; 32_768];
    let copied = unsafe {
        (api.get_result_full_path_name_w)(index, buffer.as_mut_ptr(), buffer.len() as u32)
    };
    if copied == 0 {
        return None;
    }
    let end = buffer
        .iter()
        .position(|ch| *ch == 0)
        .unwrap_or(copied.min(buffer.len() as u32) as usize);
    if end == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buffer[..end]))
}

fn extract_result_text(pointer: *const u16) -> String {
    if pointer.is_null() {
        return String::new();
    }

    let mut len = 0usize;
    unsafe {
        while *pointer.add(len) != 0 {
            len += 1;
        }
        if len == 0 {
            return String::new();
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(pointer, len))
    }
}

fn extract_search_results(
    api: &EverythingApi,
    app_handle: &tauri::AppHandle,
) -> Result<SearchResponse, String> {
    let result_count = unsafe { (api.get_num_results)() };
    let total_results = unsafe { (api.get_tot_results)() };
    append_debug_log(
        app_handle,
        format!(
            "ipc search: extracting {} results (total={})",
            result_count, total_results
        ),
    );
    let extraction_started_at = Instant::now();
    let mut items = Vec::with_capacity(result_count as usize);
    for index in 0..result_count {
        let Some(path) = extract_path(api, index) else {
            continue;
        };
        let path_buf = PathBuf::from(&path);
        let is_folder = api
            .is_folder_result
            .map(|func| unsafe { func(index) != 0 })
            .unwrap_or(false);
        let is_file = api
            .is_file_result
            .map(|func| unsafe { func(index) != 0 })
            .unwrap_or(!is_folder);
        let name = path_buf
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        let parent = path_buf
            .parent()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default();
        items.push(SearchHit {
            icon_base64: icons::get_path_icon_base64(&path, SEARCH_RESULT_ICON_SIZE),
            highlighted_name: extract_result_text(unsafe {
                (api.get_result_highlighted_file_name_w)(index)
            }),
            highlighted_path: extract_result_text(unsafe {
                (api.get_result_highlighted_path_w)(index)
            }),
            path,
            name,
            parent,
            is_file,
            is_folder,
        });
    }
    append_debug_log(
        app_handle,
        format!(
            "ipc search: extracted {} results in {}ms",
            items.len(),
            extraction_started_at.elapsed().as_millis()
        ),
    );
    Ok(SearchResponse {
        items,
        total_results,
    })
}

pub(super) fn finish_active_request(
    api: &EverythingApi,
    app_handle: &tauri::AppHandle,
    active: &mut Option<ActiveRequest>,
    first_page_cache: &mut Option<FirstPageCache>,
    timed_out: bool,
) {
    let Some(request) = active.take() else {
        return;
    };

    let elapsed_ms = request.started_at().elapsed().as_millis();
    let reply_id = request.reply_id();
    reply_window::clear_state();
    match request {
        ActiveRequest::Probe { response, .. } => {
            if timed_out {
                append_debug_log(
                    app_handle,
                    format!(
                        "ipc probe: timed out after {}ms waiting for reply",
                        elapsed_ms
                    ),
                );
                let _ = response.send(Err(
                    "Everything query timed out while waiting for reply".to_string()
                ));
            } else {
                append_debug_log(
                    app_handle,
                    format!("ipc probe: reply received after {}ms", elapsed_ms),
                );
                let _ = response.send(Ok(()));
            }
        }
        ActiveRequest::Search {
            query,
            request_kind,
            response,
            ..
        } => {
            if timed_out {
                append_debug_log(
                    app_handle,
                    format!(
                        "ipc search: timed out after {}ms waiting for reply",
                        elapsed_ms
                    ),
                );
                let _ = response.send(Err(
                    "Everything query timed out while waiting for reply".to_string()
                ));
            } else {
                append_debug_log(
                    app_handle,
                    format!("ipc search: reply received after {}ms", elapsed_ms),
                );
                let result = extract_search_results(api, app_handle);
                if let Ok(response_payload) = result.as_ref() {
                    if request_kind == SearchRequestKind::Count && query.offset == 0 {
                        *first_page_cache = Some(FirstPageCache {
                            query,
                            response: response_payload.clone(),
                        });
                    }
                }
                let _ = response.send(result);
            }
        }
    }
    append_debug_log(app_handle, format!("ipc request {} finished", reply_id));
}

pub(super) fn cancel_active_request(
    app_handle: &tauri::AppHandle,
    active: &mut Option<ActiveRequest>,
) {
    let Some(request) = active.take() else {
        return;
    };

    reply_window::clear_state();
    append_debug_log(app_handle, "ipc request superseded by newer query");
    match request {
        ActiveRequest::Probe { response, .. } => {
            let _ = response.send(Err(
                "EverythingBusy: Previous Everything IPC request was superseded by a newer request"
                    .to_string(),
            ));
        }
        ActiveRequest::Search { response, .. } => {
            let _ = response.send(Err(
                "EverythingBusy: Previous Everything IPC request was superseded by a newer search"
                    .to_string(),
            ));
        }
    }
}

pub(super) fn teardown_worker(
    api: &EverythingApi,
    reply_hwnd: HWND,
    app_handle: &tauri::AppHandle,
    active: &mut Option<ActiveRequest>,
) {
    cancel_active_request(app_handle, active);
    reply_window::destroy(api, reply_hwnd);
}

pub(super) fn start_probe(
    api: &EverythingApi,
    reply_hwnd: HWND,
    app_handle: &tauri::AppHandle,
    response: Sender<Result<(), String>>,
) -> Result<ActiveRequest, String> {
    unsafe {
        (api.reset)();
        (api.set_search_w)(to_wide_null_terminated("").as_ptr());
        (api.set_offset)(0);
        (api.set_max)(1);
    }

    let started_at =
        reply_window::begin_query(api, reply_hwnd, REPLY_ID_PROBE, app_handle, "probe")?;
    Ok(ActiveRequest::Probe {
        reply_id: REPLY_ID_PROBE,
        started_at,
        timeout: Duration::from_secs(3),
        response,
    })
}

pub(super) fn start_search(
    api: &EverythingApi,
    reply_hwnd: HWND,
    query: SearchQuery,
    app_handle: &tauri::AppHandle,
    response: Sender<Result<SearchResponse, String>>,
) -> Result<ActiveRequest, String> {
    let request_kind = if query.offset == 0 {
        SearchRequestKind::Count
    } else {
        SearchRequestKind::Range
    };
    unsafe {
        (api.set_search_w)(to_wide_null_terminated(&query.keyword).as_ptr());
        (api.set_match_path)(query.match_path as i32);
        (api.set_match_case)(query.match_case as i32);
        (api.set_match_whole_word)((query.whole_word && !query.regex) as i32);
        (api.set_regex)(query.regex as i32);
        (api.set_request_flags)(
            EVERYTHING_REQUEST_FILE_NAME
                | EVERYTHING_REQUEST_PATH
                | EVERYTHING_REQUEST_HIGHLIGHTED_FILE_NAME
                | EVERYTHING_REQUEST_HIGHLIGHTED_PATH,
        );
        (api.set_sort)(sort_to_sdk_value(query.sort));
        (api.set_offset)(query.offset);
        (api.set_max)(query.limit.max(1));
    }

    let reply_id = request_kind.reply_id();
    let started_at =
        reply_window::begin_query(api, reply_hwnd, reply_id, app_handle, request_kind.reason())?;
    Ok(ActiveRequest::Search {
        reply_id,
        started_at,
        timeout: Duration::from_secs(30),
        query,
        request_kind,
        response,
    })
}
