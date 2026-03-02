use std::path::Path;

use crate::icons;

use super::errors::map_ipc_error;
use super::models::{SearchHit, SearchQuery, SearchSort};

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use libloading::{Library, Symbol};
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::PathBuf;

    const EVERYTHING_SORT_NAME_ASCENDING: u32 = 1;
    const EVERYTHING_SORT_NAME_DESCENDING: u32 = 2;
    const EVERYTHING_SORT_PATH_ASCENDING: u32 = 3;
    const EVERYTHING_SORT_DATE_MODIFIED_DESCENDING: u32 = 14;
    const EVERYTHING_REQUEST_FILE_NAME: u32 = 0x0000_0001;
    const EVERYTHING_REQUEST_PATH: u32 = 0x0000_0002;

    type SetSearchW = unsafe extern "system" fn(*const u16);
    type SetBoolFlag = unsafe extern "system" fn(i32);
    type SetU32 = unsafe extern "system" fn(u32);
    type QueryW = unsafe extern "system" fn(i32) -> i32;
    type GetNumResults = unsafe extern "system" fn() -> u32;
    type GetResultFullPathNameW = unsafe extern "system" fn(u32, *mut u16, u32) -> u32;
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
        query_w: QueryW,
        get_num_results: GetNumResults,
        get_result_full_path_name_w: GetResultFullPathNameW,
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
                    query_w: load_symbol(&lib, b"Everything_QueryW\0")?,
                    get_num_results: load_symbol(&lib, b"Everything_GetNumResults\0")?,
                    get_result_full_path_name_w: load_symbol(
                        &lib,
                        b"Everything_GetResultFullPathNameW\0",
                    )?,
                    get_last_error: load_symbol(&lib, b"Everything_GetLastError\0")?,
                    reset: load_symbol(&lib, b"Everything_Reset\0")?,
                    clean_up: load_symbol(&lib, b"Everything_CleanUp\0")?,
                    _lib: lib,
                })
            }
        }
    }

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
            SearchSort::DateModifiedDesc => EVERYTHING_SORT_DATE_MODIFIED_DESCENDING,
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

    pub(super) fn probe_connection(dll_path: &Path) -> Result<(), String> {
        let api = EverythingApi::load(dll_path)?;
        unsafe {
            (api.reset)();
            (api.set_search_w)(to_wide_null_terminated("").as_ptr());
            (api.set_offset)(0);
            (api.set_max)(1);
            let ok = (api.query_w)(1);
            if ok == 0 {
                let err = (api.get_last_error)();
                (api.clean_up)();
                return Err(format!(
                    "Everything probe failed (code={}): {}",
                    err,
                    map_ipc_error(err)
                ));
            }
            (api.clean_up)();
        }
        Ok(())
    }

    pub(super) fn search(dll_path: &Path, query: &SearchQuery) -> Result<Vec<SearchHit>, String> {
        let api = EverythingApi::load(dll_path)?;
        unsafe {
            (api.reset)();
            (api.set_search_w)(to_wide_null_terminated(&query.keyword).as_ptr());
            (api.set_match_path)(query.match_path as i32);
            (api.set_match_case)(query.match_case as i32);
            (api.set_match_whole_word)(query.whole_word as i32);
            (api.set_regex)(query.regex as i32);
            (api.set_request_flags)(EVERYTHING_REQUEST_FILE_NAME | EVERYTHING_REQUEST_PATH);
            (api.set_sort)(sort_to_sdk_value(query.sort));
            (api.set_offset)(query.offset);
            (api.set_max)(query.limit.max(1));

            let ok = (api.query_w)(1);
            if ok == 0 {
                let err = (api.get_last_error)();
                (api.clean_up)();
                return Err(format!(
                    "Everything query failed (code={}): {}",
                    err,
                    map_ipc_error(err)
                ));
            }

            let result_count = (api.get_num_results)();
            let mut items = Vec::with_capacity(result_count as usize);
            for index in 0..result_count {
                let Some(path) = extract_path(&api, index) else {
                    continue;
                };
                let path_buf = PathBuf::from(&path);
                let is_folder = path_buf.is_dir();
                let name = path_buf
                    .file_name()
                    .and_then(|v| v.to_str())
                    .unwrap_or("")
                    .to_string();
                let parent = path_buf
                    .parent()
                    .map(|v| v.to_string_lossy().to_string())
                    .unwrap_or_default();
                let icon_base64 = icons::get_path_icon_base64(&path, 32);
                items.push(SearchHit {
                    path,
                    name,
                    parent,
                    is_file: !is_folder,
                    is_folder,
                    icon_base64,
                });
            }
            (api.clean_up)();
            Ok(items)
        }
    }
}

#[cfg(windows)]
pub fn probe_connection(dll_path: &Path) -> Result<(), String> {
    windows_impl::probe_connection(dll_path)
}

#[cfg(windows)]
pub fn search(dll_path: &Path, query: &SearchQuery) -> Result<Vec<SearchHit>, String> {
    windows_impl::search(dll_path, query)
}

#[cfg(not(windows))]
pub fn probe_connection(_dll_path: &Path) -> Result<(), String> {
    Err("Everything search is only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn search(_dll_path: &Path, _query: &SearchQuery) -> Result<Vec<SearchHit>, String> {
    Err("Everything search is only supported on Windows".to_string())
}
