use futures_util::StreamExt;
use std::time::Duration;
use url::Url;

pub(super) struct WebsiteResponse {
    pub(super) final_url: Url,
    pub(super) bytes: Vec<u8>,
    pub(super) link_headers: Vec<String>,
}

pub(super) fn build_client() -> Result<reqwest::Client, String> {
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
    reqwest::Client::builder()
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
        .map_err(|error| format!("Failed to initialize website request: {error}"))
}

pub(super) async fn read_response_limited(
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

pub(super) async fn read_response_bytes_limited_any_status(
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
