use base64::Engine;
use futures_util::{stream, StreamExt};
use once_cell::sync::Lazy;
use percent_encoding::percent_decode_str;
use regex::Regex;
use scraper::{Html, Selector};
use std::cmp::Reverse;
use std::collections::HashSet;
use std::io::Cursor;
use std::time::Duration;
use url::Url;

#[cfg(all(test, windows))]
use super::catalog_windows::operations::get_custom_icon_source;
#[cfg(all(test, windows))]
use super::catalog_windows::{
    is_legacy_bucket_icon_path, migrate_snapshot_to_single_icon, ICON_SNAPSHOT_VERSION,
};
use super::image_data::decode_data_uri;
use super::models::WebsiteIconResult;
#[cfg(test)]
use super::models::{IconSnapshot, LegacySnapshotIconPaths, SnapshotIconItem};

const ICON_OPTIMIZED_OUTPUT_SIZE: u32 = 512;

#[derive(Debug, Clone, Copy)]
struct IconSharpenSettings {
    sigma: f32,
    threshold: i32,
}

const MAX_WEBSITE_HTML_BYTES: usize = 2 * 1024 * 1024;
const MAX_WEBSITE_ICON_BYTES: usize = 5 * 1024 * 1024;
const MAX_WEBSITE_MANIFEST_BYTES: usize = 1024 * 1024;
const MAX_WEBSITE_FRONTEND_ASSET_BYTES: usize = 2 * 1024 * 1024;
const MAX_WEBSITE_ICON_CANDIDATES: usize = 40;
const MAX_CONCURRENT_WEBSITE_ICON_REQUESTS: usize = 6;
const MAX_WEBSITE_ICON_RESULTS: usize = 8;
const MAX_CLIENT_REDIRECTS: usize = 3;
const MAX_MANIFEST_REQUESTS: usize = 4;
const MAX_BROWSER_CONFIG_REQUESTS: usize = 2;
const MAX_STYLESHEET_REQUESTS: usize = 4;
const MAX_SCRIPT_REQUESTS: usize = 3;

static CSS_URL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)url\(\s*[\"']?([^\)\"']+)[\"']?\s*\)"#).expect("valid CSS URL regex")
});
static META_REFRESH_URL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)(?:^|;)\s*url\s*=\s*[\"']?([^\"';]+)"#).expect("valid meta refresh regex")
});
static JS_LOCATION_ASSIGN_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?is)(?:(?:window|document|top|self)\s*\.\s*)?location(?:\s*\.\s*href)?\s*=\s*[\"']([^\"']+)[\"']"#,
    )
    .expect("valid JavaScript location assignment regex")
});
static JS_LOCATION_CALL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?is)(?:(?:window|document|top|self)\s*\.\s*)?location\s*\.\s*(?:assign|replace)\s*\(\s*[\"']([^\"']+)[\"']"#,
    )
    .expect("valid JavaScript location call regex")
});
static LINK_HEADER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)<([^>]+)>\s*;\s*[^,]*?rel\s*=\s*[\"']?([^\"';,]+)"#)
        .expect("valid Link header regex")
});
static XML_IMAGE_SOURCE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)<(?:square\d+x\d+logo|image)[^>]+src\s*=\s*[\"']([^\"']+)"#)
        .expect("valid browser config image regex")
});
static FRONTEND_ICON_ASSET_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?is)[\"']([^\"']*(?:favicon|logo|site-icon|site-mark|brand-mark|brand-logo|app-icon)[^\"']*\.(?:svg|png|webp|ico|avif|jpe?g)(?:\?[^\"']*)?)[\"']"#,
    )
    .expect("valid frontend icon asset regex")
});
static FRONTEND_INLINE_SVG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)(<svg\b[^>]*(?:logo|brand|site-icon)[^>]*>.*?</svg>)"#)
        .expect("valid frontend inline SVG regex")
});

#[derive(Debug, Clone)]
struct WebsiteIconCandidate {
    url: Url,
    declared_size: u32,
    source_priority: u8,
    discovery_index: usize,
}

#[derive(Debug, Default)]
struct WebsitePageCandidates {
    title: String,
    candidates: Vec<WebsiteIconCandidate>,
    manifests: Vec<Url>,
    browser_configs: Vec<Url>,
    stylesheets: Vec<Url>,
    scripts: Vec<Url>,
    redirect: Option<Url>,
    has_explicit_sources: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct WebsiteIconQuality {
    resolution_tier: u8,
    square_score: u16,
    min_dimension: u32,
    max_dimension: u32,
    declared_size: u32,
    source_priority: u8,
    discovery_order: Reverse<usize>,
}

pub(super) fn normalize_website_url(value: &str) -> Result<Url, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Website URL is required".to_string());
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&candidate).map_err(|error| format!("Invalid website URL: {error}"))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("Only HTTP and HTTPS website URLs are supported".to_string());
    }
    Ok(url)
}

struct WebsiteResponse {
    final_url: Url,
    bytes: Vec<u8>,
    link_headers: Vec<String>,
}

