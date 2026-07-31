use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::Sender;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::HWND;

use super::api::{sort_to_sdk_value, to_wide_null_terminated, EverythingApi};
use super::reply_window;
use super::snapshot::{SearchResultSnapshot, SnapshotRange, SNAPSHOT_RESULT_LIMIT};
use super::{SearchQuery, SearchResponse};
use crate::everything::debug_log::append as append_debug_log;
use crate::everything::models::SearchHit;

const EVERYTHING_REQUEST_FILE_NAME: u32 = 0x0000_0001;
const EVERYTHING_REQUEST_PATH: u32 = 0x0000_0002;
const EVERYTHING_REQUEST_RUN_COUNT: u32 = 0x0000_0400;
const EVERYTHING_REQUEST_HIGHLIGHTED_FILE_NAME: u32 = 0x0000_2000;
const EVERYTHING_REQUEST_HIGHLIGHTED_PATH: u32 = 0x0000_4000;
const MAX_FIRST_PAGE_CACHE_ITEMS: usize = 200;

/// Everything only echoes the reply id back to us, so a reply carries no other
/// evidence of which query produced it. Reusing one id per request kind made a
/// superseded query's reply indistinguishable from the current one: it would be
/// accepted into the SDK result buffer and then handed to whichever request was
/// active, so typing "v" then "vs" could answer "vs" with the results for "v".
/// Every query therefore mints a fresh id, with the request kind kept in the low
/// bits so the debug log still tells the three request shapes apart.
const REPLY_ID_KIND_BITS: u32 = 2;
const REPLY_ID_KIND_MASK: u32 = (1 << REPLY_ID_KIND_BITS) - 1;
const REPLY_ID_KIND_PROBE: u32 = 1;
const REPLY_ID_KIND_COUNT: u32 = 2;
const REPLY_ID_KIND_RANGE: u32 = 3;

/// Sequence shared by every query this process issues. It only has to outlive
/// the replies still in flight, so wrapping after 2^30 queries is harmless.
static REPLY_ID_SEQUENCE: AtomicU32 = AtomicU32::new(0);

fn build_reply_id(sequence: u32, kind_tag: u32) -> u32 {
    (sequence << REPLY_ID_KIND_BITS) | kind_tag
}

/// Kind tags start at 1, so a minted id is never 0 — the SDK's default reply id.
fn next_reply_id(kind_tag: u32) -> u32 {
    let sequence = REPLY_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    build_reply_id(sequence, kind_tag)
}

