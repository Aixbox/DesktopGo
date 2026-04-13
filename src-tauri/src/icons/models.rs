use serde::{Deserialize, Serialize};

pub(crate) const ICON_SOURCE_DESKTOP: &str = "desktop";
pub(crate) const ICON_SOURCE_CUSTOMAPP: &str = "customapp";

pub(crate) fn default_icon_source() -> String {
    ICON_SOURCE_DESKTOP.to_string()
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopIcon {
    pub id: String,
    pub name: String,
    pub path: String,
    pub target_path: String,
    pub icon_base64: String,
    pub item_type: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct IconManagerItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub target_path: String,
    pub icon_base64: String,
    pub item_type: String,
    pub source: String,
    pub hidden: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IconMutationTarget {
    pub id: String,
    #[serde(default = "default_icon_source")]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SnapshotIconPaths {
    pub(crate) small: String,
    pub(crate) medium: String,
    pub(crate) large: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SnapshotIconItem {
    pub(crate) id: String,
    pub(crate) key: String,
    #[serde(default)]
    pub(crate) display_order: u64,
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) target_path: String,
    pub(crate) item_type: String,
    #[serde(default)]
    pub(crate) hidden: bool,
    #[serde(default = "default_icon_source")]
    pub(crate) source: String,
    pub(crate) icons: SnapshotIconPaths,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct IconSnapshot {
    pub(crate) version: u32,
    pub(crate) icons: Vec<SnapshotIconItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IconSyncResult {
    pub(crate) mode: String,
    pub(crate) scanned_count: usize,
    pub(crate) added_count: usize,
    pub(crate) removed_count: usize,
    pub(crate) total_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportDroppedPathsResult {
    pub(crate) imported_count: usize,
    pub(crate) duplicate_count: usize,
    pub(crate) invalid_count: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct ScannedDesktopItem {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) target_path: String,
    pub(crate) item_type: String,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum IconBucket {
    Small,
    Medium,
    Large,
}

impl IconBucket {
    pub(crate) fn from_logical_size(icon_size: i32) -> Self {
        if icon_size <= 36 {
            Self::Small
        } else if icon_size <= 56 {
            Self::Medium
        } else {
            Self::Large
        }
    }

    pub(crate) fn folder_name(self) -> &'static str {
        match self {
            Self::Small => "small",
            Self::Medium => "medium",
            Self::Large => "large",
        }
    }

    pub(crate) fn logical_size(self) -> i32 {
        match self {
            Self::Small => 32,
            Self::Medium => 48,
            Self::Large => 72,
        }
    }
}
