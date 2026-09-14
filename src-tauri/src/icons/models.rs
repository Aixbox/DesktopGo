use serde::{Deserialize, Serialize};

pub(crate) const ICON_SOURCE_DESKTOP: &str = "desktop";
pub(crate) const ICON_SOURCE_CUSTOMAPP: &str = "customapp";

/// 图标来源标记的默认值：历史条目一律视为导入。
pub(crate) fn default_icon_origin() -> String {
    "import".to_string()
}

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
    pub origin: String,
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
    pub origin: String,
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
    #[serde(default = "default_icon_origin")]
    pub(crate) origin: String,
    #[serde(default)]
    pub(crate) hidden: bool,
    #[serde(default)]
    pub(crate) icon: String,
    #[serde(default)]
    pub(crate) automatic_target_icon_cache: bool,
    #[serde(default)]
    pub(crate) automatic_target_icon_cache_version: u32,
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
    /// 图标来源标记：new = 应用内"新建"创建；import = 导入（默认）。
    #[serde(default)]
    pub origin: String,
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
    pub origin: String,
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

/// 「快捷导入」扫描到的单个已安装应用。
///
/// `source_path` 是导入时传给 `create_icon_entry` 的入口路径：lnk/url 用快捷方式
/// 文件本身（导入时按现有逻辑复制入口），exe 用可执行文件路径（导入时创建指向它的
/// 托管快捷方式）。`target_path` 只用于展示。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedInstalledApp {
    pub source_path: String,
    pub display_name: String,
    pub target_path: String,
    pub item_type: String,
    /// 扫描来源的人类可读标签（开始菜单、桌面、注册表……）。
    pub source_label: String,
    /// new / possible_duplicate / exact_duplicate。
    pub status: String,
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
    use super::{LegacySnapshotIconPaths, SnapshotIconItem};

    #[test]
    fn legacy_icon_paths_default_to_no_master() {
        let paths: LegacySnapshotIconPaths = serde_json::from_str(
            r#"{"small":"small.png","medium":"medium.png","large":"large.png"}"#,
        )
        .expect("legacy icon paths should deserialize");

        assert!(paths.master.is_empty());
    }

    #[test]
    fn legacy_snapshot_items_do_not_opt_into_automatic_cache_refresh() {
        let item: SnapshotIconItem = serde_json::from_str(
            r#"{
                "id":"legacy-id",
                "key":"legacy-key",
                "name":"Legacy",
                "path":"C:\\Legacy\\legacy.lnk",
                "target_path":"C:\\Legacy\\legacy.exe",
                "item_type":"shortcut",
                "icon":"icons/library/legacy-id.img"
            }"#,
        )
        .expect("legacy snapshots should deserialize");

        assert!(!item.automatic_target_icon_cache);
        assert_eq!(item.automatic_target_icon_cache_version, 0);
    }
}
