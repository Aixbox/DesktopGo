use std::fs;
use std::path::{Path, PathBuf};

use super::{rename_entry as rename_transaction, renamed_path};
use crate::icons::models::{IconRenameResult, IconSnapshot, SnapshotIconItem};
use crate::icons::platform_windows::{create_shortcut_windows, resolve_lnk};

fn assert_shortcut_target(shortcut: &str, expected: &str) {
    let actual = resolve_lnk(Path::new(shortcut)).expect("shortcut target must resolve");
    // Shell expands 8.3 aliases (e.g. RUNNER~1), while TEMP may retain them.
    // Compare the existing files, not the spelling returned by the two APIs.
    assert_eq!(
        fs::canonicalize(&actual).expect("resolved shortcut target must exist"),
        fs::canonicalize(expected).expect("expected shortcut target must exist"),
        "shortcut target must resolve to the expected file: {actual:?} != {expected:?}"
    );
}

fn rename_entry(
    snapshot: &IconSnapshot,
    id: &str,
    name: &str,
    persist: impl FnOnce(&IconSnapshot) -> Result<(), String>,
) -> Result<IconRenameResult, String> {
    let entry_dir = PathBuf::from(&snapshot.icons[0].path)
        .parent()
        .unwrap()
        .join("icon-library-entries");
    rename_transaction(snapshot, id, name, &entry_dir, persist).map(|mut items| items.remove(0))
}

struct Fixture {
    directory: PathBuf,
    snapshot: IconSnapshot,
}

