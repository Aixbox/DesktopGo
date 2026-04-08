use serde::{Deserialize, Serialize};

fn default_limit() -> u32 {
    50
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SearchSort {
    NameAsc,
    NameDesc,
    PathAsc,
    PathDesc,
    SizeAsc,
    SizeDesc,
    ExtensionAsc,
    ExtensionDesc,
    TypeNameAsc,
    TypeNameDesc,
    DateCreatedAsc,
    DateCreatedDesc,
    DateModifiedAsc,
    DateModifiedDesc,
    AttributesAsc,
    AttributesDesc,
    FileListFilenameAsc,
    FileListFilenameDesc,
    RunCountAsc,
    RunCountDesc,
    DateRecentlyChangedAsc,
    DateRecentlyChangedDesc,
    DateAccessedAsc,
    DateAccessedDesc,
    DateRunAsc,
    DateRunDesc,
}

impl Default for SearchSort {
    fn default() -> Self {
        Self::NameAsc
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub keyword: String,
    #[serde(default)]
    pub offset: u32,
    #[serde(default = "default_limit")]
    pub limit: u32,
    #[serde(default)]
    pub match_path: bool,
    #[serde(default)]
    pub match_case: bool,
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub sort: SearchSort,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SearchProvider {
    Installed,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SearchRuntimeState {
    Unknown,
    InstalledReady,
    Initializing,
    NotInstalled,
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub name: String,
    pub parent: String,
    pub is_file: bool,
    pub is_folder: bool,
    pub icon_base64: String,
    pub highlighted_name: String,
    pub highlighted_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub items: Vec<SearchHit>,
    pub offset: u32,
    pub limit: u32,
    pub total_results: u32,
    pub has_more: bool,
    pub provider: SearchProvider,
    pub runtime_state: SearchRuntimeState,
    pub took_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRuntimeStatus {
    pub state: SearchRuntimeState,
    pub provider: Option<SearchProvider>,
    pub message: Option<String>,
}

impl SearchRuntimeStatus {
    pub fn new(
        state: SearchRuntimeState,
        provider: Option<SearchProvider>,
        message: Option<String>,
    ) -> Self {
        Self {
            state,
            provider,
            message,
        }
    }
}
