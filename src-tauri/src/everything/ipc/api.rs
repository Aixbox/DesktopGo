use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use libloading::{Library, Symbol};
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};

use super::RuntimeProbeStatus;
use crate::everything::debug_log::append as append_debug_log;
use crate::everything::errors::map_ipc_error;
use crate::everything::models::SearchSort;

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

pub(super) type SetSearchW = unsafe extern "system" fn(*const u16);
pub(super) type SetBoolFlag = unsafe extern "system" fn(i32);
pub(super) type SetU32 = unsafe extern "system" fn(u32);
pub(super) type SetReplyWindow = unsafe extern "system" fn(HWND);
pub(super) type SetReplyId = unsafe extern "system" fn(u32);
pub(super) type QueryW = unsafe extern "system" fn(i32) -> i32;
pub(super) type IsQueryReply = unsafe extern "system" fn(u32, WPARAM, LPARAM, u32) -> i32;
pub(super) type GetNumResults = unsafe extern "system" fn() -> u32;
pub(super) type GetTotResults = unsafe extern "system" fn() -> u32;
pub(super) type GetResultFullPathNameW = unsafe extern "system" fn(u32, *mut u16, u32) -> u32;
pub(super) type GetResultHighlightedTextW = unsafe extern "system" fn(u32) -> *const u16;
pub(super) type IsFolderResult = unsafe extern "system" fn(u32) -> i32;
pub(super) type IsFileResult = unsafe extern "system" fn(u32) -> i32;
pub(super) type GetVersion = unsafe extern "system" fn() -> u32;
pub(super) type GetBoolStatus = unsafe extern "system" fn() -> i32;
pub(super) type GetLastError = unsafe extern "system" fn() -> u32;
pub(super) type Reset = unsafe extern "system" fn();
pub(super) type CleanUp = unsafe extern "system" fn();

pub(super) struct EverythingApi {
    _lib: Library,
    pub(super) set_search_w: SetSearchW,
    pub(super) set_match_path: SetBoolFlag,
    pub(super) set_match_case: SetBoolFlag,
    pub(super) set_match_whole_word: SetBoolFlag,
    pub(super) set_regex: SetBoolFlag,
    pub(super) set_request_flags: SetU32,
    pub(super) set_sort: SetU32,
    pub(super) set_offset: SetU32,
    pub(super) set_max: SetU32,
    pub(super) set_reply_window: SetReplyWindow,
    pub(super) set_reply_id: SetReplyId,
    pub(super) query_w: QueryW,
    pub(super) is_query_reply: IsQueryReply,
    pub(super) get_num_results: GetNumResults,
    pub(super) get_tot_results: GetTotResults,
    pub(super) get_result_full_path_name_w: GetResultFullPathNameW,
    pub(super) get_result_highlighted_file_name_w: GetResultHighlightedTextW,
    pub(super) get_result_highlighted_path_w: GetResultHighlightedTextW,
    pub(super) is_folder_result: Option<IsFolderResult>,
    pub(super) is_file_result: Option<IsFileResult>,
    pub(super) get_major_version: GetVersion,
    pub(super) is_db_loaded: GetBoolStatus,
    pub(super) get_last_error: GetLastError,
    pub(super) reset: Reset,
    pub(super) clean_up: CleanUp,
}

