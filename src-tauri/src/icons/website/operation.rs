use futures_util::{stream, StreamExt};
use std::collections::HashSet;
use url::Url;

use super::candidate::{
    extend_candidates_from_link_headers, external_favicon_candidates,
    sort_and_deduplicate_website_icon_candidates, website_browser_config_icon_candidates,
    website_manifest_icon_candidates, WebsiteIconCandidate, WebsitePageCandidates,
};
use super::document::{normalize_website_url, website_icon_candidates};
use super::document_assets::{collect_css_icon_candidates, collect_frontend_asset_candidates};
use super::http::{build_client, read_response_bytes_limited_any_status, read_response_limited};
use super::image::{decode_candidate, decode_data_url_bytes, website_icon_data_uris};
use crate::icons::models::WebsiteIconResult;

const MAX_WEBSITE_HTML_BYTES: usize = 2 * 1024 * 1024;
const MAX_WEBSITE_ICON_BYTES: usize = 5 * 1024 * 1024;
const MAX_WEBSITE_MANIFEST_BYTES: usize = 1024 * 1024;
const MAX_WEBSITE_FRONTEND_ASSET_BYTES: usize = 2 * 1024 * 1024;
const MAX_WEBSITE_ICON_CANDIDATES: usize = 40;
const MAX_CONCURRENT_WEBSITE_ICON_REQUESTS: usize = 6;
const MAX_CLIENT_REDIRECTS: usize = 3;
const MAX_MANIFEST_REQUESTS: usize = 4;
const MAX_BROWSER_CONFIG_REQUESTS: usize = 2;
const MAX_STYLESHEET_REQUESTS: usize = 4;
const MAX_SCRIPT_REQUESTS: usize = 3;

async fn load_page_candidates(
    client: &reqwest::Client,
    url: &Url,
) -> (Url, WebsitePageCandidates, Vec<String>) {
    let mut page_url = url.clone();
    let mut page_candidates = website_icon_candidates("", url);
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
        let discovered =
            website_icon_candidates(&String::from_utf8_lossy(&page_response.bytes), &page_url);
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
    (page_url, page_candidates, page_link_headers)
}

async fn load_frontend_candidates(
    client: &reqwest::Client,
    page_url: &Url,
    page_candidates: &mut WebsitePageCandidates,
) {
    if page_candidates.has_explicit_sources {
        return;
    }
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
        collect_css_icon_candidates(
            &String::from_utf8_lossy(&stylesheet.bytes),
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
        let Ok(script) = read_response_limited(response, MAX_WEBSITE_FRONTEND_ASSET_BYTES).await
        else {
            continue;
        };
        collect_frontend_asset_candidates(
            &String::from_utf8_lossy(&script.bytes),
            &script.final_url,
            &mut page_candidates.candidates,
        );
    }
}

async fn load_metadata_candidates(
    client: &reqwest::Client,
    page_url: &Url,
    page_candidates: &mut WebsitePageCandidates,
) {
    for manifest_url in page_candidates
        .manifests
        .clone()
        .into_iter()
        .take(MAX_MANIFEST_REQUESTS)
    {
        let Ok(response) = client
            .get(manifest_url)
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
}

async fn decode_candidates(
    client: &reqwest::Client,
    page_url: &Url,
    candidates: Vec<WebsiteIconCandidate>,
) -> Vec<(super::candidate::WebsiteIconQuality, image::DynamicImage)> {
    stream::iter(candidates.into_iter().take(MAX_WEBSITE_ICON_CANDIDATES))
        .map(|candidate| {
            let client = client.clone();
            let asset_referer = page_url.clone();
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
                decode_candidate(&bytes, &candidate)
            }
        })
        .buffer_unordered(MAX_CONCURRENT_WEBSITE_ICON_REQUESTS)
        .filter_map(|candidate| async move { candidate })
        .collect()
        .await
}

async fn decode_external_candidates(
    client: &reqwest::Client,
    page_url: &Url,
) -> Vec<(super::candidate::WebsiteIconQuality, image::DynamicImage)> {
    stream::iter(external_favicon_candidates(page_url, 0))
        .map(|candidate| {
            let client = client.clone();
            async move {
                let response = client.get(candidate.url.clone()).send().await.ok()?;
                let bytes =
                    read_response_bytes_limited_any_status(response, MAX_WEBSITE_ICON_BYTES)
                        .await?;
                decode_candidate(&bytes, &candidate)
            }
        })
        .buffer_unordered(2)
        .filter_map(|candidate| async move { candidate })
        .collect()
        .await
}

pub(super) async fn extract_website_icon(value: String) -> Result<WebsiteIconResult, String> {
    let url = normalize_website_url(&value)?;
    let client = build_client()?;
    let (page_url, mut page_candidates, page_link_headers) =
        load_page_candidates(&client, &url).await;

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

    load_frontend_candidates(&client, &page_url, &mut page_candidates).await;
    load_metadata_candidates(&client, &page_url, &mut page_candidates).await;
    sort_and_deduplicate_website_icon_candidates(&mut page_candidates.candidates);

    let mut decoded = decode_candidates(&client, &page_url, page_candidates.candidates).await;
    if decoded.is_empty() {
        decoded = decode_external_candidates(&client, &page_url).await;
    }
    let icons = website_icon_data_uris(decoded);
    Ok(WebsiteIconResult {
        url: url.to_string(),
        title: if page_candidates.title.is_empty() {
            page_url.host_str().unwrap_or_default().to_string()
        } else {
            page_candidates.title
        },
        icon_base64: icons.first().cloned().unwrap_or_default(),
        icons,
    })
}
