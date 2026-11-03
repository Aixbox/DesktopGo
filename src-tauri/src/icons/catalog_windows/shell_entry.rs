use std::path::Path;

use crate::icons::models::SnapshotIconItem;

/// Documents (including .url files) are wrapped in private .lnk entries during
/// import. Shell file operations must address the document, not that wrapper.
/// Application shortcuts keep their own entry so renaming one never renames
/// the executable or command it launches.
pub(super) fn shell_entry_path<'a>(item: &'a SnapshotIconItem, entry_dir: &Path) -> &'a str {
    if Path::new(&item.path).parent() != Some(entry_dir) {
        return &item.path;
    }
    let target = Path::new(&item.target_path);
    if !target.is_absolute() {
        return &item.path;
    }
    let extension = target
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default();
    let is_program = matches!(
        extension.to_ascii_lowercase().as_str(),
        "exe" | "com" | "bat" | "cmd" | "ps1" | "vbs" | "js" | "msc"
    );
    if is_program && item.origin != "new" && !target.is_dir() {
        &item.path
    } else {
        &item.target_path
    }
}
