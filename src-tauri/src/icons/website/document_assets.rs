use base64::Engine;
use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};
use url::Url;

use super::candidate::{push_website_icon_candidate, WebsiteIconCandidate};

static CSS_URL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)url\(\s*[\"']?([^\)\"']+)[\"']?\s*\)"#).expect("valid CSS URL regex")
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

pub(super) fn looks_like_website_icon(value: &str) -> bool {
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

pub(super) fn best_srcset_candidate(value: &str) -> Option<(&str, u32)> {
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

pub(super) fn collect_json_logo_values(value: &serde_json::Value, logos: &mut Vec<String>) {
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

pub(super) fn document_base_url(document: &Html, page_url: &Url) -> Url {
    let selector = Selector::parse("base[href]").expect("valid base URL selector");
    document
        .select(&selector)
        .next()
        .and_then(|element| element.value().attr("href"))
        .and_then(|value| page_url.join(value).ok())
        .filter(|url| matches!(url.scheme(), "http" | "https"))
        .unwrap_or_else(|| page_url.clone())
}

pub(super) fn collect_image_candidates(
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

pub(super) fn collect_css_icon_candidates(
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

pub(super) fn collect_frontend_asset_candidates(
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

pub(super) fn collect_document_css_candidates(
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

pub(super) fn collect_inline_svg_candidates(
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
