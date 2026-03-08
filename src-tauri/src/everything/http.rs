use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;

use super::models::{SearchHit, SearchQuery, SearchSort};

const DEFAULT_HTTP_PORT: u16 = 80;
const HTTP_TIMEOUT_SECS: u64 = 3;
const EVERYTHING_HIDDEN_FILTER: &str = "!attrib:h";

#[derive(Debug, Clone, Copy)]
pub struct HttpServerConfig {
    pub port: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpSearchResponse {
    #[allow(dead_code)]
    total_results: Option<u64>,
    #[serde(default)]
    results: Vec<HttpSearchResult>,
}

#[derive(Debug, Deserialize)]
struct HttpSearchResult {
    #[serde(default)]
    name: String,
    #[serde(default)]
    path: String,
}

fn percent_encode(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        let ch = *byte as char;
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~') {
            encoded.push(ch);
        } else {
            encoded.push('%');
            encoded.push_str(&format!("{:02X}", byte));
        }
    }
    encoded
}

fn sanitize_keyword(keyword: &str) -> (String, bool) {
    let mut removed_hidden_filter = false;
    let sanitized_terms = keyword
        .split_whitespace()
        .filter(|term| {
            let keep = *term != EVERYTHING_HIDDEN_FILTER;
            if !keep {
                removed_hidden_filter = true;
            }
            keep
        })
        .collect::<Vec<_>>();
    (sanitized_terms.join(" "), removed_hidden_filter)
}

fn build_query_string(config: HttpServerConfig, query: Option<&SearchQuery>) -> String {
    let mut parts = vec!["json=1".to_string(), "path_column=1".to_string()];
    if let Some(query) = query {
        let (keyword, removed_hidden_filter) = sanitize_keyword(&query.keyword);
        if !keyword.is_empty() {
            parts.push(format!("search={}", percent_encode(&keyword)));
        }
        parts.push(format!("offset={}", query.offset));
        let count = if removed_hidden_filter {
            query.limit.saturating_mul(4).clamp(1, 200)
        } else {
            query.limit.max(1)
        };
        parts.push(format!("count={}", count));

        let (sort, ascending) = match query.sort {
            SearchSort::NameAsc => ("name", true),
            SearchSort::NameDesc => ("name", false),
            SearchSort::PathAsc => ("path", true),
            SearchSort::DateModifiedDesc => ("date-modified", false),
        };
        parts.push(format!("sort={}", sort));
        parts.push(format!("ascending={}", if ascending { 1 } else { 0 }));
    } else {
        parts.push("count=1".to_string());
    }

    let _ = config;
    format!("/?{}", parts.join("&"))
}

fn decode_chunked_body(input: &str) -> Result<String, String> {
    let mut rest = input;
    let mut body = String::new();

    loop {
        let Some(line_end) = rest.find("\r\n") else {
            return Err("Invalid chunked HTTP response".to_string());
        };
        let (size_line, after_size) = rest.split_at(line_end);
        let size = usize::from_str_radix(size_line.trim(), 16)
            .map_err(|error| format!("Invalid chunk size: {}", error))?;
        let after_size = &after_size[2..];
        if size == 0 {
            break;
        }
        if after_size.len() < size + 2 {
            return Err("Incomplete chunked HTTP body".to_string());
        }
        body.push_str(&after_size[..size]);
        rest = &after_size[size + 2..];
    }

    Ok(body)
}

fn send_http_request(port: u16, request_path: &str) -> Result<String, String> {
    let address = format!("127.0.0.1:{}", port);
    let mut stream = TcpStream::connect(&address)
        .map_err(|error| format!("Failed to connect to Everything HTTP server {}: {}", address, error))?;
    let timeout = Some(Duration::from_secs(HTTP_TIMEOUT_SECS));
    let _ = stream.set_read_timeout(timeout);
    let _ = stream.set_write_timeout(timeout);

    let request = format!(
        "GET {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        request_path, port
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("Failed to send Everything HTTP request: {}", error))?;

    let mut raw = String::new();
    stream
        .read_to_string(&mut raw)
        .map_err(|error| format!("Failed to read Everything HTTP response: {}", error))?;

    let Some((headers, body)) = raw.split_once("\r\n\r\n") else {
        return Err("Everything HTTP response was malformed".to_string());
    };
    if !headers.starts_with("HTTP/1.1 200") && !headers.starts_with("HTTP/1.0 200") {
        let status_line = headers.lines().next().unwrap_or("HTTP status unavailable");
        return Err(format!("Everything HTTP request failed: {}", status_line));
    }

    if headers.to_ascii_lowercase().contains("transfer-encoding: chunked") {
        return decode_chunked_body(body);
    }

    Ok(body.to_string())
}

