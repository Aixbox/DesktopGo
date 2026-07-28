use std::io::Cursor;

use base64::Engine;
use url::Url;

#[cfg(windows)]
use crate::icons::catalog_windows::operations::get_custom_icon_source;
#[cfg(windows)]
use crate::icons::catalog_windows::{
    is_legacy_bucket_icon_path, migrate_snapshot_to_single_icon, ICON_SNAPSHOT_VERSION,
};
use crate::icons::image_data::decode_data_uri;
#[cfg(windows)]
use crate::icons::models::{IconSnapshot, LegacySnapshotIconPaths, SnapshotIconItem};

use super::candidate::{
    extend_candidates_from_link_headers, sort_and_deduplicate_website_icon_candidates,
    website_browser_config_icon_candidates, website_icon_quality, website_manifest_icon_candidates,
    WebsiteIconCandidate,
};
use super::document::website_icon_candidates;
use super::document_assets::collect_frontend_asset_candidates;
use super::image::{
    decode_data_url_bytes, decode_website_icon, has_visible_icon_content, icon_sharpen_settings,
    optimize_icon_data_uri, optimize_icon_pixels, website_icon_data_uris, website_icon_to_data_uri,
    ICON_OPTIMIZED_OUTPUT_SIZE,
};

fn candidate(url: &str, declared_size: u32, discovery_index: usize) -> WebsiteIconCandidate {
    WebsiteIconCandidate {
        url: Url::parse(url).expect("valid test URL"),
        declared_size,
        source_priority: 3,
        discovery_index,
    }
}

#[cfg(windows)]
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
        legacy_icons: Some(paths),
    }
}

#[cfg(windows)]
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

#[cfg(windows)]
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

#[cfg(windows)]
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
fn parses_high_resolution_page_and_manifest_candidates() {
    let page_url = Url::parse("https://example.com/path/").expect("valid page URL");
    let html = r#"
        <html><head><title>Example</title>
          <link rel="icon" href="/__aisys__/brand-icon.svg" type="image/svg+xml">
          <link rel="icon" sizes="16x16 32x32" href="/favicon-32.png">
          <link rel="apple-touch-icon" sizes="180x180" href="touch.png">
          <link rel="manifest" href="/app.webmanifest">
          <meta property="og:image" content="/social-card.png">
          <script type="application/ld+json">{"@type":"Organization","logo":"/structured-logo.png"}</script>
        </head><body><img class="site-logo" src="/brand/logo-256.png" srcset="/brand/logo-512.png 512w" width="256"></body></html>
    "#;
    let page = website_icon_candidates(html, &page_url);
    assert_eq!(page.title, "Example");
    assert!(page.candidates.iter().any(|candidate| {
        candidate.url.as_str() == "https://example.com/path/touch.png"
            && candidate.declared_size == 180
    }));
    assert!(page.candidates.iter().any(|candidate| {
        candidate.url.as_str() == "https://example.com/brand/logo-512.png"
            && candidate.declared_size == 512
    }));
    for expected in [
        "https://example.com/__aisys__/brand-icon.svg",
        "https://example.com/social-card.png",
        "https://example.com/structured-logo.png",
    ] {
        assert!(page
            .candidates
            .iter()
            .any(|candidate| candidate.url.as_str() == expected));
    }
    assert_eq!(
        page.manifests[0].as_str(),
        "https://example.com/app.webmanifest"
    );

    let manifest = br#"{"icons":[{"src":"icons/app-192.png","sizes":"192x192"},{"src":"/icons/app-512.png","sizes":"512x512"}]}"#;
    let candidates =
        website_manifest_icon_candidates(manifest, &page.manifests[0], page.candidates.len());
    assert_eq!(candidates.len(), 2);
    assert_eq!(candidates[1].declared_size, 512);
    assert_eq!(
        candidates[1].url.as_str(),
        "https://example.com/icons/app-512.png"
    );
}

