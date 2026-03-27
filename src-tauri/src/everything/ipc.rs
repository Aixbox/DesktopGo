use std::path::Path;

use super::errors::map_ipc_error;
use super::models::{SearchHit, SearchQuery, SearchSort};
use super::runtime::append_debug_log;

#[derive(Debug, Clone)]
pub struct SearchResponse {
    pub items: Vec<SearchHit>,
    pub total_results: u32,
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use crate::icons;
    use libloading::{Library, Symbol};
    use once_cell::sync::{Lazy, OnceCell};
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Path, PathBuf};
    use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
    use std::sync::Mutex;
    use std::thread;
    use std::time::{Duration, Instant};
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{GetLastError, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, PeekMessageW,
        RegisterClassW, TranslateMessage, HWND_MESSAGE, MSG, PM_REMOVE, WINDOW_EX_STYLE,
        WINDOW_STYLE, WM_COPYDATA, WM_QUIT, WNDCLASSW,
    };

    const EVERYTHING_SORT_NAME_ASCENDING: u32 = 1;
    const EVERYTHING_SORT_NAME_DESCENDING: u32 = 2;
    const EVERYTHING_SORT_PATH_ASCENDING: u32 = 3;
    const EVERYTHING_SORT_PATH_DESCENDING: u32 = 4;
    const EVERYTHING_SORT_SIZE_ASCENDING: u32 = 5;
    const EVERYTHING_SORT_SIZE_DESCENDING: u32 = 6;
    const EVERYTHING_SORT_EXTENSION_ASCENDING: u32 = 7;
    const EVERYTHING_SORT_EXTENSION_DESCENDING: u32 = 8;
    const EVERYTHING_SORT_TYPE_NAME_ASCENDING: u32 = 9;
    const EVERYTHING_SORT_TYPE_NAME_DESCENDING: u32 = 10;
    const EVERYTHING_SORT_DATE_CREATED_ASCENDING: u32 = 11;
    const EVERYTHING_SORT_DATE_CREATED_DESCENDING: u32 = 12;
    const EVERYTHING_SORT_DATE_MODIFIED_ASCENDING: u32 = 13;
    const EVERYTHING_SORT_DATE_MODIFIED_DESCENDING: u32 = 14;
    const EVERYTHING_SORT_ATTRIBUTES_ASCENDING: u32 = 15;
    const EVERYTHING_SORT_ATTRIBUTES_DESCENDING: u32 = 16;
    const EVERYTHING_SORT_FILE_LIST_FILENAME_ASCENDING: u32 = 17;
    const EVERYTHING_SORT_FILE_LIST_FILENAME_DESCENDING: u32 = 18;
    const EVERYTHING_SORT_RUN_COUNT_ASCENDING: u32 = 19;
    const EVERYTHING_SORT_RUN_COUNT_DESCENDING: u32 = 20;
    const EVERYTHING_SORT_DATE_RECENTLY_CHANGED_ASCENDING: u32 = 21;
    const EVERYTHING_SORT_DATE_RECENTLY_CHANGED_DESCENDING: u32 = 22;
    const EVERYTHING_SORT_DATE_ACCESSED_ASCENDING: u32 = 23;
    const EVERYTHING_SORT_DATE_ACCESSED_DESCENDING: u32 = 24;
    const EVERYTHING_SORT_DATE_RUN_ASCENDING: u32 = 25;
    const EVERYTHING_SORT_DATE_RUN_DESCENDING: u32 = 26;
    const EVERYTHING_REQUEST_FILE_NAME: u32 = 0x0000_0001;
    const EVERYTHING_REQUEST_PATH: u32 = 0x0000_0002;
    const EVERYTHING_REQUEST_HIGHLIGHTED_FILE_NAME: u32 = 0x0000_2000;
    const EVERYTHING_REQUEST_HIGHLIGHTED_PATH: u32 = 0x0000_4000;
    const SEARCH_RESULT_ICON_SIZE: i32 = 32;
    const REPLY_WINDOW_CLASS: &str = "DesktopGoEverythingSdkReplyWindow";
    const REPLY_ID_COUNT: u32 = 1;
    const REPLY_ID_RANGE: u32 = 2;
    const REPLY_ID_PROBE: u32 = 3;

    type SetSearchW = unsafe extern "system" fn(*const u16);
    type SetBoolFlag = unsafe extern "system" fn(i32);
    type SetU32 = unsafe extern "system" fn(u32);
    type SetReplyWindow = unsafe extern "system" fn(HWND);
    type SetReplyId = unsafe extern "system" fn(u32);
    type QueryW = unsafe extern "system" fn(i32) -> i32;
    type IsQueryReply = unsafe extern "system" fn(u32, WPARAM, LPARAM, u32) -> i32;
    type GetNumResults = unsafe extern "system" fn() -> u32;
    type GetTotResults = unsafe extern "system" fn() -> u32;
    type GetResultFullPathNameW = unsafe extern "system" fn(u32, *mut u16, u32) -> u32;
    type GetResultHighlightedTextW = unsafe extern "system" fn(u32) -> *const u16;
    type IsFolderResult = unsafe extern "system" fn(u32) -> i32;
    type IsFileResult = unsafe extern "system" fn(u32) -> i32;
    type GetLastError = unsafe extern "system" fn() -> u32;
    type Reset = unsafe extern "system" fn();
    type CleanUp = unsafe extern "system" fn();

    struct EverythingApi {
        _lib: Library,
        set_search_w: SetSearchW,
        set_match_path: SetBoolFlag,
        set_match_case: SetBoolFlag,
        set_match_whole_word: SetBoolFlag,
        set_regex: SetBoolFlag,
        set_request_flags: SetU32,
        set_sort: SetU32,
        set_offset: SetU32,
        set_max: SetU32,
        set_reply_window: SetReplyWindow,
        set_reply_id: SetReplyId,
        query_w: QueryW,
        is_query_reply: IsQueryReply,
        get_num_results: GetNumResults,
        get_tot_results: GetTotResults,
        get_result_full_path_name_w: GetResultFullPathNameW,
        get_result_highlighted_file_name_w: GetResultHighlightedTextW,
        get_result_highlighted_path_w: GetResultHighlightedTextW,
        is_folder_result: Option<IsFolderResult>,
        is_file_result: Option<IsFileResult>,
        get_last_error: GetLastError,
        reset: Reset,
        clean_up: CleanUp,
    }

    impl EverythingApi {
        fn load(dll_path: &Path) -> Result<Self, String> {
            let lib = unsafe { Library::new(dll_path) }
                .map_err(|e| format!("Failed to load Everything DLL {:?}: {}", dll_path, e))?;

            unsafe {
                Ok(Self {
                    set_search_w: load_symbol(&lib, b"Everything_SetSearchW\0")?,
                    set_match_path: load_symbol(&lib, b"Everything_SetMatchPath\0")?,
                    set_match_case: load_symbol(&lib, b"Everything_SetMatchCase\0")?,
                    set_match_whole_word: load_symbol(&lib, b"Everything_SetMatchWholeWord\0")?,
                    set_regex: load_symbol(&lib, b"Everything_SetRegex\0")?,
                    set_request_flags: load_symbol(&lib, b"Everything_SetRequestFlags\0")?,
                    set_sort: load_symbol(&lib, b"Everything_SetSort\0")?,
                    set_offset: load_symbol(&lib, b"Everything_SetOffset\0")?,
                    set_max: load_symbol(&lib, b"Everything_SetMax\0")?,
                    set_reply_window: load_symbol(&lib, b"Everything_SetReplyWindow\0")?,
                    set_reply_id: load_symbol(&lib, b"Everything_SetReplyID\0")?,
                    query_w: load_symbol(&lib, b"Everything_QueryW\0")?,
                    is_query_reply: load_symbol(&lib, b"Everything_IsQueryReply\0")?,
                    get_num_results: load_symbol(&lib, b"Everything_GetNumResults\0")?,
                    get_tot_results: load_symbol(&lib, b"Everything_GetTotResults\0")?,
                    get_result_full_path_name_w: load_symbol(
                        &lib,
                        b"Everything_GetResultFullPathNameW\0",
                    )?,
                    get_result_highlighted_file_name_w: load_symbol(
                        &lib,
                        b"Everything_GetResultHighlightedFileNameW\0",
                    )?,
                    get_result_highlighted_path_w: load_symbol(
                        &lib,
                        b"Everything_GetResultHighlightedPathW\0",
                    )?,
                    is_folder_result: load_symbol_optional(&lib, b"Everything_IsFolderResult\0"),
                    is_file_result: load_symbol_optional(&lib, b"Everything_IsFileResult\0"),
                    get_last_error: load_symbol(&lib, b"Everything_GetLastError\0")?,
                    reset: load_symbol(&lib, b"Everything_Reset\0")?,
                    clean_up: load_symbol(&lib, b"Everything_CleanUp\0")?,
                    _lib: lib,
                })
            }
        }
    }

    struct ReplyState {
        is_query_reply: IsQueryReply,
        reply_id: u32,
        completed: bool,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum SearchRequestKind {
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
    struct FirstPageCache {
        query: SearchQuery,
        response: SearchResponse,
    }

    enum WorkerCommand {
        Probe {
            response: Sender<Result<(), String>>,
        },
        Search {
            query: SearchQuery,
            response: Sender<Result<SearchResponse, String>>,
        },
        Shutdown {
            response: Sender<()>,
        },
    }

    enum ActiveRequest {
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

        fn started_at(&self) -> Instant {
            match self {
                Self::Probe { started_at, .. } | Self::Search { started_at, .. } => *started_at,
            }
        }

        fn timeout(&self) -> Duration {
            match self {
                Self::Probe { timeout, .. } | Self::Search { timeout, .. } => *timeout,
            }
        }
    }

    static REPLY_WINDOW_CLASS_WIDE: Lazy<Vec<u16>> =
        Lazy::new(|| to_wide_null_terminated(REPLY_WINDOW_CLASS));
    static WINDOW_CLASS_REGISTERED: OnceCell<()> = OnceCell::new();
    static QUERY_REPLY_STATE: Lazy<Mutex<Option<ReplyState>>> = Lazy::new(|| Mutex::new(None));
    static WORKER_SENDER: Lazy<Mutex<Option<Sender<WorkerCommand>>>> =
        Lazy::new(|| Mutex::new(None));
    static WORKER_INIT_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
    unsafe fn load_symbol<T: Copy>(lib: &Library, name: &[u8]) -> Result<T, String> {
        let symbol: Symbol<T> = lib.get(name).map_err(|e| {
            format!(
                "Failed to load symbol {}: {}",
                String::from_utf8_lossy(name),
                e
            )
        })?;
        Ok(*symbol)
    }

    unsafe fn load_symbol_optional<T: Copy>(lib: &Library, name: &[u8]) -> Option<T> {
        let symbol: Result<Symbol<T>, _> = lib.get(name);
        symbol.ok().map(|value| *value)
    }

    fn to_wide_null_terminated(input: &str) -> Vec<u16> {
        OsStr::new(input)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    fn sort_to_sdk_value(sort: SearchSort) -> u32 {
        match sort {
            SearchSort::NameAsc => EVERYTHING_SORT_NAME_ASCENDING,
            SearchSort::NameDesc => EVERYTHING_SORT_NAME_DESCENDING,
            SearchSort::PathAsc => EVERYTHING_SORT_PATH_ASCENDING,
            SearchSort::PathDesc => EVERYTHING_SORT_PATH_DESCENDING,
            SearchSort::SizeAsc => EVERYTHING_SORT_SIZE_ASCENDING,
            SearchSort::SizeDesc => EVERYTHING_SORT_SIZE_DESCENDING,
            SearchSort::ExtensionAsc => EVERYTHING_SORT_EXTENSION_ASCENDING,
            SearchSort::ExtensionDesc => EVERYTHING_SORT_EXTENSION_DESCENDING,
            SearchSort::TypeNameAsc => EVERYTHING_SORT_TYPE_NAME_ASCENDING,
            SearchSort::TypeNameDesc => EVERYTHING_SORT_TYPE_NAME_DESCENDING,
            SearchSort::DateCreatedAsc => EVERYTHING_SORT_DATE_CREATED_ASCENDING,
            SearchSort::DateCreatedDesc => EVERYTHING_SORT_DATE_CREATED_DESCENDING,
            SearchSort::DateModifiedAsc => EVERYTHING_SORT_DATE_MODIFIED_ASCENDING,
            SearchSort::DateModifiedDesc => EVERYTHING_SORT_DATE_MODIFIED_DESCENDING,
            SearchSort::AttributesAsc => EVERYTHING_SORT_ATTRIBUTES_ASCENDING,
            SearchSort::AttributesDesc => EVERYTHING_SORT_ATTRIBUTES_DESCENDING,
            SearchSort::FileListFilenameAsc => EVERYTHING_SORT_FILE_LIST_FILENAME_ASCENDING,
            SearchSort::FileListFilenameDesc => EVERYTHING_SORT_FILE_LIST_FILENAME_DESCENDING,
            SearchSort::RunCountAsc => EVERYTHING_SORT_RUN_COUNT_ASCENDING,
            SearchSort::RunCountDesc => EVERYTHING_SORT_RUN_COUNT_DESCENDING,
            SearchSort::DateRecentlyChangedAsc => EVERYTHING_SORT_DATE_RECENTLY_CHANGED_ASCENDING,
            SearchSort::DateRecentlyChangedDesc => EVERYTHING_SORT_DATE_RECENTLY_CHANGED_DESCENDING,
            SearchSort::DateAccessedAsc => EVERYTHING_SORT_DATE_ACCESSED_ASCENDING,
            SearchSort::DateAccessedDesc => EVERYTHING_SORT_DATE_ACCESSED_DESCENDING,
            SearchSort::DateRunAsc => EVERYTHING_SORT_DATE_RUN_ASCENDING,
            SearchSort::DateRunDesc => EVERYTHING_SORT_DATE_RUN_DESCENDING,
        }
    }

    fn build_query_error(api: &EverythingApi, context: &str) -> String {
        let code = unsafe { (api.get_last_error)() };
        format!("{} (code={}): {}", context, code, map_ipc_error(code))
    }

    unsafe extern "system" fn reply_window_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_COPYDATA {
            if let Ok(mut guard) = QUERY_REPLY_STATE.lock() {
                if let Some(state) = guard.as_mut() {
                    if unsafe { (state.is_query_reply)(msg, wparam, lparam, state.reply_id) } != 0 {
                        state.completed = true;
                        return LRESULT(1);
                    }
                }
            }
        }

        unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
    }

    fn register_reply_window_class() -> Result<(), String> {
        WINDOW_CLASS_REGISTERED
            .get_or_try_init(|| {
                let instance = unsafe { GetModuleHandleW(None) }
                    .map_err(|e| format!("GetModuleHandleW failed: {}", e))?;
                let class = WNDCLASSW {
                    lpfnWndProc: Some(reply_window_proc),
                    hInstance: HINSTANCE(instance.0),
                    lpszClassName: PCWSTR(REPLY_WINDOW_CLASS_WIDE.as_ptr()),
                    ..Default::default()
                };

                let atom = unsafe { RegisterClassW(&class) };
                if atom == 0 {
                    let error = unsafe { GetLastError() }.0;
                    if error != 1410 {
                        return Err(format!("RegisterClassW failed with code {}", error));
                    }
                }

                Ok(())
            })
            .map(|_| ())
    }

    fn create_reply_window() -> Result<HWND, String> {
        register_reply_window_class()?;
        let instance = unsafe { GetModuleHandleW(None) }
            .map_err(|e| format!("GetModuleHandleW failed: {}", e))?;
        let hwnd = unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                PCWSTR(REPLY_WINDOW_CLASS_WIDE.as_ptr()),
                PCWSTR(REPLY_WINDOW_CLASS_WIDE.as_ptr()),
                WINDOW_STYLE::default(),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(HINSTANCE(instance.0)),
                None,
            )
        }
        .map_err(|e| format!("CreateWindowExW failed: {}", e))?;

        if hwnd.0.is_null() {
            return Err(format!(
                "CreateWindowExW failed with code {}",
                unsafe { GetLastError() }.0
            ));
        }

        Ok(hwnd)
    }

    fn clear_reply_state() {
        if let Ok(mut guard) = QUERY_REPLY_STATE.lock() {
            *guard = None;
        }
    }

    fn set_reply_state(is_query_reply: IsQueryReply, reply_id: u32) -> Result<(), String> {
        let mut guard = QUERY_REPLY_STATE
            .lock()
            .map_err(|_| "Failed to lock Everything reply state".to_string())?;
        *guard = Some(ReplyState {
            is_query_reply,
            reply_id,
            completed: false,
        });
        Ok(())
    }

    fn is_reply_completed() -> bool {
        QUERY_REPLY_STATE
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|state| state.completed))
            .unwrap_or(false)
    }

    fn begin_query(
        api: &EverythingApi,
        reply_hwnd: HWND,
        reply_id: u32,
        app_handle: &tauri::AppHandle,
        reason: &str,
    ) -> Result<Instant, String> {
        set_reply_state(api.is_query_reply, reply_id)?;

        unsafe {
            (api.set_reply_window)(reply_hwnd);
            (api.set_reply_id)(reply_id);
        }

        append_debug_log(app_handle, format!("ipc {}: query_w call start", reason));
        let query_started_at = Instant::now();
        let ok = unsafe { (api.query_w)(0) };
        append_debug_log(
            app_handle,
            format!(
                "ipc {}: query_w call returned ok={} took_ms={}",
                reason,
                ok,
                query_started_at.elapsed().as_millis()
            ),
        );
        if ok == 0 {
            clear_reply_state();
            unsafe {
                (api.set_reply_window)(HWND(std::ptr::null_mut()));
                (api.clean_up)();
            }
            return Err(build_query_error(api, "Everything query failed"));
        }

        Ok(Instant::now())
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

    fn extract_highlighted_name(api: &EverythingApi, index: u32) -> String {
        extract_result_text(unsafe { (api.get_result_highlighted_file_name_w)(index) })
    }

    fn extract_highlighted_path(api: &EverythingApi, index: u32) -> String {
        extract_result_text(unsafe { (api.get_result_highlighted_path_w)(index) })
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
            let icon_base64 = icons::get_path_icon_base64(&path, SEARCH_RESULT_ICON_SIZE);
            let highlighted_name = extract_highlighted_name(api, index);
            let highlighted_path = extract_highlighted_path(api, index);
            items.push(SearchHit {
                path,
                name,
                parent,
                is_file,
                is_folder,
                icon_base64,
                highlighted_name,
                highlighted_path,
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

    fn finish_active_request(
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
        clear_reply_state();

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
                        "Everything query timed out while waiting for reply".to_string(),
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
                        "Everything query timed out while waiting for reply".to_string(),
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

    fn cancel_active_request(
        _api: &EverythingApi,
        app_handle: &tauri::AppHandle,
        active: &mut Option<ActiveRequest>,
    ) {
        let Some(request) = active.take() else {
            return;
        };

        clear_reply_state();
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

    fn teardown_worker(
        api: &EverythingApi,
        reply_hwnd: HWND,
        app_handle: &tauri::AppHandle,
        active: &mut Option<ActiveRequest>,
    ) {
        cancel_active_request(api, app_handle, active);
        clear_reply_state();
        unsafe {
            (api.set_reply_window)(HWND(std::ptr::null_mut()));
            (api.clean_up)();
            let _ = DestroyWindow(reply_hwnd);
        }
    }

    fn start_probe(
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

        let reply_id = REPLY_ID_PROBE;
        let started_at = begin_query(api, reply_hwnd, reply_id, app_handle, "probe")?;
        Ok(ActiveRequest::Probe {
            reply_id,
            started_at,
            timeout: Duration::from_secs(3),
            response,
        })
    }

    fn start_search(
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
        let started_at = begin_query(api, reply_hwnd, reply_id, app_handle, request_kind.reason())?;
        Ok(ActiveRequest::Search {
            reply_id,
            started_at,
            timeout: Duration::from_secs(30),
            query,
            request_kind,
            response,
        })
    }

    fn worker_loop(
        api: EverythingApi,
        reply_hwnd: HWND,
        command_rx: Receiver<WorkerCommand>,
        app_handle: tauri::AppHandle,
    ) {
        let mut active: Option<ActiveRequest> = None;
        let mut first_page_cache: Option<FirstPageCache> = None;

        loop {
            let mut message = MSG::default();
            while unsafe { PeekMessageW(&mut message, None, 0, 0, PM_REMOVE) }.into() {
                if message.message == WM_QUIT {
                    teardown_worker(&api, reply_hwnd, &app_handle, &mut active);
                    return;
                }
                unsafe {
                    let _ = TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }

            while let Ok(command) = command_rx.try_recv() {
                cancel_active_request(&api, &app_handle, &mut active);
                match command {
                    WorkerCommand::Probe { response } => {
                        match start_probe(&api, reply_hwnd, &app_handle, response.clone()) {
                            Ok(request) => active = Some(request),
                            Err(error) => {
                                append_debug_log(
                                    &app_handle,
                                    format!("ipc worker failed to start probe: {}", error),
                                );
                                let _ = response.send(Err(error));
                            }
                        }
                    }
                    WorkerCommand::Search { query, response } => {
                        if query.offset == 0 {
                            if let Some(cache) = first_page_cache.as_ref() {
                                if cache.query == query {
                                    append_debug_log(
                                        &app_handle,
                                        "ipc search: reused cached first page",
                                    );
                                    let _ = response.send(Ok(cache.response.clone()));
                                    continue;
                                }
                            }
                            first_page_cache = None;
                        }

                        match start_search(&api, reply_hwnd, query, &app_handle, response.clone()) {
                            Ok(request) => active = Some(request),
                            Err(error) => {
                                append_debug_log(
                                    &app_handle,
                                    format!("ipc worker failed to start search: {}", error),
                                );
                                let _ = response.send(Err(error));
                            }
                        }
                    }
                    WorkerCommand::Shutdown { response } => {
                        append_debug_log(&app_handle, "ipc worker shutdown requested");
                        teardown_worker(&api, reply_hwnd, &app_handle, &mut active);
                        let _ = response.send(());
                        return;
                    }
                }
            }

            if is_reply_completed() {
                finish_active_request(&api, &app_handle, &mut active, &mut first_page_cache, false);
            } else if active
                .as_ref()
                .map(|request| {
                    matches!(request, ActiveRequest::Probe { .. })
                        && request.started_at().elapsed() >= request.timeout()
                })
                .unwrap_or(false)
            {
                finish_active_request(&api, &app_handle, &mut active, &mut first_page_cache, true);
            }

            thread::sleep(Duration::from_millis(10));
        }
    }

    fn ensure_worker(
        dll_path: &Path,
        app_handle: &tauri::AppHandle,
    ) -> Result<Sender<WorkerCommand>, String> {
        if let Some(sender) = WORKER_SENDER
            .lock()
            .map_err(|_| "Failed to lock Everything IPC worker sender".to_string())?
            .clone()
        {
            return Ok(sender);
        }

        let _guard = WORKER_INIT_LOCK
            .lock()
            .map_err(|_| "Failed to lock Everything IPC worker init".to_string())?;

        if let Some(sender) = WORKER_SENDER
            .lock()
            .map_err(|_| "Failed to lock Everything IPC worker sender".to_string())?
            .clone()
        {
            return Ok(sender);
        }

        let dll_path = dll_path.to_path_buf();
        let app_handle_clone = app_handle.clone();
        let (command_tx, command_rx) = mpsc::channel();
        let (init_tx, init_rx) = mpsc::channel();

        thread::spawn(move || {
            let api = match EverythingApi::load(&dll_path) {
                Ok(api) => api,
                Err(error) => {
                    let _ = init_tx.send(Err(error));
                    return;
                }
            };

            let reply_hwnd = match create_reply_window() {
                Ok(hwnd) => hwnd,
                Err(error) => {
                    let _ = init_tx.send(Err(error));
                    return;
                }
            };

            unsafe {
                (api.set_reply_window)(reply_hwnd);
            }

            append_debug_log(
                &app_handle_clone,
                format!("ipc worker ready hwnd={:?}", reply_hwnd),
            );
            let _ = init_tx.send(Ok(()));
            worker_loop(api, reply_hwnd, command_rx, app_handle_clone);
        });

        match init_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => {
                let mut guard = WORKER_SENDER
                    .lock()
                    .map_err(|_| "Failed to lock Everything IPC worker sender".to_string())?;
                *guard = Some(command_tx.clone());
                Ok(command_tx)
            }
            Ok(Err(error)) => Err(error),
            Err(RecvTimeoutError::Timeout) => {
                Err("Everything IPC worker startup timed out".to_string())
            }
            Err(RecvTimeoutError::Disconnected) => {
                Err("Everything IPC worker stopped during startup".to_string())
            }
        }
    }

    pub(super) fn probe_connection(
        dll_path: &Path,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        let sender = ensure_worker(dll_path, app_handle)?;
        let (response_tx, response_rx) = mpsc::channel();
        sender
            .send(WorkerCommand::Probe {
                response: response_tx,
            })
            .map_err(|_| "Everything IPC worker is unavailable".to_string())?;

        match response_rx.recv_timeout(Duration::from_secs(4)) {
            Ok(result) => result,
            Err(RecvTimeoutError::Timeout) => {
                Err("Everything query timed out while waiting for reply".to_string())
            }
            Err(RecvTimeoutError::Disconnected) => Err("Everything IPC worker stopped".to_string()),
        }
    }

    pub(super) fn search(
        dll_path: &Path,
        query: &SearchQuery,
        app_handle: &tauri::AppHandle,
    ) -> Result<SearchResponse, String> {
        let sender = ensure_worker(dll_path, app_handle)?;
        let (response_tx, response_rx) = mpsc::channel();
        sender
            .send(WorkerCommand::Search {
                query: query.clone(),
                response: response_tx,
            })
            .map_err(|_| "Everything IPC worker is unavailable".to_string())?;

        match response_rx.recv_timeout(Duration::from_secs(32)) {
            Ok(result) => result,
            Err(RecvTimeoutError::Timeout) => {
                Err("Everything query timed out while waiting for reply".to_string())
            }
            Err(RecvTimeoutError::Disconnected) => Err("Everything IPC worker stopped".to_string()),
        }
    }

    pub(super) fn increment_run_count(dll_path: &Path, file_name: &str) -> Result<u32, String> {
        type IncRunCountFromFileNameW = unsafe extern "system" fn(*const u16) -> u32;

        let lib = unsafe { Library::new(dll_path) }
            .map_err(|e| format!("Failed to load Everything DLL {:?}: {}", dll_path, e))?;

        let value = unsafe {
            let increment: Symbol<IncRunCountFromFileNameW> = lib
                .get(b"Everything_IncRunCountFromFileNameW\0")
                .map_err(|e| {
                    format!(
                        "Failed to load symbol {}: {}",
                        "Everything_IncRunCountFromFileNameW", e
                    )
                })?;
            let file_name_wide = to_wide_null_terminated(file_name);
            increment(file_name_wide.as_ptr())
        };

        Ok(value)
    }

    pub(super) fn shutdown_worker(app_handle: &tauri::AppHandle) {
        let sender = match WORKER_SENDER.lock() {
            Ok(mut guard) => guard.take(),
            Err(_) => None,
        };
        let Some(sender) = sender else {
            return;
        };

        append_debug_log(app_handle, "ipc worker shutdown dispatch");
        let (response_tx, response_rx) = mpsc::channel();
        if sender
            .send(WorkerCommand::Shutdown {
                response: response_tx,
            })
            .is_err()
        {
            append_debug_log(app_handle, "ipc worker already stopped before shutdown");
            return;
        }

        match response_rx.recv_timeout(Duration::from_secs(2)) {
            Ok(()) => append_debug_log(app_handle, "ipc worker shutdown complete"),
            Err(RecvTimeoutError::Timeout) => {
                append_debug_log(app_handle, "ipc worker shutdown timed out")
            }
            Err(RecvTimeoutError::Disconnected) => {
                append_debug_log(app_handle, "ipc worker stopped during shutdown")
            }
        }
    }
}

#[cfg(windows)]
pub fn probe_connection(dll_path: &Path, app_handle: &tauri::AppHandle) -> Result<(), String> {
    windows_impl::probe_connection(dll_path, app_handle)
}

#[cfg(windows)]
pub fn search(
    dll_path: &Path,
    query: &SearchQuery,
    app_handle: &tauri::AppHandle,
) -> Result<SearchResponse, String> {
    windows_impl::search(dll_path, query, app_handle)
}

#[cfg(windows)]
pub fn increment_run_count(dll_path: &Path, file_name: &str) -> Result<u32, String> {
    windows_impl::increment_run_count(dll_path, file_name)
}

#[cfg(windows)]
pub fn shutdown_worker(app_handle: &tauri::AppHandle) {
    windows_impl::shutdown_worker(app_handle)
}

#[cfg(not(windows))]
pub fn probe_connection(_dll_path: &Path, _app_handle: &tauri::AppHandle) -> Result<(), String> {
    Err("Everything search is only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn search(
    _dll_path: &Path,
    _query: &SearchQuery,
    _app_handle: &tauri::AppHandle,
) -> Result<SearchResponse, String> {
    Err("Everything search is only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn increment_run_count(_dll_path: &Path, _file_name: &str) -> Result<u32, String> {
    Err("Everything search is only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn shutdown_worker(_app_handle: &tauri::AppHandle) {}