fn parse_http_json(body: &str) -> Result<HttpSearchResponse, String> {
    serde_json::from_str(body)
        .map_err(|error| format!("Everything HTTP response returned invalid JSON: {}", error))
}

fn build_base_url(port: u16) -> Result<String, String> {
    if port == 0 {
        Err("Invalid Everything HTTP port 0".to_string())
    } else {
        Ok(format!("http://127.0.0.1:{}/", port))
    }
}

fn parse_ini_bool(content: &str, key: &str) -> Option<bool> {
    let prefix = format!("{}=", key);
    content
        .lines()
        .find_map(|line| line.strip_prefix(&prefix))
        .map(|value| value.trim() == "1")
}

fn parse_ini_u16(content: &str, key: &str) -> Option<u16> {
    let prefix = format!("{}=", key);
    content
        .lines()
        .find_map(|line| line.strip_prefix(&prefix))
        .and_then(|value| value.trim().parse::<u16>().ok())
}

#[cfg(windows)]
fn user_everything_ini_path() -> Option<PathBuf> {
    Some(
        PathBuf::from(std::env::var_os("APPDATA")?)
            .join("Everything")
            .join("Everything.ini"),
    )
}

#[cfg(not(windows))]
fn user_everything_ini_path() -> Option<PathBuf> {
    None
}

pub fn detect_http_server() -> Result<Option<HttpServerConfig>, String> {
    let Some(ini_path) = user_everything_ini_path() else {
        return Ok(None);
    };
    if !ini_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&ini_path)
        .map_err(|error| format!("Failed to read Everything config {:?}: {}", ini_path, error))?;
    let enabled = parse_ini_bool(&content, "http_server_enabled").unwrap_or(false);
    if !enabled {
        return Ok(None);
    }

    let port = parse_ini_u16(&content, "http_server_port").unwrap_or(DEFAULT_HTTP_PORT);
    Ok(Some(HttpServerConfig { port }))
}

#[cfg(windows)]
fn is_hidden_path(path: &str) -> bool {
    use std::os::windows::fs::MetadataExt;

    fs::metadata(path)
        .map(|metadata| metadata.file_attributes() & 0x2 != 0)
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn is_hidden_path(_path: &str) -> bool {
    false
}

pub fn probe(config: HttpServerConfig) -> Result<(), String> {
    let _ = build_base_url(config.port)?;
    let body = send_http_request(config.port, &build_query_string(config, None))?;
    let _: HttpSearchResponse = parse_http_json(&body)?;
    Ok(())
}

pub fn search(config: HttpServerConfig, query: &SearchQuery) -> Result<Vec<SearchHit>, String> {
    let body = send_http_request(config.port, &build_query_string(config, Some(query)))?;
    let payload = parse_http_json(&body)?;
    let (_, removed_hidden_filter) = sanitize_keyword(&query.keyword);

    let mut items = Vec::with_capacity(payload.results.len());
    for result in payload.results {
        let path = if result.path.is_empty() {
            result.name.clone()
        } else if result.name.is_empty() {
            result.path.clone()
        } else if result.path.ends_with('\\') {
            format!("{}{}", result.path, result.name)
        } else {
            format!("{}\\{}", result.path, result.name)
        };

        let metadata = fs::metadata(&path).ok();
        let is_folder = metadata.as_ref().map(|value| value.is_dir()).unwrap_or(false);
        let is_file = metadata.as_ref().map(|value| value.is_file()).unwrap_or(!is_folder);
        let name = if result.name.is_empty() {
            PathBuf::from(&path)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_string()
        } else {
            result.name
        };
        let parent = if result.path.is_empty() {
            PathBuf::from(&path)
                .parent()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_default()
        } else {
            result.path
        };

        if removed_hidden_filter && is_hidden_path(&path) {
            continue;
        }

        items.push(SearchHit {
            path,
            name,
            parent,
            is_file,
            is_folder,
            icon_base64: String::new(),
        });

        if items.len() >= query.limit as usize {
            break;
        }
    }

    Ok(items)
}
