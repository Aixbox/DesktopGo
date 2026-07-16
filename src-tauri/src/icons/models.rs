use serde::{Deserialize, Serialize};

pub(crate) const ICON_SOURCE_DESKTOP: &str = "desktop";
pub(crate) const ICON_SOURCE_CUSTOMAPP: &str = "customapp";

#[derive(Debug, Clone, Serialize)]
pub struct DesktopIcon {
    pub id: String,
    pub name: String,
    pub path: String,
    pub target_path: String,
    pub launch_arguments: String,
    pub working_directory: String,
    pub custom_icon_path: String,
    pub icon_base64: String,
    pub icon_source: String,
    pub icon_color: String,
    pub icon_text: String,
    pub item_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct IconManagerItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub target_path: String,
    pub launch_arguments: String,
    pub working_directory: String,
    pub custom_icon_path: String,
    pub icon_base64: String,
    pub icon_source: String,
    pub icon_color: String,
    pub icon_text: String,
    pub item_type: String,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct InvalidIconEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub target_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IconMutationTarget {
    pub id: String,
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
    #[serde(default)]
    pub(crate) launch_arguments: String,
    #[serde(default)]
    pub(crate) working_directory: String,
    #[serde(default)]
    pub(crate) custom_icon_path: String,
    #[serde(default)]
    pub(crate) icon_source: String,
    #[serde(default)]
    pub(crate) icon_color: String,
    #[serde(default)]
    pub(crate) icon_text: String,
    pub(crate) item_type: String,
    #[serde(default)]
    pub(crate) hidden: bool,
    pub(crate) icons: SnapshotIconPaths,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct IconSnapshot {
    pub(crate) version: u32,
    pub(crate) icons: Vec<SnapshotIconItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateIconEntryInput {
    pub display_name: String,
    pub target_path: String,
    #[serde(default)]
    pub launch_arguments: String,
    #[serde(default)]
    pub working_directory: String,
    #[serde(default)]
    pub custom_icon_path: String,
    #[serde(default)]
    pub website_icon_base64: String,
    #[serde(default)]
    pub generated_icon_base64: String,
    #[serde(default)]
    pub icon_source: String,
    #[serde(default)]
    pub icon_color: String,
    #[serde(default)]
    pub icon_text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateIconEntryInput {
    pub id: String,
    pub display_name: String,
    pub target_path: String,
    #[serde(default)]
    pub launch_arguments: String,
    #[serde(default)]
    pub working_directory: String,
    #[serde(default)]
    pub custom_icon_path: String,
    #[serde(default)]
    pub website_icon_base64: String,
    #[serde(default)]
    pub generated_icon_base64: String,
    #[serde(default)]
    pub icon_source: String,
    #[serde(default)]
    pub icon_color: String,
    #[serde(default)]
    pub icon_text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WebsiteIconResult {
    pub url: String,
    pub title: String,
    pub icon_base64: String,
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
