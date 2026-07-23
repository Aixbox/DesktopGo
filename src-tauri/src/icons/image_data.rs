use base64::Engine;

pub(super) fn decode_data_uri(data_uri: &str) -> Result<Vec<u8>, String> {
    if data_uri.is_empty() {
        return Ok(Vec::new());
    }

    let (_, raw) = data_uri
        .split_once(',')
        .ok_or_else(|| "Invalid data URI for icon data".to_string())?;
    base64::engine::general_purpose::STANDARD
        .decode(raw)
        .map_err(|e| format!("Failed to decode icon base64 data: {}", e))
}
