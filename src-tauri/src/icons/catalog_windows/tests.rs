use std::io::Cursor;

use crate::icons::image_data::decode_data_uri;
use crate::icons::models::{IconSnapshot, LegacySnapshotIconPaths, SnapshotIconItem};

use super::operations::get_custom_icon_source;
use super::source::ICON_SNAPSHOT_VERSION;
use super::storage::{is_legacy_bucket_icon_path, migrate_snapshot_to_single_icon};

fn snapshot_item_with_legacy_icons(paths: LegacySnapshotIconPaths) -> SnapshotIconItem {
    SnapshotIconItem {
        id: "legacy-id".to_string(),
        key: "legacy-key".to_string(),
        display_order: 1,
        name: "Legacy".to_string(),
        path: "legacy.lnk".to_string(),
        target_path: "legacy.exe".to_string(),
        launch_arguments: String::new(),
        working_directory: String::new(),
        custom_icon_path: String::new(),
        icon_source: "target".to_string(),
        icon_color: "none".to_string(),
        icon_text: String::new(),
        item_type: "shortcut".to_string(),
        hidden: false,
        icon: String::new(),
        automatic_target_icon_cache: false,
        automatic_target_icon_cache_version: 0,
        legacy_icons: Some(paths),
    }
}

#[test]
fn migrates_legacy_buckets_to_one_canonical_icon() {
    let mut snapshot = IconSnapshot {
        version: 1,
        icons: vec![snapshot_item_with_legacy_icons(LegacySnapshotIconPaths {
            master: "master.png".to_string(),
            small: "small.png".to_string(),
            medium: "medium.png".to_string(),
            large: "large.png".to_string(),
        })],
    };

    assert!(migrate_snapshot_to_single_icon(&mut snapshot));
    assert_eq!(snapshot.version, ICON_SNAPSHOT_VERSION);
    assert_eq!(snapshot.icons[0].icon, "master.png");
    assert!(snapshot.icons[0].legacy_icons.is_none());
    let json = serde_json::to_string(&snapshot).expect("serialize migrated snapshot");
    assert!(!json.contains("\"icons\":{"));
}

#[test]
fn migration_uses_the_largest_legacy_bucket_when_no_master_exists() {
    let mut snapshot = IconSnapshot {
        version: 1,
        icons: vec![snapshot_item_with_legacy_icons(LegacySnapshotIconPaths {
            master: String::new(),
            small: "small.png".to_string(),
            medium: "medium.png".to_string(),
            large: "large.png".to_string(),
        })],
    };
    assert!(migrate_snapshot_to_single_icon(&mut snapshot));
    assert_eq!(snapshot.icons[0].icon, "large.png");
}

#[test]
fn recognizes_only_legacy_display_bucket_paths() {
    assert!(is_legacy_bucket_icon_path(
        "icons/library/large/legacy-id.png"
    ));
    assert!(is_legacy_bucket_icon_path(
        "icons\\library\\small\\legacy-id.png"
    ));
    assert!(!is_legacy_bucket_icon_path(
        "icons/library/master/legacy-id.png"
    ));
    assert!(!is_legacy_bucket_icon_path("icons/library/legacy-id.img"));
}

#[test]
fn custom_image_decoder_uses_file_contents_when_extension_is_misleading() {
    let source = image::DynamicImage::ImageRgb8(image::ImageBuffer::from_pixel(
        32,
        20,
        image::Rgb([40, 80, 120]),
    ));
    let mut encoded = Cursor::new(Vec::new());
    source
        .write_to(&mut encoded, image::ImageFormat::Jpeg)
        .unwrap();
    let original_bytes = encoded.into_inner();
    let path = std::env::temp_dir().join(format!("desktopgo-{}.png", uuid::Uuid::new_v4()));
    std::fs::write(&path, &original_bytes).unwrap();
    let data_uri = get_custom_icon_source(path.to_string_lossy().as_ref()).unwrap();
    let _ = std::fs::remove_file(path);
    assert!(data_uri.starts_with("data:image/jpeg;base64,"));
    let decoded_bytes = decode_data_uri(&data_uri).unwrap();
    let decoded = image::load_from_memory(&decoded_bytes).unwrap();
    assert_eq!(decoded_bytes, original_bytes);
    assert_eq!((decoded.width(), decoded.height()), (32, 20));
}