#[test]
fn parses_base_lazy_css_inline_svg_noscript_and_client_redirects() {
    let page_url = Url::parse("https://example.com/app/login").expect("valid page URL");
    let html = r#"
        <html><head><base href="https://cdn.example.com/ui/">
          <meta http-equiv="refresh" content="0; url=../dashboard">
          <style>.brand-logo { background-image: url('./brand/logo-bg.png'); }</style>
        </head><body>
          <img class="site-logo" data-src="images/lazy-logo.webp">
          <picture class="brand-logo"><source data-srcset="images/logo-256.png 256w, images/logo-512.png 512w"></picture>
          <svg aria-label="Company logo" viewBox="0 0 128 128"><path d="M0 0h128v128H0z"/></svg>
          <noscript><img alt="site logo" src="images/noscript.png"></noscript>
        </body></html>
    "#;
    let page = website_icon_candidates(html, &page_url);
    assert_eq!(
        page.redirect.as_ref().map(Url::as_str),
        Some("https://cdn.example.com/dashboard")
    );
    for expected in [
        "https://cdn.example.com/ui/images/lazy-logo.webp",
        "https://cdn.example.com/ui/images/logo-512.png",
        "https://cdn.example.com/ui/brand/logo-bg.png",
        "https://cdn.example.com/ui/images/noscript.png",
    ] {
        assert!(page
            .candidates
            .iter()
            .any(|candidate| candidate.url.as_str() == expected));
    }
    let inline_svg = page
        .candidates
        .iter()
        .find(|candidate| candidate.url.scheme() == "data")
        .expect("inline SVG candidate");
    assert!(decode_website_icon(&decode_data_url_bytes(&inline_svg.url).unwrap()).is_some());
}

#[test]
fn parses_javascript_location_redirects() {
    let page_url = Url::parse("https://dash.example.com/").unwrap();
    let page = website_icon_candidates(
        r#"<script>location.href = "https://console.example.com/login";</script>"#,
        &page_url,
    );
    assert_eq!(
        page.redirect.as_ref().map(Url::as_str),
        Some("https://console.example.com/login")
    );
}

#[test]
fn parses_manifest_shortcut_and_browser_config_icons() {
    let manifest_url = Url::parse("https://example.com/app.webmanifest").unwrap();
    let manifest = br#"{"icons":[{"src":"app.png","sizes":"512x512","purpose":"any maskable"}],"shortcuts":[{"icons":[{"src":"shortcut.png","sizes":"192x192"}]}]}"#;
    let candidates = website_manifest_icon_candidates(manifest, &manifest_url, 0);
    assert_eq!(candidates.len(), 2);
    assert_eq!(
        candidates[1].url.as_str(),
        "https://example.com/shortcut.png"
    );

    let config = br#"<browserconfig><msapplication><tile><square150x150logo src="/mstile.png"/></tile></msapplication></browserconfig>"#;
    let candidates = website_browser_config_icon_candidates(config, &manifest_url, 0);
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].url.as_str(), "https://example.com/mstile.png");
}

#[test]
fn parses_http_link_headers_and_data_urls() {
    let page_url = Url::parse("https://example.com/").unwrap();
    let mut candidates = Vec::new();
    let mut manifests = Vec::new();
    extend_candidates_from_link_headers(
        &["</header-icon.svg>; rel=\"icon\", </site.webmanifest>; rel=manifest".to_string()],
        &page_url,
        &mut candidates,
        &mut manifests,
    );
    assert_eq!(
        candidates[0].url.as_str(),
        "https://example.com/header-icon.svg"
    );
    assert_eq!(
        manifests[0].as_str(),
        "https://example.com/site.webmanifest"
    );
    let data_url = Url::parse("data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E").unwrap();
    assert_eq!(decode_data_url_bytes(&data_url).unwrap(), b"<svg></svg>");
}

#[test]
fn parses_logo_assets_referenced_by_frontend_bundles() {
    let bundle_url = Url::parse("https://example.com/assets/app.js").unwrap();
    let mut candidates = Vec::new();
    collect_frontend_asset_candidates(
        r#"const brandLogo = "./images/brand-logo.svg"; const ignored = "./icons/menu.svg";"#,
        &bundle_url,
        &mut candidates,
    );
    assert_eq!(candidates.len(), 1);
    assert_eq!(
        candidates[0].url.as_str(),
        "https://example.com/assets/images/brand-logo.svg"
    );
}

#[test]
fn prefers_large_square_icons_over_small_icons_and_wide_images() {
    let tiny = website_icon_quality(
        &image::DynamicImage::new_rgba8(16, 16),
        &candidate("https://example.com/favicon.ico", 16, 0),
    );
    let touch = website_icon_quality(
        &image::DynamicImage::new_rgba8(180, 180),
        &candidate("https://example.com/touch.png", 180, 1),
    );
    let wide = website_icon_quality(
        &image::DynamicImage::new_rgba8(1200, 630),
        &candidate("https://example.com/banner.png", 1200, 2),
    );
    assert!(touch > tiny);
    assert!(touch > wide);
}

