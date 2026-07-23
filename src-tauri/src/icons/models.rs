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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct LegacySnapshotIconPaths {
    #[serde(default)]
    pub(crate) master: String,
    #[serde(default)]
    pub(crate) small: String,
    #[serde(default)]
    pub(crate) medium: String,
    #[serde(default)]
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
    #[serde(default)]
    pub(crate) icon: String,
    #[serde(default, rename = "icons", skip_serializing_if = "Option::is_none")]
    pub(crate) legacy_icons: Option<LegacySnapshotIconPaths>,
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
    pub icons: Vec<String>,
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

#[cfg(test)]
mod tests {
    use super::LegacySnapshotIconPaths;

    #[test]
    fn legacy_icon_paths_default_to_no_master() {
        let paths: LegacySnapshotIconPaths = serde_json::from_str(
            r#"{"small":"small.png","medium":"medium.png","large":"large.png"}"#,
        )
        .expect("legacy icon paths should deserialize");

        assert!(paths.master.is_empty());
    }
}
