use std::cmp::Reverse;
use std::collections::HashSet;

use once_cell::sync::Lazy;
use regex::Regex;
use url::Url;

static LINK_HEADER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)<([^>]+)>\s*;\s*[^,]*?rel\s*=\s*[\"']?([^\"';,]+)"#)
        .expect("valid Link header regex")
});
static XML_IMAGE_SOURCE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)<(?:square\d+x\d+logo|image)[^>]+src\s*=\s*[\"']([^\"']+)"#)
        .expect("valid browser config image regex")
});

#[derive(Debug, Clone)]
pub(super) struct WebsiteIconCandidate {
    pub(super) url: Url,
    pub(super) declared_size: u32,
    pub(super) source_priority: u8,
    pub(super) discovery_index: usize,
}

#[derive(Debug, Default)]
pub(super) struct WebsitePageCandidates {
    pub(super) title: String,
    pub(super) candidates: Vec<WebsiteIconCandidate>,
    pub(super) manifests: Vec<Url>,
    pub(super) browser_configs: Vec<Url>,
    pub(super) stylesheets: Vec<Url>,
    pub(super) scripts: Vec<Url>,
    pub(super) redirect: Option<Url>,
    pub(super) has_explicit_sources: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct WebsiteIconQuality {
    resolution_tier: u8,
    square_score: u16,
    min_dimension: u32,
    max_dimension: u32,
    declared_size: u32,
    source_priority: u8,
    discovery_order: Reverse<usize>,
}

pub(super) fn declared_website_icon_size(value: Option<&str>) -> u32 {
    value
        .into_iter()
        .flat_map(str::split_ascii_whitespace)
        .filter_map(|size| {
            if size.eq_ignore_ascii_case("any") {
                return Some(1024);
            }
            let normalized = size.to_ascii_lowercase();
            let (width, height) = normalized.split_once('x')?;
            Some(width.parse::<u32>().ok()?.min(height.parse::<u32>().ok()?))
        })
        .max()
        .unwrap_or_default()
}

pub(super) fn resolve_website_asset_url(base_url: &Url, value: &str) -> Option<Url> {
    let trimmed = value.trim().trim_matches(['"', '\'', ' ']);
    if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("blob:") {
        return None;
    }
    let url = if trimmed.starts_with("data:") {
        Url::parse(trimmed).ok()?
    } else {
        base_url.join(trimmed).ok()?
    };
    matches!(url.scheme(), "http" | "https" | "data").then_some(url)
}

pub(super) fn push_website_icon_candidate(
    candidates: &mut Vec<WebsiteIconCandidate>,
    base_url: &Url,
    value: &str,
    declared_size: u32,
    source_priority: u8,
) {
    let Some(url) = resolve_website_asset_url(base_url, value) else {
        return;
    };
    candidates.push(WebsiteIconCandidate {
        url,
        declared_size,
        source_priority,
        discovery_index: candidates.len(),
    });
}

pub(super) fn push_unique_http_url(urls: &mut Vec<Url>, base_url: &Url, value: &str) {
    let Some(url) = resolve_website_asset_url(base_url, value) else {
        return;
    };
    if matches!(url.scheme(), "http" | "https") && !urls.iter().any(|candidate| candidate == &url) {
        urls.push(url);
    }
}

pub(super) fn extend_candidates_from_link_headers(
    link_headers: &[String],
    page_url: &Url,
    candidates: &mut Vec<WebsiteIconCandidate>,
    manifests: &mut Vec<Url>,
) {
    for header in link_headers {
        for captures in LINK_HEADER_RE.captures_iter(header) {
            let Some(target) = captures.get(1).map(|capture| capture.as_str()) else {
                continue;
            };
            let rel = captures
                .get(2)
                .map(|capture| capture.as_str())
                .unwrap_or_default();
            let rel_values = rel.split_ascii_whitespace().collect::<Vec<_>>();
            if rel_values
                .iter()
                .any(|value| value.eq_ignore_ascii_case("manifest"))
            {
                push_unique_http_url(manifests, page_url, target);
            }
            if rel_values.iter().any(|value| {
                value.eq_ignore_ascii_case("icon")
                    || value.eq_ignore_ascii_case("apple-touch-icon")
                    || value.eq_ignore_ascii_case("mask-icon")
            }) {
                push_website_icon_candidate(candidates, page_url, target, 0, 4);
            }
        }
    }
}

pub(super) fn external_favicon_candidates(
    page_url: &Url,
    discovery_index: usize,
) -> Vec<WebsiteIconCandidate> {
    let Some(host) = page_url.host_str() else {
        return Vec::new();
    };
    let mut urls = Vec::new();
    if let Ok(mut google) = Url::parse("https://www.google.com/s2/favicons") {
        google
            .query_pairs_mut()
            .append_pair("domain_url", &page_url.origin().ascii_serialization())
            .append_pair("sz", "256");
        urls.push(google);
    }
    if let Ok(duckduckgo) = Url::parse(&format!("https://icons.duckduckgo.com/ip3/{host}.ico")) {
        urls.push(duckduckgo);
    }
    urls.into_iter()
        .enumerate()
        .map(|(index, url)| WebsiteIconCandidate {
            url,
            declared_size: 256,
            source_priority: 0,
            discovery_index: discovery_index.saturating_add(index),
        })
        .collect()
}

pub(super) fn website_manifest_icon_candidates(
    bytes: &[u8],
    manifest_url: &Url,
    discovery_index: usize,
) -> Vec<WebsiteIconCandidate> {
    let Ok(manifest) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return Vec::new();
    };
    let mut icons = manifest
        .get("icons")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    if let Some(shortcuts) = manifest.get("shortcuts").and_then(|value| value.as_array()) {
        for shortcut in shortcuts {
            if let Some(shortcut_icons) = shortcut.get("icons").and_then(|value| value.as_array()) {
                icons.extend(shortcut_icons);
            }
        }
    }