impl EverythingApi {
    pub(super) fn load(dll_path: &Path) -> Result<Self, String> {
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
                get_major_version: load_symbol(&lib, b"Everything_GetMajorVersion\0")?,
                is_db_loaded: load_symbol(&lib, b"Everything_IsDBLoaded\0")?,
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

unsafe fn load_symbol_optional<T: Copy>(lib: &Library, name: &[u8]) -> Option<T> {
    let symbol: Result<Symbol<T>, _> = lib.get(name);
    symbol.ok().map(|value| *value)
}

pub(super) fn to_wide_null_terminated(input: &str) -> Vec<u16> {
    OsStr::new(input)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

pub(super) fn sort_to_sdk_value(sort: SearchSort) -> u32 {
    match sort {
        SearchSort::NameAsc | SearchSort::Relevance => EVERYTHING_SORT_NAME_ASCENDING,
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

pub(super) fn build_query_error(api: &EverythingApi, context: &str) -> String {
    let code = unsafe { (api.get_last_error)() };
    format!("{} (code={}): {}", context, code, map_ipc_error(code))
}

pub(super) fn inspect_runtime(
    dll_path: &Path,
    app_handle: &tauri::AppHandle,
) -> Result<RuntimeProbeStatus, String> {
    let api = EverythingApi::load(dll_path)?;

    let major_version = unsafe { (api.get_major_version)() };
    let major_version_error = unsafe { (api.get_last_error)() };
    append_debug_log(
        app_handle,
        format!(
            "ipc inspect: major_version={} error_code={}",
            major_version, major_version_error
        ),
    );

    if major_version == 0 {
        if major_version_error == 0 || major_version_error == 2 {
            return Ok(RuntimeProbeStatus {
                reachable: false,
                database_loaded: false,
            });
        }
        return Err(format!(
            "Everything status query failed (code={}): {}",
            major_version_error,
            map_ipc_error(major_version_error)
        ));
    }

    let database_loaded = unsafe { (api.is_db_loaded)() != 0 };
    let database_loaded_error = unsafe { (api.get_last_error)() };
    append_debug_log(
        app_handle,
        format!(
            "ipc inspect: database_loaded={} error_code={}",
            database_loaded, database_loaded_error
        ),
    );

    if !database_loaded && database_loaded_error != 0 {
        if database_loaded_error == 2 {
            return Ok(RuntimeProbeStatus {
                reachable: false,
                database_loaded: false,
            });
        }
        return Err(format!(
            "Everything database status query failed (code={}): {}",
            database_loaded_error,
            map_ipc_error(database_loaded_error)
        ));
    }

    Ok(RuntimeProbeStatus {
        reachable: true,
        database_loaded,
    })
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
                    "Failed to load symbol Everything_IncRunCountFromFileNameW: {}",
                    e
                )
            })?;
        let file_name_wide = to_wide_null_terminated(file_name);
        increment(file_name_wide.as_ptr())
    };
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sort_mapping_matches_everything_sdk_contract() {
        let cases = [
            (SearchSort::Relevance, 1),
            (SearchSort::NameAsc, 1),
            (SearchSort::NameDesc, 2),
            (SearchSort::PathAsc, 3),
            (SearchSort::PathDesc, 4),
            (SearchSort::SizeAsc, 5),
            (SearchSort::SizeDesc, 6),
            (SearchSort::ExtensionAsc, 7),
            (SearchSort::ExtensionDesc, 8),
            (SearchSort::TypeNameAsc, 9),
            (SearchSort::TypeNameDesc, 10),
            (SearchSort::DateCreatedAsc, 11),
            (SearchSort::DateCreatedDesc, 12),
            (SearchSort::DateModifiedAsc, 13),
            (SearchSort::DateModifiedDesc, 14),
            (SearchSort::AttributesAsc, 15),
            (SearchSort::AttributesDesc, 16),
            (SearchSort::FileListFilenameAsc, 17),
            (SearchSort::FileListFilenameDesc, 18),
            (SearchSort::RunCountAsc, 19),
            (SearchSort::RunCountDesc, 20),
            (SearchSort::DateRecentlyChangedAsc, 21),
            (SearchSort::DateRecentlyChangedDesc, 22),
            (SearchSort::DateAccessedAsc, 23),
            (SearchSort::DateAccessedDesc, 24),
            (SearchSort::DateRunAsc, 25),
            (SearchSort::DateRunDesc, 26),
        ];

        for (sort, expected) in cases {
            assert_eq!(sort_to_sdk_value(sort), expected, "sort: {sort:?}");
        }
    }
}
