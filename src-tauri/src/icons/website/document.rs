use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};
use url::Url;

use super::candidate::{
    declared_website_icon_size, push_unique_http_url, push_website_icon_candidate,
    resolve_website_asset_url, WebsitePageCandidates,
};
use super::document_assets::{
    best_srcset_candidate, collect_document_css_candidates, collect_image_candidates,
    collect_inline_svg_candidates, collect_json_logo_values, document_base_url,
    looks_like_website_icon,
};

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

pub(in crate::icons) fn normalize_website_url(value: &str) -> Result<Url, String> {
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
        if let Some(url) = META_REFRESH_URL_RE
            .captures(content)
            .and_then(|captures| captures.get(1))
            .and_then(|capture| resolve_website_asset_url(base_url, capture.as_str()))
            .filter(|url| matches!(url.scheme(), "http" | "https"))
        {
            return Some(url);
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

pub(super) fn website_icon_candidates(html: &str, page_url: &Url) -> WebsitePageCandidates {
    let document = Html::parse_document(html);
    let base_url = document_base_url(&document, page_url);
    let mut result = WebsitePageCandidates {
        title: document_title(&document),
        redirect: client_side_redirect(&document, &base_url),
        ..WebsitePageCandidates::default()
    };

    collect_link_candidates(&document, &base_url, &mut result);
    collect_script_urls(&document, &base_url, &mut result);
    collect_image_candidates(&document, &base_url, &mut result.candidates);
    collect_document_css_candidates(&document, &base_url, &mut result.candidates);
    collect_inline_svg_candidates(&document, &base_url, &mut result.candidates);
    collect_noscript_candidates(&document, &base_url, &mut result);
    collect_meta_candidates(&document, &base_url, &mut result);
    collect_json_ld_candidates(&document, &base_url, &mut result);

    result.has_explicit_sources = !result.candidates.is_empty() || !result.manifests.is_empty();
    append_default_candidates(page_url, &mut result);
    result
}

fn document_title(document: &Html) -> String {
    let selector = Selector::parse("title").expect("valid title selector");
    document
        .select(&selector)
        .next()
        .map(|element| element.text().collect::<String>().trim().to_string())
        .unwrap_or_default()
}

fn rel_contains(rel: &str, expected: &str) -> bool {
    rel.split_ascii_whitespace()
        .any(|value| value.eq_ignore_ascii_case(expected))
}

fn collect_link_candidates(document: &Html, base_url: &Url, result: &mut WebsitePageCandidates) {
    let selector = Selector::parse("link").expect("valid link selector");
    for element in document.select(&selector) {
        let rel = element.value().attr("rel").unwrap_or_default();
        let href = element.value().attr("href").unwrap_or_default();
        if rel_contains(rel, "manifest") {
            push_unique_http_url(&mut result.manifests, base_url, href);
        }
        if rel_contains(rel, "stylesheet") {
            push_unique_http_url(&mut result.stylesheets, base_url, href);
        }

        let is_apple_touch_icon = rel_contains(rel, "apple-touch-icon")
            || rel_contains(rel, "apple-touch-icon-precomposed");
        let is_icon = is_apple_touch_icon
            || ["icon", "mask-icon", "fluid-icon", "logo", "image_src"]
                .iter()
                .any(|expected| rel_contains(rel, expected));
        let is_image_preload = rel_contains(rel, "preload")
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
                base_url,
                href,
                declared_website_icon_size(element.value().attr("sizes")),
                priority,
            );
            if let Some((source, declared_size)) =
                best_srcset_candidate(element.value().attr("imagesrcset").unwrap_or_default())
            {
                push_website_icon_candidate(
                    &mut result.candidates,
                    base_url,
                    source,
                    declared_size,
                    priority,
                );
            }
        }
    }
}

fn collect_script_urls(document: &Html, base_url: &Url, result: &mut WebsitePageCandidates) {
    let selector = Selector::parse("script[src]").expect("valid script selector");
    for element in document.select(&selector) {
        push_unique_http_url(
            &mut result.scripts,
            base_url,
            element.value().attr("src").unwrap_or_default(),
        );
    }
}

fn collect_noscript_candidates(
    document: &Html,
    base_url: &Url,
    result: &mut WebsitePageCandidates,
) {
    let selector = Selector::parse("noscript").expect("valid noscript selector");
    for element in document.select(&selector) {
        let text_content = element.text().collect::<String>();
        let fragment_source = if text_content.trim().is_empty() {
            element.inner_html()
        } else {
            text_content
        };
        let fragment = Html::parse_fragment(&fragment_source);
        collect_image_candidates(&fragment, base_url, &mut result.candidates);
        collect_document_css_candidates(&fragment, base_url, &mut result.candidates);
        collect_inline_svg_candidates(&fragment, base_url, &mut result.candidates);
    }
}

fn collect_meta_candidates(document: &Html, base_url: &Url, result: &mut WebsitePageCandidates) {
    let selector = Selector::parse("meta[content]").expect("valid meta selector");
    for element in document.select(&selector) {
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
                push_unique_http_url(&mut result.browser_configs, base_url, content);
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
            push_website_icon_candidate(&mut result.candidates, base_url, content, 0, 3);
        }
    }
}

fn collect_json_ld_candidates(document: &Html, base_url: &Url, result: &mut WebsitePageCandidates) {
    let selector =
        Selector::parse("script[type='application/ld+json']").expect("valid JSON-LD selector");
    for element in document.select(&selector) {
        let Ok(value) =
            serde_json::from_str::<serde_json::Value>(&element.text().collect::<String>())
        else {
            continue;
        };
        let mut logos = Vec::new();
        collect_json_logo_values(&value, &mut logos);
        for logo in logos {
            push_website_icon_candidate(&mut result.candidates, base_url, &logo, 0, 3);
        }
    }
}

fn append_default_candidates(page_url: &Url, result: &mut WebsitePageCandidates) {
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
}