fn reply_id_kind_tag(reply_id: u32) -> u32 {
    reply_id & REPLY_ID_KIND_MASK
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SearchRequestKind {
    Count,
    Range,
}

impl SearchRequestKind {
    fn kind_tag(self) -> u32 {
        match self {
            Self::Count => REPLY_ID_KIND_COUNT,
            Self::Range => REPLY_ID_KIND_RANGE,
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

pub(super) struct SearchResultCaches<'a> {
    pub(super) first_page: &'a mut Option<FirstPageCache>,
    pub(super) snapshot: &'a mut Option<SearchResultSnapshot>,
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

fn extract_path(api: &EverythingApi, index: u32, buffer: &mut [u16]) -> Option<String> {
    let copied = unsafe {
        (api.get_result_full_path_name_w)(index, buffer.as_mut_ptr(), buffer.len() as u32)
    };
    if copied == 0 {
        return None;
    }
    let copied_len = copied.min(buffer.len() as u32) as usize;
    let end = buffer[..copied_len]
        .iter()
        .position(|ch| *ch == 0)
        .unwrap_or(copied_len);
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
    range: SnapshotRange,
) -> Result<SearchResponse, String> {
    let result_count = unsafe { (api.get_num_results)() };
    let total_results = unsafe { (api.get_tot_results)() };
    let start_index = range.local_offset.min(result_count);
    let end_index = start_index.saturating_add(range.limit).min(result_count);
    append_debug_log(
        app_handle,
        format!(
            "ipc search: extracting {} results at local offset {} (snapshot={}, total={})",
            end_index - start_index,
            start_index,
            result_count,
            total_results
        ),
    );
    let extraction_started_at = Instant::now();
    let mut items = Vec::with_capacity((end_index - start_index) as usize);
    let mut path_buffer = vec![0u16; 32_768];
    for index in start_index..end_index {
        let Some(path) = extract_path(api, index, &mut path_buffer) else {
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
            icon_base64: String::new(),
            highlighted_name: extract_result_text(unsafe {
                (api.get_result_highlighted_file_name_w)(index)
            }),
            highlighted_path: extract_result_text(unsafe {
                (api.get_result_highlighted_path_w)(index)
            }),
            run_count: api
                .get_result_run_count
                .map(|func| unsafe { func(index) })
                .unwrap_or(0),
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

pub(super) fn extract_snapshot_range(
    api: &EverythingApi,
    app_handle: &tauri::AppHandle,
    range: SnapshotRange,
) -> Result<SearchResponse, String> {
    extract_search_results(api, app_handle, range)
}

fn reply_timeout_error() -> String {
    "Everything query timed out while waiting for reply".to_string()
}

fn finish_probe_request(
    app_handle: &tauri::AppHandle,
    elapsed_ms: u128,
    timed_out: bool,
    response: &Sender<Result<(), String>>,
) {
    if timed_out {
        append_debug_log(
            app_handle,
            format!(
                "ipc probe: timed out after {}ms waiting for reply",
                elapsed_ms
            ),
        );
        let _ = response.send(Err(reply_timeout_error()));
        return;
    }

    append_debug_log(
        app_handle,
        format!("ipc probe: reply received after {}ms", elapsed_ms),
    );
    let _ = response.send(Ok(()));
}

/// The `ActiveRequest::Search` payload plus how its reply landed, kept together
/// so finishing a search stays inside the argument budget.
struct CompletedSearch {
    query: SearchQuery,
    request_kind: SearchRequestKind,
    response: Sender<Result<SearchResponse, String>>,
    elapsed_ms: u128,
    timed_out: bool,
}

fn finish_search_request(
    api: &EverythingApi,
    app_handle: &tauri::AppHandle,
    caches: &mut SearchResultCaches<'_>,
    search: CompletedSearch,
) {
    let CompletedSearch {
        query,
        request_kind,
        response,
        elapsed_ms,
        timed_out,
    } = search;

    if timed_out {
        append_debug_log(
            app_handle,
            format!(
                "ipc search: timed out after {}ms waiting for reply",
                elapsed_ms
            ),
        );
        let _ = response.send(Err(reply_timeout_error()));
        return;
    }

    append_debug_log(
        app_handle,
        format!("ipc search: reply received after {}ms", elapsed_ms),
    );
    let result_count = unsafe { (api.get_num_results)() };
    let total_results = unsafe { (api.get_tot_results)() };
    let result = extract_search_results(
        api,
        app_handle,
        SnapshotRange {
            local_offset: 0,
            limit: query.limit,
        },
    );
    if let Ok(response_payload) = result.as_ref() {
        *caches.snapshot = Some(SearchResultSnapshot::new(
            &query,
            result_count,
            total_results,
        ));
        if request_kind == SearchRequestKind::Count
            && query.offset == 0
            && response_payload.items.len() <= MAX_FIRST_PAGE_CACHE_ITEMS
        {
            *caches.first_page = Some(FirstPageCache {
                query,
                response: response_payload.clone(),
            });
        }
    }
    let _ = response.send(result);
}

pub(super) fn finish_active_request(
    api: &EverythingApi,
    app_handle: &tauri::AppHandle,
    active: &mut Option<ActiveRequest>,
    caches: &mut SearchResultCaches<'_>,
    timed_out: bool,
) {
    let Some(request) = active.take() else {
        // A completed reply with no owner would otherwise keep `is_completed()`
        // true and be consumed by whichever request starts next.
        reply_window::clear_state();
        return;
    };

    let elapsed_ms = request.started_at().elapsed().as_millis();
    let reply_id = request.reply_id();
    reply_window::clear_state();
    match request {
        ActiveRequest::Probe { response, .. } => {
            finish_probe_request(app_handle, elapsed_ms, timed_out, &response);
        }
        ActiveRequest::Search {
            query,
            request_kind,
            response,
            ..
        } => finish_search_request(
            api,
            app_handle,
            caches,
            CompletedSearch {
                query,
                request_kind,
                response,
                elapsed_ms,
                timed_out,
            },
        ),
    }
    append_debug_log(
        app_handle,
        format!(
            "ipc request {} (kind_tag={}) finished",
            reply_id,
            reply_id_kind_tag(reply_id)
        ),
    );
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

    let reply_id = next_reply_id(REPLY_ID_KIND_PROBE);
    let started_at = reply_window::begin_query(api, reply_hwnd, reply_id, app_handle, "probe")?;
    Ok(ActiveRequest::Probe {
        reply_id,
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
                | EVERYTHING_REQUEST_RUN_COUNT
                | EVERYTHING_REQUEST_HIGHLIGHTED_FILE_NAME
                | EVERYTHING_REQUEST_HIGHLIGHTED_PATH,
        );
        (api.set_sort)(sort_to_sdk_value(query.sort));
        (api.set_offset)(query.offset);
        (api.set_max)(query.limit.max(SNAPSHOT_RESULT_LIMIT));
    }

    let reply_id = next_reply_id(request_kind.kind_tag());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_query_mints_a_distinct_reply_id() {
        let first = next_reply_id(SearchRequestKind::Count.kind_tag());
        let superseding = next_reply_id(SearchRequestKind::Count.kind_tag());
        let paging = next_reply_id(SearchRequestKind::Range.kind_tag());
        let probe = next_reply_id(REPLY_ID_KIND_PROBE);

        assert_ne!(
            first, superseding,
            "a superseded query must not share the reply id of the query replacing it"
        );
        assert_ne!(superseding, paging);
        assert_ne!(paging, probe);
    }

    #[test]
    fn reply_ids_keep_the_request_kind_and_never_use_the_sdk_default() {
        let cases = [
            (REPLY_ID_KIND_PROBE, "probe"),
            (REPLY_ID_KIND_COUNT, "count"),
            (REPLY_ID_KIND_RANGE, "range"),
        ];

        for (kind_tag, label) in cases {
            let reply_id = next_reply_id(kind_tag);
            assert_eq!(reply_id_kind_tag(reply_id), kind_tag, "kind: {label}");
            assert_ne!(reply_id, 0, "reply id 0 is the SDK default: {label}");
        }
    }

    #[test]
    fn the_first_sequence_value_still_produces_a_usable_reply_id() {
        assert_eq!(
            reply_id_kind_tag(build_reply_id(0, REPLY_ID_KIND_COUNT)),
            REPLY_ID_KIND_COUNT
        );
        assert_ne!(build_reply_id(0, REPLY_ID_KIND_PROBE), 0);
        assert_ne!(
            build_reply_id(0, REPLY_ID_KIND_COUNT),
            build_reply_id(1, REPLY_ID_KIND_COUNT)
        );
    }

    #[test]
    fn request_kinds_map_to_distinct_tags() {
        assert_ne!(
            SearchRequestKind::Count.kind_tag(),
            SearchRequestKind::Range.kind_tag()
        );
        assert_ne!(SearchRequestKind::Count.kind_tag(), REPLY_ID_KIND_PROBE);
        assert_ne!(SearchRequestKind::Range.kind_tag(), REPLY_ID_KIND_PROBE);
    }
}