impl Fixture {
    fn new(file_name: &str, shortcut: bool) -> Self {
        let directory =
            std::env::temp_dir().join(format!("desktopgo-rename-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let path = directory.join(file_name);
        fs::write(&path, b"source-content").unwrap();
        let path = path.to_string_lossy().into_owned();
        let item: SnapshotIconItem = serde_json::from_value(serde_json::json!({
            "id": "stable-id", "key": "old-key", "display_order": 42,
            "name": "library alias", "path": path,
            "target_path": if shortcut { r"C:\Apps\Target.exe" } else { &path },
            "item_type": if shortcut { "shortcut" } else { "file" },
            "icon": "cached.png", "icon_source": "custom", "origin": "new",
            "launch_arguments": "--keep", "hidden": true
        }))
        .unwrap();
        Self {
            directory,
            snapshot: IconSnapshot {
                version: 1,
                icons: vec![item],
            },
        }
    }

    fn wrapped_url() -> Self {
        let mut fixture = Self::new("原始网址.url", false);
        let source = fixture.snapshot.icons[0].path.clone();
        fs::write(&source, b"[InternetShortcut]\r\nURL=https://example.com/path?q=1\r\nIconFile=C:\\icons\\custom.ico\r\nIconIndex=7\r\n").unwrap();
        let entry_dir = fixture.directory.join("icon-library-entries");
        fs::create_dir(&entry_dir).unwrap();
        let wrapper = entry_dir.join("Private.lnk");
        create_shortcut_windows(&wrapper, &source, "--keep", "").unwrap();
        let item = &mut fixture.snapshot.icons[0];
        item.path = wrapper.to_string_lossy().into_owned();
        item.item_type = "shortcut".to_string();
        item.origin = "import".to_string();
        fixture
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.directory).unwrap();
    }
}

#[test]
fn renames_the_shortcut_file_and_persists_without_changing_its_target_or_identity() {
    let fixture = Fixture::new("Original.lnk", true);
    let original = &fixture.snapshot.icons[0];
    let result = rename_entry(&fixture.snapshot, &original.id, "中文名称", |updated| {
        let item = &updated.icons[0];
        assert_eq!(item.id, original.id);
        assert_eq!(item.display_order, original.display_order);
        assert_eq!(item.icon, original.icon);
        assert_eq!(item.icon_source, original.icon_source);
        assert_eq!(item.launch_arguments, original.launch_arguments);
        assert_eq!(item.hidden, original.hidden);
        assert_eq!(item.origin, original.origin);
        assert_eq!(item.target_path, original.target_path);
        assert!(item.key.contains("中文名称.lnk"));
        // Also exercise the persisted representation read on the next launch.
        let json = serde_json::to_string(updated).unwrap();
        let reloaded: IconSnapshot = serde_json::from_str(&json).unwrap();
        assert!(PathBuf::from(&reloaded.icons[0].path).exists());
        assert_eq!(reloaded.icons[0].name, "中文名称");
        Ok(())
    })
    .unwrap();
    assert!(!PathBuf::from(&original.path).exists());
    assert_eq!(fs::read(&result.path).unwrap(), b"source-content");
    assert_eq!(result.old_path, original.path);
    assert_eq!(result.name, "中文名称");
    assert!(result.path.ends_with("中文名称.lnk"));
}

#[test]
fn direct_file_updates_launch_path_and_preserves_extension() {
    let fixture = Fixture::new("old.txt", false);
    let result = rename_entry(&fixture.snapshot, "stable-id", "new", |_| Ok(())).unwrap();
    assert_eq!(result.target_path, result.path);
    assert!(result.path.ends_with("new.txt"));
    assert_eq!(fs::read(&result.path).unwrap(), b"source-content");
}

#[test]
fn existing_destination_is_never_overwritten() {
    let fixture = Fixture::new("old.lnk", true);
    let destination = fixture.directory.join("existing.lnk");
    fs::write(&destination, b"unrelated-content").unwrap();
    assert!(
        rename_entry(&fixture.snapshot, "stable-id", "existing", |_| {
            panic!("must not persist a failed move")
        })
        .is_err()
    );
    assert_eq!(fs::read(destination).unwrap(), b"unrelated-content");
    assert_eq!(
        fs::read(&fixture.snapshot.icons[0].path).unwrap(),
        b"source-content"
    );
}

#[test]
fn persistence_failure_restores_the_original_file() {
    let fixture = Fixture::new("old.url", true);
    let error = rename_entry(&fixture.snapshot, "stable-id", "new", |_| {
        Err("snapshot failure".to_string())
    })
    .unwrap_err();
    assert!(error.contains("snapshot failure"));
    assert!(!fixture.directory.join("new.url").exists());
    assert_eq!(
        fs::read(&fixture.snapshot.icons[0].path).unwrap(),
        b"source-content"
    );
}

#[test]
fn supports_case_only_rename() {
    let fixture = Fixture::new("old.lnk", true);
    let result = rename_entry(&fixture.snapshot, "stable-id", "OLD", |_| Ok(())).unwrap();
    assert!(result.path.ends_with("OLD.lnk"));
    let names = fs::read_dir(&fixture.directory)
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect::<Vec<_>>();
    assert_eq!(names, vec![std::ffi::OsString::from("OLD.lnk")]);
}

#[test]
fn invalid_or_missing_entries_do_not_persist() {
    let fixture = Fixture::new("old.lnk", true);
    assert!(rename_entry(&fixture.snapshot, "missing-id", "new", |_| panic!()).is_err());
    fs::remove_file(&fixture.snapshot.icons[0].path).unwrap();
    assert!(rename_entry(&fixture.snapshot, "stable-id", "new", |_| panic!()).is_err());
}

#[test]
fn names_are_validated_as_a_single_windows_file_component() {
    let source = PathBuf::from(r"C:\icons\old.lnk");
    for invalid in [
        "",
        " ",
        ".",
        "..",
        "../outside",
        r"..\outside",
        "a:b",
        "a?b",
        "a*b",
        "a|b",
        "a\0b",
        "a\nb",
        "CON",
        "CON.txt",
        "NUL",
        "COM1",
        "LPT²",
        "tail.",
    ] {
        assert!(
            renamed_path(&source, invalid, false).is_err(),
            "{invalid:?}"
        );
    }
    assert!(renamed_path(&source, &"a".repeat(253), false).is_err());
    assert_eq!(
        renamed_path(&source, "New.lnk", false).unwrap(),
        PathBuf::from(r"C:\icons\New.lnk")
    );
    assert_eq!(
        renamed_path(&source, "版本 1.2", false).unwrap(),
        PathBuf::from(r"C:\icons\版本 1.2.lnk")
    );
    assert_eq!(
        renamed_path(&source, "New.data", true).unwrap(),
        PathBuf::from(r"C:\icons\New.data")
    );
}

#[test]
fn directory_rename_keeps_the_entire_name_including_dots() {
    let mut fixture = Fixture::new("old", false);
    let source = PathBuf::from(&fixture.snapshot.icons[0].path);
    fs::remove_file(&source).unwrap();
    fs::create_dir(&source).unwrap();
    fs::write(source.join("child.txt"), b"child").unwrap();
    fixture.snapshot.icons[0].item_type = "folder".to_string();
    let result = rename_entry(&fixture.snapshot, "stable-id", "new.folder", |_| Ok(())).unwrap();
    assert_eq!(result.name, "new.folder");
    assert_eq!(
        fs::read(PathBuf::from(result.path).join("child.txt")).unwrap(),
        b"child"
    );
}

#[test]
fn wrapped_url_renames_the_actual_source_and_retargets_the_launch_shortcut() {
    let fixture = Fixture::wrapped_url();
    let original = &fixture.snapshot.icons[0];
    let source_bytes = fs::read(&original.target_path).unwrap();
    let entry_dir = fixture.directory.join("icon-library-entries");
    let snapshot_path = fixture.directory.join("snapshot.json");
    let results = rename_transaction(
        &fixture.snapshot,
        &original.id,
        "修改后的网址",
        &entry_dir,
        |updated| {
            fs::write(&snapshot_path, serde_json::to_vec(updated).unwrap())
                .map_err(|e| e.to_string())
        },
    )
    .unwrap();
    let result = &results[0];
    assert!(!PathBuf::from(&original.target_path).exists());
    assert!(result.target_path.ends_with("修改后的网址.url"));
    assert_eq!(fs::read(&result.target_path).unwrap(), source_bytes);
    assert_eq!(result.shell_path, result.target_path);
    assert_eq!(result.path, original.path);
    assert_shortcut_target(&result.path, &result.target_path);
    let reloaded: IconSnapshot = serde_json::from_slice(&fs::read(snapshot_path).unwrap()).unwrap();
    assert_eq!(reloaded.icons[0].target_path, result.target_path);
    assert_eq!(reloaded.icons[0].id, original.id);
    assert_eq!(reloaded.icons[0].launch_arguments, "--keep");
    assert_eq!(reloaded.icons[0].icon, original.icon);
}

#[test]
fn wrapped_url_persistence_failure_restores_source_and_exact_shortcut_bytes() {
    let fixture = Fixture::wrapped_url();
    let original = &fixture.snapshot.icons[0];
    let wrapper_bytes = fs::read(&original.path).unwrap();
    let source_bytes = fs::read(&original.target_path).unwrap();
    let error = rename_transaction(
        &fixture.snapshot,
        &original.id,
        "new",
        &fixture.directory.join("icon-library-entries"),
        |_| Err("snapshot failure".to_string()),
    )
    .unwrap_err();
    assert!(error.contains("snapshot failure"));
    assert_eq!(fs::read(&original.path).unwrap(), wrapper_bytes);
    assert_eq!(fs::read(&original.target_path).unwrap(), source_bytes);
    assert_shortcut_target(&original.path, &original.target_path);
    assert!(!fixture.directory.join("new.url").exists());
}

#[test]
fn wrapped_url_conflict_and_missing_source_never_fall_back_to_renaming_the_wrapper() {
    let fixture = Fixture::wrapped_url();
    let original = &fixture.snapshot.icons[0];
    let wrapper_bytes = fs::read(&original.path).unwrap();
    let entry_dir = fixture.directory.join("icon-library-entries");
    let destination = fixture.directory.join("new.url");
    fs::write(&destination, b"unrelated-url").unwrap();
    assert!(rename_transaction(
        &fixture.snapshot,
        &original.id,
        "new",
        &entry_dir,
        |_| panic!()
    )
    .is_err());
    assert_eq!(fs::read(&destination).unwrap(), b"unrelated-url");
    fs::remove_file(&original.target_path).unwrap();
    assert!(rename_transaction(
        &fixture.snapshot,
        &original.id,
        "other",
        &entry_dir,
        |_| panic!()
    )
    .is_err());
    assert_eq!(fs::read(&original.path).unwrap(), wrapper_bytes);
}

#[test]
fn corrupt_wrapper_causes_source_rename_to_roll_back() {
    let fixture = Fixture::wrapped_url();
    let original = &fixture.snapshot.icons[0];
    fs::write(&original.path, b"broken-link").unwrap();
    let error = rename_transaction(
        &fixture.snapshot,
        &original.id,
        "new",
        &fixture.directory.join("icon-library-entries"),
        |_| panic!(),
    )
    .unwrap_err();
    assert!(error.contains("快捷方式"));
    assert!(PathBuf::from(&original.target_path).exists());
    assert_eq!(fs::read(&original.path).unwrap(), b"broken-link");
    assert!(!fixture.directory.join("new.url").exists());
}

#[test]
fn every_library_entry_pointing_at_the_renamed_url_gets_its_target_updated() {
    let mut fixture = Fixture::wrapped_url();
    let entry_dir = fixture.directory.join("icon-library-entries");
    let mut second = fixture.snapshot.icons[0].clone();
    second.id = "other-link".to_string();
    second.path = entry_dir.join("Second.lnk").to_string_lossy().into_owned();
    create_shortcut_windows(
        std::path::Path::new(&second.path),
        &second.target_path,
        "--different",
        "",
    )
    .unwrap();
    fixture.snapshot.icons.push(second);
    let results = rename_transaction(
        &fixture.snapshot,
        "stable-id",
        "new",
        &entry_dir,
        |_| Ok(()),
    )
    .unwrap();
    assert_eq!(results.len(), 2);
    for result in &results {
        assert!(result.target_path.ends_with("new.url"));
        assert_shortcut_target(&result.path, &result.target_path);
    }
}

#[test]
fn application_shortcut_rename_does_not_rename_its_program() {
    let mut fixture = Fixture::wrapped_url();
    let target = fixture.directory.join("Application.exe");
    fs::write(&target, b"application").unwrap();
    let item = &mut fixture.snapshot.icons[0];
    item.target_path = target.to_string_lossy().into_owned();
    create_shortcut_windows(
        std::path::Path::new(&item.path),
        &item.target_path,
        "--keep",
        "",
    )
    .unwrap();
    let results = rename_transaction(
        &fixture.snapshot,
        "stable-id",
        "new",
        &fixture.directory.join("icon-library-entries"),
        |_| Ok(()),
    )
    .unwrap();
    assert_eq!(fs::read(&target).unwrap(), b"application");
    assert!(results[0].path.ends_with("new.lnk"));
    assert_eq!(results[0].target_path, target.to_string_lossy());
}