    icons
        .into_iter()
        .enumerate()
        .filter_map(|(index, icon)| {
            let src = icon.get("src")?.as_str()?;
            let url = resolve_website_asset_url(manifest_url, src)?;
            let purpose = icon
                .get("purpose")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            Some(WebsiteIconCandidate {
                url,
                declared_size: declared_website_icon_size(
                    icon.get("sizes").and_then(|value| value.as_str()),
                ),
                source_priority: if purpose
                    .split_ascii_whitespace()
                    .any(|value| value.eq_ignore_ascii_case("any"))
                {
                    6
                } else {
                    5
                },
                discovery_index: discovery_index.saturating_add(index),
            })
        })
        .collect()
}

pub(super) fn website_browser_config_icon_candidates(
    bytes: &[u8],
    config_url: &Url,
    discovery_index: usize,
) -> Vec<WebsiteIconCandidate> {
    let xml = String::from_utf8_lossy(bytes);
    XML_IMAGE_SOURCE_RE
        .captures_iter(&xml)
        .filter_map(|captures| captures.get(1).map(|capture| capture.as_str()))
        .filter_map(|source| resolve_website_asset_url(config_url, source))
        .enumerate()
        .map(|(index, url)| WebsiteIconCandidate {
            url,
            declared_size: 0,
            source_priority: 4,
            discovery_index: discovery_index.saturating_add(index),
        })
        .collect()
}

pub(super) fn sort_and_deduplicate_website_icon_candidates(
    candidates: &mut Vec<WebsiteIconCandidate>,
) {
    candidates.sort_by(|left, right| {
        right
            .declared_size
            .cmp(&left.declared_size)
            .then_with(|| right.source_priority.cmp(&left.source_priority))
            .then_with(|| left.discovery_index.cmp(&right.discovery_index))
    });
    let mut seen = HashSet::new();
    candidates.retain(|candidate| seen.insert(candidate.url.as_str().to_string()));
    for (index, candidate) in candidates.iter_mut().enumerate() {
        candidate.discovery_index = index;
    }
}

pub(super) fn website_icon_quality(
    image: &image::DynamicImage,
    candidate: &WebsiteIconCandidate,
) -> WebsiteIconQuality {
    let width = image.width().max(1);
    let height = image.height().max(1);
    let min_dimension = width.min(height);
    let max_dimension = width.max(height);
    let is_reasonable_shape = max_dimension < min_dimension.saturating_mul(5);
    let resolution_tier = if is_reasonable_shape && min_dimension > 50 && max_dimension > 100 {
        2
    } else if is_reasonable_shape && (min_dimension > 50 || max_dimension > 100) {
        1
    } else {
        0
    };
    WebsiteIconQuality {
        resolution_tier,
        square_score: ((min_dimension as u64 * 1000) / max_dimension as u64) as u16,
        min_dimension,
        max_dimension,
        declared_size: candidate.declared_size,
        source_priority: candidate.source_priority,
        discovery_order: Reverse(candidate.discovery_index),
    }
}