async fn read_response_limited(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<WebsiteResponse, String> {
    if !response.status().is_success() {
        return Err(format!("Website returned HTTP {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("Website response is too large".to_string());
    }

    let final_url = response.url().clone();
    let link_headers = response
        .headers()
        .get_all(reqwest::header::LINK)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .map(str::to_string)
        .collect();
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Failed to read website response: {error}"))?;
        if bytes.len().saturating_add(chunk.len()) > max_bytes {
            return Err("Website response is too large".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(WebsiteResponse {
        final_url,
        bytes,
        link_headers,
    })
}

async fn read_response_bytes_limited_any_status(
    response: reqwest::Response,
    max_bytes: usize,
) -> Option<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return None;
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.ok()?;
        if bytes.len().saturating_add(chunk.len()) > max_bytes {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    Some(bytes)
}

fn declared_website_icon_size(value: Option<&str>) -> u32 {
    value
        .into_iter()
        .flat_map(str::split_ascii_whitespace)
        .filter_map(|size| {
            if size.eq_ignore_ascii_case("any") {
                return Some(1024);
            }
            let normalized = size.to_ascii_lowercase();
            let (width, height) = normalized.split_once('x')?;
            let width = width.parse::<u32>().ok()?;
            let height = height.parse::<u32>().ok()?;
            Some(width.min(height))
        })
        .max()
        .unwrap_or_default()
}

fn looks_like_website_icon(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    normalized.contains("favicon")
        || normalized.contains("apple-touch-icon")
        || normalized.contains("logo")
        || normalized.contains("site-icon")
        || normalized.contains("site-mark")
        || normalized.contains("brand-mark")
        || normalized.contains("brand-logo")
        || normalized.contains("app-icon")
}

fn resolve_website_asset_url(base_url: &Url, value: &str) -> Option<Url> {
    let trimmed = value.trim().trim_matches(['\"', '\'', ' ']);
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

fn push_website_icon_candidate(
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

fn push_unique_http_url(urls: &mut Vec<Url>, base_url: &Url, value: &str) {
    let Some(url) = resolve_website_asset_url(base_url, value) else {
        return;
    };
    if matches!(url.scheme(), "http" | "https") && !urls.iter().any(|candidate| candidate == &url) {
        urls.push(url);
    }
}

fn best_srcset_candidate(value: &str) -> Option<(&str, u32)> {
    value
        .split(',')
        .filter_map(|candidate| {
            let mut parts = candidate.split_ascii_whitespace();
            let url = parts.next()?;
            let descriptor = parts.next().unwrap_or_default().to_ascii_lowercase();
            let declared_size = descriptor
                .strip_suffix('w')
                .and_then(|value| value.parse::<u32>().ok())
                .or_else(|| {
                    descriptor
                        .strip_suffix('x')
                        .and_then(|value| value.parse::<f32>().ok())
                        .map(|scale| (scale * 256.0).round() as u32)
                })
                .unwrap_or_default();
            Some((url, declared_size))
        })
        .max_by_key(|(_, declared_size)| *declared_size)
}

fn collect_json_logo_values(value: &serde_json::Value, logos: &mut Vec<String>) {
    match value {
        serde_json::Value::Array(values) => {
            for value in values {
                collect_json_logo_values(value, logos);
            }
        }
        serde_json::Value::Object(object) => {
            for (key, value) in object {
                if key.eq_ignore_ascii_case("logo") {
                    match value {
                        serde_json::Value::String(url) => logos.push(url.clone()),
                        serde_json::Value::Object(logo) => {
                            for property in ["url", "contentUrl"] {
                                if let Some(url) =
                                    logo.get(property).and_then(|value| value.as_str())
                                {
                                    logos.push(url.to_string());
                                }
                            }
                        }
                        _ => {}
                    }
                } else {
                    collect_json_logo_values(value, logos);
                }
            }
        }
        _ => {}
    }
}

fn document_base_url(document: &Html, page_url: &Url) -> Url {
    let selector = Selector::parse("base[href]").expect("valid base URL selector");
    document
        .select(&selector)
        .next()
        .and_then(|element| element.value().attr("href"))
        .and_then(|value| page_url.join(value).ok())
        .filter(|url| matches!(url.scheme(), "http" | "https"))
        .unwrap_or_else(|| page_url.clone())
}

fn collect_image_candidates(
    document: &Html,
    base_url: &Url,
    candidates: &mut Vec<WebsiteIconCandidate>,
) {
    let selector = Selector::parse("img, picture source").expect("valid image selector");
    for element in document.select(&selector) {
        let attributes = element.value();
        let source_values = [
            attributes.attr("src").unwrap_or_default(),
            attributes.attr("data-src").unwrap_or_default(),
            attributes.attr("data-original").unwrap_or_default(),
            attributes.attr("data-lazy-src").unwrap_or_default(),
            attributes.attr("data-url").unwrap_or_default(),
            attributes.attr("data-image").unwrap_or_default(),
        ];
        let srcset_values = [
            attributes.attr("srcset").unwrap_or_default(),
            attributes.attr("data-srcset").unwrap_or_default(),
        ];
        let semantic_text = source_values
            .iter()
            .chain(srcset_values.iter())
            .copied()
            .chain([
                attributes.attr("alt").unwrap_or_default(),
                attributes.attr("class").unwrap_or_default(),
                attributes.attr("id").unwrap_or_default(),
                attributes.attr("aria-label").unwrap_or_default(),
            ])
            .collect::<Vec<_>>()
            .join(" ");
        if !looks_like_website_icon(&semantic_text) {
            continue;
        }

        let declared_width = attributes
            .attr("width")
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or_default();
        for source in source_values {
            push_website_icon_candidate(candidates, base_url, source, declared_width, 2);
        }
        for srcset in srcset_values {
            if let Some((source, declared_size)) = best_srcset_candidate(srcset) {
                push_website_icon_candidate(candidates, base_url, source, declared_size, 2);
            }
        }
    }
}

fn collect_css_icon_candidates(
    css: &str,
    base_url: &Url,
    candidates: &mut Vec<WebsiteIconCandidate>,
    source_priority: u8,
) {
    for captures in CSS_URL_RE.captures_iter(css) {
        let Some(value) = captures.get(1).map(|capture| capture.as_str().trim()) else {
            continue;
        };
        let context_start = captures
            .get(0)
            .map(|capture| capture.start().saturating_sub(180))
            .unwrap_or_default();
        let context_end = captures
            .get(0)
            .map(|capture| capture.end())
            .unwrap_or(context_start)
            .min(css.len());
        let context = css.get(context_start..context_end).unwrap_or_default();
        if looks_like_website_icon(value) || looks_like_website_icon(context) {
            push_website_icon_candidate(candidates, base_url, value, 0, source_priority);
        }
    }
}

fn collect_frontend_asset_candidates(
    source: &str,
    base_url: &Url,
    candidates: &mut Vec<WebsiteIconCandidate>,
) {
    let normalized = source
        .replace("\\/", "/")
        .replace("\\u002F", "/")
        .replace("\\u002f", "/")
        .replace("\\u003A", ":")
        .replace("\\u003a", ":");
    for captures in FRONTEND_ICON_ASSET_RE.captures_iter(&normalized) {
        if let Some(value) = captures.get(1).map(|capture| capture.as_str()) {
            push_website_icon_candidate(candidates, base_url, value, 0, 1);
        }
    }
    for captures in FRONTEND_INLINE_SVG_RE.captures_iter(&normalized) {
        let Some(svg) = captures.get(1).map(|capture| capture.as_str()) else {
            continue;
        };
        let data_uri = format!(
            "data:image/svg+xml;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(svg.as_bytes())
        );
        push_website_icon_candidate(candidates, base_url, &data_uri, 0, 1);
    }
}

fn collect_document_css_candidates(
    document: &Html,
    base_url: &Url,
    candidates: &mut Vec<WebsiteIconCandidate>,
) {
    let style_selector = Selector::parse("style").expect("valid style selector");
    for element in document.select(&style_selector) {
        collect_css_icon_candidates(&element.inner_html(), base_url, candidates, 2);
    }

    let inline_style_selector = Selector::parse("[style]").expect("valid inline style selector");
    for element in document.select(&inline_style_selector) {
        let style = element.value().attr("style").unwrap_or_default();
        let semantic_text = [
            element.value().attr("class").unwrap_or_default(),
            element.value().attr("id").unwrap_or_default(),
            element.value().attr("aria-label").unwrap_or_default(),
            style,
        ]
        .join(" ");
        if looks_like_website_icon(&semantic_text) {
            collect_css_icon_candidates(style, base_url, candidates, 2);
        }
    }
}

fn svg_declared_size(element: &scraper::ElementRef<'_>) -> u32 {
    let attributes = element.value();
    let width = attributes
        .attr("width")
        .and_then(|value| value.trim_end_matches("px").parse::<f32>().ok());
    let height = attributes
        .attr("height")
        .and_then(|value| value.trim_end_matches("px").parse::<f32>().ok());
    if let (Some(width), Some(height)) = (width, height) {
        return width.min(height).round().max(0.0) as u32;
    }
    attributes
        .attr("viewBox")
        .or_else(|| attributes.attr("viewbox"))
        .and_then(|value| {
            let values = value
                .split(|character: char| character.is_ascii_whitespace() || character == ',')
                .filter_map(|value| value.parse::<f32>().ok())
                .collect::<Vec<_>>();
            (values.len() == 4).then(|| values[2].abs().min(values[3].abs()).round() as u32)
        })
        .unwrap_or_default()
}

fn collect_inline_svg_candidates(
    document: &Html,
    base_url: &Url,
    candidates: &mut Vec<WebsiteIconCandidate>,
) {
    let selector = Selector::parse("svg").expect("valid SVG selector");
    for element in document.select(&selector).take(24) {
        let semantic_text = [
            element.value().attr("class").unwrap_or_default(),
            element.value().attr("id").unwrap_or_default(),
            element.value().attr("aria-label").unwrap_or_default(),
            element
                .select(&Selector::parse("title").expect("valid SVG title selector"))
                .next()
                .map(|title| title.text().collect::<String>())
                .unwrap_or_default()
                .as_str(),
        ]
        .join(" ");
        if !looks_like_website_icon(&semantic_text) {
            continue;
        }
        let mut svg = element.html();
        if !svg.contains("xmlns=") {
            svg = svg.replacen("<svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"", 1);
        }
        let data_uri = format!(
            "data:image/svg+xml;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(svg.as_bytes())
        );
        push_website_icon_candidate(
            candidates,
            base_url,
            &data_uri,
            svg_declared_size(&element),
            3,
        );
    }
}

fn client_side_redirect(document: &Html, base_url: &Url) -> Option<Url> {
    let meta_selector = Selector::parse("meta[http-equiv][content]").expect("valid meta selector");
    for element in document.select(&meta_selector) {
        if !element
            .value()
            .attr("http-equiv")
            .is_some_and(|value| value.eq_ignore_ascii_case("refresh"))
        {
            continue;
        }
        let content = element.value().attr("content").unwrap_or_default();
        if let Some(value) = META_REFRESH_URL_RE
            .captures(content)
            .and_then(|captures| captures.get(1))
            .map(|capture| capture.as_str())
        {
            if let Some(url) = resolve_website_asset_url(base_url, value)
                .filter(|url| matches!(url.scheme(), "http" | "https"))
            {
                return Some(url);
            }
        }
    }

    let script_selector = Selector::parse("script:not([src])").expect("valid script selector");
    for script in document.select(&script_selector) {
        let code = script.text().collect::<String>();
        if code.len() > 4096 {
            continue;
        }
        for regex in [&*JS_LOCATION_CALL_RE, &*JS_LOCATION_ASSIGN_RE] {
            let Some(captures) = regex.captures(&code) else {
                continue;
            };
            let prefix = captures
                .get(0)
                .and_then(|matched| code.get(..matched.start()))
                .unwrap_or_default()
                .to_ascii_lowercase();
            if prefix.contains("function")
                || prefix.contains("addeventlistener")
                || prefix.contains("=>")
            {
                continue;
            }
            if let Some(url) = captures
                .get(1)
                .and_then(|capture| resolve_website_asset_url(base_url, capture.as_str()))
                .filter(|url| matches!(url.scheme(), "http" | "https"))
            {
                return Some(url);
            }
        }
    }
    None
}

fn website_icon_candidates(html: &str, page_url: &Url) -> WebsitePageCandidates {
    let document = Html::parse_document(html);
    let base_url = document_base_url(&document, page_url);
    let title_selector = Selector::parse("title").expect("valid title selector");
    let link_selector = Selector::parse("link").expect("valid link selector");
    let meta_selector = Selector::parse("meta[content]").expect("valid meta selector");
    let json_ld_selector =
        Selector::parse("script[type='application/ld+json']").expect("valid JSON-LD selector");
    let script_selector = Selector::parse("script[src]").expect("valid script selector");
    let noscript_selector = Selector::parse("noscript").expect("valid noscript selector");
    let mut result = WebsitePageCandidates {
        title: document
            .select(&title_selector)
            .next()
            .map(|element| element.text().collect::<String>().trim().to_string())
            .unwrap_or_default(),
        redirect: client_side_redirect(&document, &base_url),
        ..WebsitePageCandidates::default()
    };

    for element in document.select(&link_selector) {
        let rel = element.value().attr("rel").unwrap_or_default();
        let rel_values = rel.split_ascii_whitespace().collect::<Vec<_>>();
        let href = element.value().attr("href").unwrap_or_default();

        if rel_values
            .iter()
            .any(|value| value.eq_ignore_ascii_case("manifest"))
        {
            push_unique_http_url(&mut result.manifests, &base_url, href);
        }
        if rel_values
            .iter()
            .any(|value| value.eq_ignore_ascii_case("stylesheet"))
        {
            push_unique_http_url(&mut result.stylesheets, &base_url, href);
        }

        let is_apple_touch_icon = rel_values.iter().any(|value| {
            value.eq_ignore_ascii_case("apple-touch-icon")
                || value.eq_ignore_ascii_case("apple-touch-icon-precomposed")
        });
        let is_icon = is_apple_touch_icon
            || rel_values.iter().any(|value| {
                value.eq_ignore_ascii_case("icon")
                    || value.eq_ignore_ascii_case("mask-icon")
                    || value.eq_ignore_ascii_case("fluid-icon")
                    || value.eq_ignore_ascii_case("logo")
                    || value.eq_ignore_ascii_case("image_src")
            });
        let is_image_preload = rel_values
            .iter()
            .any(|value| value.eq_ignore_ascii_case("preload"))
            && element
                .value()
                .attr("as")
                .is_some_and(|value| value.eq_ignore_ascii_case("image"));
        let semantic_text = [
            href,
            element.value().attr("imagesrcset").unwrap_or_default(),
            element.value().attr("title").unwrap_or_default(),
        ]
        .join(" ");
        if is_icon || (is_image_preload && looks_like_website_icon(&semantic_text)) {
            let priority = if is_apple_touch_icon {
                5
            } else if is_icon {
                4
            } else {
                2
            };
            push_website_icon_candidate(
                &mut result.candidates,
                &base_url,
                href,
                declared_website_icon_size(element.value().attr("sizes")),
                priority,
            );
            if let Some((source, declared_size)) =
                best_srcset_candidate(element.value().attr("imagesrcset").unwrap_or_default())
            {
                push_website_icon_candidate(
                    &mut result.candidates,
                    &base_url,
                    source,
                    declared_size,
                    priority,
                );
            }
        }
    }

    for element in document.select(&script_selector) {
        push_unique_http_url(
            &mut result.scripts,
            &base_url,
            element.value().attr("src").unwrap_or_default(),
        );
    }

    collect_image_candidates(&document, &base_url, &mut result.candidates);
    collect_document_css_candidates(&document, &base_url, &mut result.candidates);
    collect_inline_svg_candidates(&document, &base_url, &mut result.candidates);

    for element in document.select(&noscript_selector) {
        let text_content = element.text().collect::<String>();
        let fragment_source = if text_content.trim().is_empty() {
            element.inner_html()
        } else {
            text_content
        };
        let fragment = Html::parse_fragment(&fragment_source);
        collect_image_candidates(&fragment, &base_url, &mut result.candidates);
        collect_document_css_candidates(&fragment, &base_url, &mut result.candidates);
        collect_inline_svg_candidates(&fragment, &base_url, &mut result.candidates);
    }

    for element in document.select(&meta_selector) {
        let property = element
            .value()
            .attr("property")
            .or_else(|| element.value().attr("name"))
            .or_else(|| element.value().attr("itemprop"))
            .unwrap_or_default()
            .to_ascii_lowercase();
        let content = element.value().attr("content").unwrap_or_default();
        if property == "msapplication-config" {
            if !content.eq_ignore_ascii_case("none") {
                push_unique_http_url(&mut result.browser_configs, &base_url, content);
            }
            continue;
        }
        if matches!(
            property.as_str(),
            "og:image"
                | "og:image:url"
                | "twitter:image"
                | "twitter:image:src"
                | "msapplication-tileimage"
                | "image"
                | "logo"
                | "thumbnail"
                | "thumbnailurl"
        ) {
            push_website_icon_candidate(&mut result.candidates, &base_url, content, 0, 3);
        }
    }

    for element in document.select(&json_ld_selector) {
        let json = element.text().collect::<String>();
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&json) else {
            continue;
        };
        let mut logos = Vec::new();
        collect_json_logo_values(&value, &mut logos);
        for logo in logos {
            push_website_icon_candidate(&mut result.candidates, &base_url, &logo, 0, 3);
        }
    }

    result.has_explicit_sources = !result.candidates.is_empty() || !result.manifests.is_empty();

    for (path, declared_size, source_priority) in [
        ("/favicon.svg", 1024, 3),
        ("/android-chrome-512x512.png", 512, 3),
        ("/android-chrome-192x192.png", 192, 3),
        ("/apple-touch-icon.png", 180, 3),
        ("/mstile-150x150.png", 150, 2),
        ("/safari-pinned-tab.svg", 1024, 2),
        ("/favicon-96x96.png", 96, 2),
        ("/favicon.png", 64, 2),
        ("/favicon.ico", 32, 2),
        ("/logo.svg", 1024, 1),
        ("/logo.png", 256, 1),
    ] {
        push_website_icon_candidate(
            &mut result.candidates,
            page_url,
            path,
            declared_size,
            source_priority,
        );
    }
    for manifest_path in [
        "/site.webmanifest",
        "/manifest.webmanifest",
        "/manifest.json",
    ] {
        push_unique_http_url(&mut result.manifests, page_url, manifest_path);
    }
    if result.browser_configs.is_empty() {
        push_unique_http_url(&mut result.browser_configs, page_url, "/browserconfig.xml");
    }

    result
}

fn extend_candidates_from_link_headers(
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

fn external_favicon_candidates(
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

fn website_manifest_icon_candidates(
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

fn website_browser_config_icon_candidates(
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

fn sort_and_deduplicate_website_icon_candidates(candidates: &mut Vec<WebsiteIconCandidate>) {
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

fn website_icon_quality(
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
    let square_score = ((min_dimension as u64 * 1000) / max_dimension as u64) as u16;

    WebsiteIconQuality {
        resolution_tier,
        square_score,
        min_dimension,
        max_dimension,
        declared_size: candidate.declared_size,
        source_priority: candidate.source_priority,
        discovery_order: Reverse(candidate.discovery_index),
    }
}

fn has_visible_icon_content(image: &image::DynamicImage) -> bool {
    let rgba = image.to_rgba8();
    let sample_step = (rgba.width().max(rgba.height()) / 128).max(1) as usize;
    (0..rgba.height() as usize).step_by(sample_step).any(|y| {
        (0..rgba.width() as usize)
            .step_by(sample_step)
            .any(|x| rgba.get_pixel(x as u32, y as u32)[3] >= 16)
    })
}

fn render_svg_website_icon(bytes: &[u8]) -> Option<image::DynamicImage> {
    let options = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_data(bytes, &options).ok()?;
    let svg_size = tree.size();
    let width = svg_size.width();
    let height = svg_size.height();
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return None;
    }

    let scale = ICON_OPTIMIZED_OUTPUT_SIZE as f32 / width.max(height);
    let output_width = (width * scale)
        .ceil()
        .clamp(1.0, ICON_OPTIMIZED_OUTPUT_SIZE as f32) as u32;
    let output_height = (height * scale)
        .ceil()
        .clamp(1.0, ICON_OPTIMIZED_OUTPUT_SIZE as f32) as u32;
    let mut pixmap = resvg::tiny_skia::Pixmap::new(output_width, output_height)?;
    let transform = resvg::tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    let mut rgba = Vec::with_capacity((output_width * output_height * 4) as usize);
    for pixel in pixmap.pixels() {
        let color = pixel.demultiply();
        rgba.extend_from_slice(&[color.red(), color.green(), color.blue(), color.alpha()]);
    }
    let buffer = image::ImageBuffer::from_raw(output_width, output_height, rgba)?;
    Some(image::DynamicImage::ImageRgba8(buffer))
}

fn decode_data_url_bytes(url: &Url) -> Option<Vec<u8>> {
    let value = url.as_str().strip_prefix("data:")?;
    let (metadata, payload) = value.split_once(',')?;
    if metadata
        .split(';')
        .any(|value| value.eq_ignore_ascii_case("base64"))
    {
        base64::engine::general_purpose::STANDARD
            .decode(payload.as_bytes())
            .ok()
    } else {
        Some(percent_decode_str(payload).collect())
    }
}

fn decode_website_icon(bytes: &[u8]) -> Option<image::DynamicImage> {
    image::load_from_memory(bytes)
        .ok()
        .or_else(|| render_svg_website_icon(bytes))
}

fn icon_edge_contrast_score(image: &image::DynamicImage) -> f32 {
    let rgba = image.to_rgba8();
    let width = rgba.width();
    let height = rgba.height();
    if width < 2 || height < 2 {
        return 0.0;
    }

    let sample_step = (width.max(height) / 128).max(1) as usize;
    let mut contrast_sum = 0u64;
    let mut sample_count = 0u64;
    let luma = |pixel: &image::Rgba<u8>| -> i32 {
        (pixel[0] as i32 * 77 + pixel[1] as i32 * 150 + pixel[2] as i32 * 29) >> 8
    };

    for y in (sample_step..height as usize).step_by(sample_step) {
        for x in (sample_step..width as usize).step_by(sample_step) {
            let center = rgba.get_pixel(x as u32, y as u32);
            if center[3] < 16 {
                continue;
            }
            let left = rgba.get_pixel((x - sample_step) as u32, y as u32);
            let top = rgba.get_pixel(x as u32, (y - sample_step) as u32);
            let center_luma = luma(center);
            contrast_sum += center_luma.abs_diff(luma(left)) as u64;
            contrast_sum += center_luma.abs_diff(luma(top)) as u64;
            sample_count += 2;
        }
    }

    if sample_count == 0 {
        0.0
    } else {
        contrast_sum as f32 / sample_count as f32
    }
}

fn icon_sharpen_settings(image: &image::DynamicImage) -> IconSharpenSettings {
    let min_dimension = image.width().min(image.height());
    let edge_contrast = icon_edge_contrast_score(image);

    if min_dimension <= 64 || edge_contrast < 6.0 {
        IconSharpenSettings {
            sigma: 1.2,
            threshold: 1,
        }
    } else if min_dimension <= 128 || edge_contrast < 14.0 {
        IconSharpenSettings {
            sigma: 1.05,
            threshold: 1,
        }
    } else {
        IconSharpenSettings {
            sigma: 0.9,
            threshold: 2,
        }
    }
}

fn sharpen_icon_preserving_alpha(
    resized: image::DynamicImage,
    settings: IconSharpenSettings,
) -> image::DynamicImage {
    let original = resized.to_rgba8();
    let mut premultiplied = original.clone();
    for pixel in premultiplied.pixels_mut() {
        let alpha = pixel[3] as u16;
        pixel[0] = ((pixel[0] as u16 * alpha + 127) / 255) as u8;
        pixel[1] = ((pixel[1] as u16 * alpha + 127) / 255) as u8;
        pixel[2] = ((pixel[2] as u16 * alpha + 127) / 255) as u8;
    }

    let sharpened = image::DynamicImage::ImageRgba8(premultiplied)
        .unsharpen(settings.sigma, settings.threshold)
        .to_rgba8();
    let mut output = sharpened;
    for (output_pixel, original_pixel) in output.pixels_mut().zip(original.pixels()) {
        let alpha = original_pixel[3] as u16;
        output_pixel[3] = original_pixel[3];
        if alpha == 0 {
            output_pixel[0] = 0;
            output_pixel[1] = 0;
            output_pixel[2] = 0;
            continue;
        }
        output_pixel[0] =
            ((output_pixel[0] as u32 * 255 + alpha as u32 / 2) / alpha as u32).min(255) as u8;
        output_pixel[1] =
            ((output_pixel[1] as u32 * 255 + alpha as u32 / 2) / alpha as u32).min(255) as u8;
        output_pixel[2] =
            ((output_pixel[2] as u32 * 255 + alpha as u32 / 2) / alpha as u32).min(255) as u8;
    }

    image::DynamicImage::ImageRgba8(output)
}

fn optimize_icon_pixels(image: &image::DynamicImage, size: u32) -> image::DynamicImage {
    let settings = icon_sharpen_settings(image);
    let resized = image.resize(size, size, image::imageops::FilterType::Lanczos3);
    sharpen_icon_preserving_alpha(resized, settings)
}

pub fn optimize_icon_data_uri(data_uri: &str) -> Result<String, String> {
    let icon_data = decode_data_uri(data_uri)?;
    let source_image = image::load_from_memory(&icon_data)
        .map_err(|error| format!("Failed to decode icon for optimization: {error}"))?;
    let optimized = optimize_icon_pixels(&source_image, ICON_OPTIMIZED_OUTPUT_SIZE);
    let mut output = Cursor::new(Vec::new());
    optimized
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|error| format!("Failed to encode optimized icon: {error}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(output.into_inner())
    ))
}

fn website_icon_to_data_uri(image: &image::DynamicImage) -> Result<String, String> {
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|error| format!("Failed to encode website icon: {error}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(output.into_inner())
    ))
}

fn website_icon_data_uris(
    mut decoded_candidates: Vec<(WebsiteIconQuality, image::DynamicImage)>,
) -> Vec<String> {
    decoded_candidates.sort_by_key(|(quality, _)| Reverse(*quality));
    let mut seen_icons = HashSet::new();
    decoded_candidates
        .into_iter()
        .filter_map(|(_, image)| website_icon_to_data_uri(&image).ok())
        .filter(|icon| seen_icons.insert(icon.clone()))
        .take(MAX_WEBSITE_ICON_RESULTS)
        .collect()
}

pub async fn extract_website_icon(value: String) -> Result<WebsiteIconResult, String> {
    let url = normalize_website_url(&value)?;
    let mut default_headers = reqwest::header::HeaderMap::new();
    default_headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,*/*;q=0.8",
        ),
    );
    default_headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        reqwest::header::HeaderValue::from_static("zh-CN,zh;q=0.9,en;q=0.8"),
    );
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(Duration::from_secs(12))
        .cookie_store(true)
        .user_agent(concat!(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ",
            "AppleWebKit/537.36 (KHTML, like Gecko) ",
            "Chrome/138.0.0.0 Safari/537.36 DesktopGo/",
            env!("CARGO_PKG_VERSION")
        ))
        .default_headers(default_headers)
        .build()
        .map_err(|error| format!("Failed to initialize website request: {error}"))?;

    let mut page_url = url.clone();
    let mut page_candidates = website_icon_candidates("", &url);
    let mut page_link_headers = Vec::new();
    let mut current_url = url.clone();
    let mut seen_pages = HashSet::new();
    for _ in 0..=MAX_CLIENT_REDIRECTS {
        if !seen_pages.insert(current_url.as_str().to_string()) {
            break;
        }
        page_url = current_url.clone();
        let Ok(response) = client.get(current_url.clone()).send().await else {
            break;
        };
        page_url = response.url().clone();
        let Ok(page_response) = read_response_limited(response, MAX_WEBSITE_HTML_BYTES).await
        else {
            page_candidates = website_icon_candidates("", &page_url);
            break;
        };
        page_url = page_response.final_url.clone();
        let html = String::from_utf8_lossy(&page_response.bytes);
        let discovered = website_icon_candidates(&html, &page_url);
        if let Some(redirect) = discovered.redirect.clone() {
            if !seen_pages.contains(redirect.as_str()) {
                current_url = redirect;
                continue;
            }
        }
        page_link_headers = page_response.link_headers;
        page_candidates = discovered;
        break;
    }

    let linked_candidate_count = page_candidates.candidates.len();
    let linked_manifest_count = page_candidates.manifests.len();
    extend_candidates_from_link_headers(
        &page_link_headers,
        &page_url,
        &mut page_candidates.candidates,
        &mut page_candidates.manifests,
    );
    if page_candidates.candidates.len() > linked_candidate_count
        || page_candidates.manifests.len() > linked_manifest_count
    {
        page_candidates.has_explicit_sources = true;
    }

    if !page_candidates.has_explicit_sources {
        for stylesheet_url in page_candidates
            .stylesheets
            .clone()
            .into_iter()
            .take(MAX_STYLESHEET_REQUESTS)
        {
            let Ok(response) = client
                .get(stylesheet_url)
                .header(reqwest::header::REFERER, page_url.as_str())
                .send()
                .await
            else {
                continue;
            };
            let Ok(stylesheet) =
                read_response_limited(response, MAX_WEBSITE_FRONTEND_ASSET_BYTES).await
            else {
                continue;
            };
            let css = String::from_utf8_lossy(&stylesheet.bytes);
            collect_css_icon_candidates(
                &css,
                &stylesheet.final_url,
                &mut page_candidates.candidates,
                2,
            );
        }

        for script_url in page_candidates
            .scripts
            .clone()
            .into_iter()
            .take(MAX_SCRIPT_REQUESTS)
        {
            let Ok(response) = client
                .get(script_url)
                .header(reqwest::header::REFERER, page_url.as_str())
                .send()
                .await
            else {
                continue;
            };
            let Ok(script) =
                read_response_limited(response, MAX_WEBSITE_FRONTEND_ASSET_BYTES).await
            else {
                continue;
            };
            let source = String::from_utf8_lossy(&script.bytes);
            collect_frontend_asset_candidates(
                &source,
                &script.final_url,
                &mut page_candidates.candidates,
            );
        }
    }

    for manifest_url in page_candidates
        .manifests
        .clone()
        .into_iter()
        .take(MAX_MANIFEST_REQUESTS)
    {
        let Ok(response) = client
            .get(manifest_url.clone())
            .header(reqwest::header::REFERER, page_url.as_str())
            .send()
            .await
        else {
            continue;
        };
        let Ok(manifest) = read_response_limited(response, MAX_WEBSITE_MANIFEST_BYTES).await else {
            continue;
        };
        let discovery_index = page_candidates.candidates.len();
        page_candidates
            .candidates
            .extend(website_manifest_icon_candidates(
                &manifest.bytes,
                &manifest.final_url,
                discovery_index,
            ));
    }

    for config_url in page_candidates
        .browser_configs
        .clone()
        .into_iter()
        .take(MAX_BROWSER_CONFIG_REQUESTS)
    {
        let Ok(response) = client
            .get(config_url)
            .header(reqwest::header::REFERER, page_url.as_str())
            .send()
            .await
        else {
            continue;
        };
        let Ok(config) = read_response_limited(response, MAX_WEBSITE_MANIFEST_BYTES).await else {
            continue;
        };
        let discovery_index = page_candidates.candidates.len();
        page_candidates
            .candidates
            .extend(website_browser_config_icon_candidates(
                &config.bytes,
                &config.final_url,
                discovery_index,
            ));
    }

    sort_and_deduplicate_website_icon_candidates(&mut page_candidates.candidates);
    let asset_referer = page_url.clone();
    let mut decoded_candidates = stream::iter(
        page_candidates
            .candidates
            .into_iter()
            .take(MAX_WEBSITE_ICON_CANDIDATES),
    )
    .map(|candidate| {
        let client = client.clone();
        let asset_referer = asset_referer.clone();
        async move {
            let bytes = if candidate.url.scheme() == "data" {
                decode_data_url_bytes(&candidate.url)?
            } else {
                let response = client
                    .get(candidate.url.clone())
                    .header(reqwest::header::REFERER, asset_referer.as_str())
                    .send()
                    .await
                    .ok()?;
                read_response_limited(response, MAX_WEBSITE_ICON_BYTES)
                    .await
                    .ok()?
                    .bytes
            };
            let image = decode_website_icon(&bytes)?;
            if !has_visible_icon_content(&image) {
                return None;
            }
            let quality = website_icon_quality(&image, &candidate);
            Some((quality, image))
        }
    })
    .buffer_unordered(MAX_CONCURRENT_WEBSITE_ICON_REQUESTS)
    .filter_map(|candidate| async move { candidate })
    .collect::<Vec<_>>()
    .await;

    if decoded_candidates.is_empty() {
        decoded_candidates = stream::iter(external_favicon_candidates(&page_url, 0))
            .map(|candidate| {
                let client = client.clone();
                async move {
                    let response = client.get(candidate.url.clone()).send().await.ok()?;
                    let bytes =
                        read_response_bytes_limited_any_status(response, MAX_WEBSITE_ICON_BYTES)
                            .await?;
                    let image = decode_website_icon(&bytes)?;
                    if !has_visible_icon_content(&image) {
                        return None;
                    }
                    let quality = website_icon_quality(&image, &candidate);
                    Some((quality, image))
                }
            })
            .buffer_unordered(2)
            .filter_map(|candidate| async move { candidate })
            .collect::<Vec<_>>()
            .await;
    }

    let icons = website_icon_data_uris(decoded_candidates);
    let icon_base64 = icons.first().cloned().unwrap_or_default();

    Ok(WebsiteIconResult {
        url: url.to_string(),
        title: if page_candidates.title.is_empty() {
            page_url.host_str().unwrap_or_default().to_string()
        } else {
            page_candidates.title
        },
        icon_base64,
        icons,
    })
}

#[cfg(test)]
mod website_icon_tests {
    use super::*;

    fn candidate(url: &str, declared_size: u32, discovery_index: usize) -> WebsiteIconCandidate {
        WebsiteIconCandidate {
            url: Url::parse(url).expect("valid test URL"),
            declared_size,
            source_priority: 3,
            discovery_index,
        }
    }

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
            <html>
              <head>
                <title>Example</title>
                <link rel="icon" href="/__aisys__/brand-icon.svg" type="image/svg+xml">
                <link rel="icon" sizes="16x16 32x32" href="/favicon-32.png">
                <link rel="apple-touch-icon" sizes="180x180" href="touch.png">
                <link rel="manifest" href="/app.webmanifest">
                <meta property="og:image" content="/social-card.png">
                <script type="application/ld+json">
                  {"@type":"Organization","logo":"/structured-logo.png"}
                </script>
              </head>
              <body><img class="site-logo" src="/brand/logo-256.png" srcset="/brand/logo-512.png 512w" width="256"></body>
            </html>
        "#;

        let page = website_icon_candidates(html, &page_url);
        let title = page.title;
        let candidates = page.candidates;
        let manifests = page.manifests;

        assert_eq!(title, "Example");
        assert!(candidates.iter().any(|candidate| {
            candidate.url.as_str() == "https://example.com/path/touch.png"
                && candidate.declared_size == 180
        }));
        assert!(candidates.iter().any(|candidate| {
            candidate.url.as_str() == "https://example.com/brand/logo-512.png"
                && candidate.declared_size == 512
        }));
        assert!(candidates.iter().any(|candidate| {
            candidate.url.as_str() == "https://example.com/__aisys__/brand-icon.svg"
        }));
        assert!(candidates
            .iter()
            .any(|candidate| candidate.url.as_str() == "https://example.com/social-card.png"));
        assert!(candidates.iter().any(|candidate| {
            candidate.url.as_str() == "https://example.com/structured-logo.png"
        }));
        assert_eq!(manifests[0].as_str(), "https://example.com/app.webmanifest");

        let manifest = br#"{
            "icons": [
                {"src": "icons/app-192.png", "sizes": "192x192"},
                {"src": "/icons/app-512.png", "sizes": "512x512"}
            ]
        }"#;
        let manifest_candidates =
            website_manifest_icon_candidates(manifest, &manifests[0], candidates.len());
        assert_eq!(manifest_candidates.len(), 2);
        assert_eq!(manifest_candidates[1].declared_size, 512);
        assert_eq!(
            manifest_candidates[1].url.as_str(),
            "https://example.com/icons/app-512.png"
        );
    }

    #[test]
    fn parses_base_lazy_css_inline_svg_noscript_and_client_redirects() {
        let page_url = Url::parse("https://example.com/app/login").expect("valid page URL");
        let html = r#"
            <html>
              <head>
                <base href="https://cdn.example.com/ui/">
                <meta http-equiv="refresh" content="0; url=../dashboard">
                <style>.brand-logo { background-image: url('./brand/logo-bg.png'); }</style>
              </head>
              <body>
                <img class="site-logo" data-src="images/lazy-logo.webp">
                <picture class="brand-logo"><source data-srcset="images/logo-256.png 256w, images/logo-512.png 512w"></picture>
                <svg aria-label="Company logo" viewBox="0 0 128 128"><path d="M0 0h128v128H0z"/></svg>
                <noscript><img alt="site logo" src="images/noscript.png"></noscript>
              </body>
            </html>
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
            assert!(
                page.candidates
                    .iter()
                    .any(|candidate| candidate.url.as_str() == expected),
                "missing {expected}; found {:?}",
                page.candidates
                    .iter()
                    .map(|candidate| candidate.url.as_str())
                    .collect::<Vec<_>>()
            );
        }
        let inline_svg = page
            .candidates
            .iter()
            .find(|candidate| candidate.url.scheme() == "data")
            .expect("inline SVG candidate");
        let inline_svg_bytes = decode_data_url_bytes(&inline_svg.url).expect("decode inline SVG");
        assert!(decode_website_icon(&inline_svg_bytes).is_some());
    }

    #[test]
    fn parses_javascript_location_redirects() {
        let page_url = Url::parse("https://dash.example.com/").expect("valid page URL");
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
        let manifest = br#"{
            "icons": [{"src":"app.png","sizes":"512x512","purpose":"any maskable"}],
            "shortcuts": [{"icons":[{"src":"shortcut.png","sizes":"192x192"}]}]
        }"#;
        let manifest_candidates = website_manifest_icon_candidates(manifest, &manifest_url, 0);
        assert_eq!(manifest_candidates.len(), 2);
        assert_eq!(
            manifest_candidates[1].url.as_str(),
            "https://example.com/shortcut.png"
        );

        let config = br#"<browserconfig><msapplication><tile><square150x150logo src="/mstile.png"/></tile></msapplication></browserconfig>"#;
        let config_candidates = website_browser_config_icon_candidates(config, &manifest_url, 0);
        assert_eq!(config_candidates.len(), 1);
        assert_eq!(
            config_candidates[0].url.as_str(),
            "https://example.com/mstile.png"
        );
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
        let tiny = image::DynamicImage::new_rgba8(16, 16);
        let touch = image::DynamicImage::new_rgba8(180, 180);
        let wide = image::DynamicImage::new_rgba8(1200, 630);
        let tiny_quality =
            website_icon_quality(&tiny, &candidate("https://example.com/favicon.ico", 16, 0));
        let touch_quality =
            website_icon_quality(&touch, &candidate("https://example.com/touch.png", 180, 1));
        let wide_quality =
            website_icon_quality(&wide, &candidate("https://example.com/banner.png", 1200, 2));

        assert!(touch_quality > tiny_quality);
        assert!(touch_quality > wide_quality);
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
        let center = image.to_rgba8().get_pixel(256, 256).0;
        assert_eq!(center, [0x16, 0x77, 0xff, 0xff]);
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
        assert_eq!(candidates[0].url.as_str(), "https://example.com/icon.png");
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
        let data_uri = website_icon_to_data_uri(&source).expect("encode website icon");
        let data = decode_data_uri(&data_uri).expect("decode website icon data URI");
        let decoded = image::load_from_memory(&data).expect("decode website icon image");

        assert_eq!((decoded.width(), decoded.height()), (1024, 768));
    }

    #[cfg(windows)]
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
            .expect("encode JPEG image");
        let original_bytes = encoded.into_inner();
        let path = std::env::temp_dir().join(format!("desktopgo-{}.png", uuid::Uuid::new_v4()));
        std::fs::write(&path, &original_bytes).expect("write misleading image file");

        let data_uri = get_custom_icon_source(path.to_string_lossy().as_ref())
            .expect("load custom image source");
        let _ = std::fs::remove_file(path);
        assert!(data_uri.starts_with("data:image/jpeg;base64,"));
        let decoded_bytes = decode_data_uri(&data_uri).expect("decode custom image data URI");
        let decoded = image::load_from_memory(&decoded_bytes).expect("decode custom image PNG");

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
            .expect("encode source icon");
        let data_uri = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(encoded.into_inner())
        );

        let optimized = optimize_icon_data_uri(&data_uri).expect("optimize icon");
        let optimized_bytes = decode_data_uri(&optimized).expect("decode optimized icon");
        let optimized_image =
            image::load_from_memory(&optimized_bytes).expect("load optimized icon");

        assert_eq!(optimized_image.width(), ICON_OPTIMIZED_OUTPUT_SIZE);
        assert_eq!(optimized_image.height(), ICON_OPTIMIZED_OUTPUT_SIZE);
    }

    #[test]
    fn adapts_sharpening_strength_and_preserves_resized_alpha() {
        let tiny = image::DynamicImage::new_rgba8(32, 32);
        let tiny_settings = icon_sharpen_settings(&tiny);
        assert_eq!(tiny_settings.sigma, 1.2);
        assert_eq!(tiny_settings.threshold, 1);

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
            .all(|(optimized_pixel, resized_pixel)| optimized_pixel[3] == resized_pixel[3]));
    }
}
