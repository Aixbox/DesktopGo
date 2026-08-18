use crate::icons::models::{ICON_SOURCE_CUSTOMAPP, ICON_SOURCE_DESKTOP};

pub(super) const ICON_SNAPSHOT_VERSION: u32 = 2;
pub(super) const AUTOMATIC_TARGET_ICON_CACHE_VERSION: u32 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum IconSource {
    Library,
    Desktop,
    CustomApp,
}

impl IconSource {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Library => "library",
            Self::Desktop => ICON_SOURCE_DESKTOP,
            Self::CustomApp => ICON_SOURCE_CUSTOMAPP,
        }
    }

    pub(super) fn snapshot_file_name(self) -> &'static str {
        match self {
            Self::Library => "icon_library_snapshot.json",
            Self::Desktop => "icons_snapshot.json",
            Self::CustomApp => "customapp_icons_snapshot.json",
        }
    }

    pub(super) fn cache_folder_name(self) -> &'static str {
        self.as_str()
    }
}
