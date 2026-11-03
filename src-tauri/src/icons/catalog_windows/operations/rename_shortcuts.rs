use std::path::{Path, PathBuf};

use windows::core::{Interface, HSTRING};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

use crate::icons::models::IconSnapshot;

pub(super) struct ShortcutRewrite {
    path: PathBuf,
    original: Vec<u8>,
    target: String,
    working_directory: Option<String>,
}

pub(super) fn prepare_rewrites(
    original: &IconSnapshot,
    updated: &IconSnapshot,
    entry_dir: &Path,
) -> Result<Vec<ShortcutRewrite>, String> {
    original
        .icons
        .iter()
        .zip(&updated.icons)
        .filter(|(old, new)| {
            Path::new(&old.path).parent() == Some(entry_dir)
                && (old.target_path != new.target_path
                    || old.working_directory != new.working_directory)
        })
        .map(|(old, new)| {
            Ok(ShortcutRewrite {
                path: PathBuf::from(&new.path),
                original: std::fs::read(&old.path)
                    .map_err(|error| format!("无法备份图标快捷方式：{error}"))?,
                target: new.target_path.clone(),
                working_directory: (old.working_directory != new.working_directory)
                    .then(|| new.working_directory.clone()),
            })
        })
        .collect()
}

impl ShortcutRewrite {
    /// Load and edit the existing link, preserving arguments, icon and Shell flags.
    pub(super) fn apply(&self) -> Result<(), String> {
        let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok();
        let result = unsafe { self.apply_com() };
        if initialized {
            unsafe { CoUninitialize() };
        }
        result.map_err(|error| format!("无法更新快捷方式的源路径：{error}"))
    }

    unsafe fn apply_com(&self) -> windows::core::Result<()> {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        let file: IPersistFile = link.cast()?;
        let path = HSTRING::from(self.path.as_path());
        file.Load(&path, Default::default())?;
        link.SetPath(&HSTRING::from(&self.target))?;
        if let Some(directory) = &self.working_directory {
            link.SetWorkingDirectory(&HSTRING::from(directory))?;
        }
        file.Save(&path, true)
    }

    pub(super) fn restore(&self) -> Result<(), String> {
        std::fs::write(&self.path, &self.original)
            .map_err(|error| format!("恢复快捷方式失败：{error}"))
    }
}