#[test]
fn rejects_fully_transparent_icon_candidates() {
    let transparent = image::DynamicImage::new_rgba8(64, 64);
    let visible = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
        64,
        64,
        image::Rgba([20, 40, 80, 255]),
    ));
    assert!(!has_visible_icon_content(&transparent));
    assert!(has_visible_icon_content(&visible));
}

#[test]
fn renders_relative_size_svg_icons_as_high_resolution_images() {
    let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 256 256"><path fill="#1677ff" d="M32 32h192v192H32z"/></svg>"##;
    let image = decode_website_icon(svg).expect("render SVG icon");
    assert_eq!(image.width(), ICON_OPTIMIZED_OUTPUT_SIZE);
    assert_eq!(image.height(), ICON_OPTIMIZED_OUTPUT_SIZE);
    assert_eq!(
        image.to_rgba8().get_pixel(256, 256).0,
        [0x16, 0x77, 0xff, 0xff]
    );
}

#[test]
fn sorts_by_declared_size_and_deduplicates_urls() {
    let mut candidates = vec![
        candidate("https://example.com/icon.png", 16, 0),
        candidate("https://example.com/icon.png", 512, 1),
        candidate("https://example.com/other.png", 180, 2),
    ];
    sort_and_deduplicate_website_icon_candidates(&mut candidates);
    assert_eq!(candidates.len(), 2);
    assert_eq!(candidates[0].declared_size, 512);
    assert_eq!(candidates[1].discovery_index, 1);
}

#[test]
fn returns_multiple_unique_icons_with_the_best_candidate_first() {
    let tiny = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
        16,
        16,
        image::Rgba([255, 0, 0, 255]),
    ));
    let touch = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
        180,
        180,
        image::Rgba([0, 255, 0, 255]),
    ));
    let manifest = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
        512,
        512,
        image::Rgba([0, 0, 255, 255]),
    ));
    let decoded = vec![
        (
            website_icon_quality(&tiny, &candidate("https://example.com/favicon.ico", 16, 0)),
            tiny,
        ),
        (
            website_icon_quality(&touch, &candidate("https://example.com/touch.png", 180, 1)),
            touch,
        ),
        (
            website_icon_quality(
                &manifest,
                &candidate("https://example.com/manifest.png", 512, 2),
            ),
            manifest.clone(),
        ),
    ];
    let icons = website_icon_data_uris(decoded);
    assert_eq!(icons.len(), 3);
    assert_eq!(icons[0], website_icon_to_data_uri(&manifest).unwrap());
}

#[test]
fn website_icon_encoding_preserves_the_selected_source_dimensions() {
    let source = image::DynamicImage::new_rgba8(1024, 768);
    let data_uri = website_icon_to_data_uri(&source).unwrap();
    let decoded = image::load_from_memory(&decode_data_uri(&data_uri).unwrap()).unwrap();
    assert_eq!((decoded.width(), decoded.height()), (1024, 768));
}

#[cfg(windows)]
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

#[test]
fn optimizes_an_icon_only_when_explicitly_requested() {
    let source = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
        32,
        32,
        image::Rgba([48, 96, 144, 255]),
    ));
    let mut encoded = Cursor::new(Vec::new());
    source
        .write_to(&mut encoded, image::ImageFormat::Png)
        .unwrap();
    let data_uri = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(encoded.into_inner())
    );
    let optimized = optimize_icon_data_uri(&data_uri).unwrap();
    let image = image::load_from_memory(&decode_data_uri(&optimized).unwrap()).unwrap();
    assert_eq!(image.width(), ICON_OPTIMIZED_OUTPUT_SIZE);
    assert_eq!(image.height(), ICON_OPTIMIZED_OUTPUT_SIZE);
}

#[test]
fn adapts_sharpening_strength_and_preserves_resized_alpha() {
    let tiny = image::DynamicImage::new_rgba8(32, 32);
    let settings = icon_sharpen_settings(&tiny);
    assert_eq!(settings.sigma, 1.2);
    assert_eq!(settings.threshold, 1);

    let source = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_fn(8, 8, |x, _| {
        if x < 4 {
            image::Rgba([255, 255, 255, 0])
        } else {
            image::Rgba([40, 120, 220, 255])
        }
    }));
    let resized = source
        .resize(64, 64, image::imageops::FilterType::Lanczos3)
        .to_rgba8();
    let optimized = optimize_icon_pixels(&source, 64).to_rgba8();
    assert_eq!(optimized.dimensions(), resized.dimensions());
    assert!(optimized
        .pixels()
        .zip(resized.pixels())
        .all(|(optimized, resized)| optimized[3] == resized[3]));
}
