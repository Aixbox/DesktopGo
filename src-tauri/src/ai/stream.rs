use futures_util::StreamExt;
use serde_json::Value;

pub(super) async fn read_response_stream(response: reqwest::Response) -> Result<String, String> {
    read_sse_stream(response, StreamSurface::Responses).await
}

pub(super) async fn read_chat_completions_stream(
    response: reqwest::Response,
) -> Result<String, String> {
    read_sse_stream(response, StreamSurface::ChatCompletions).await
}

pub(super) async fn read_anthropic_stream(response: reqwest::Response) -> Result<String, String> {
    read_sse_stream(response, StreamSurface::Anthropic).await
}

async fn read_sse_stream(
    response: reqwest::Response,
    surface: StreamSurface,
) -> Result<String, String> {
    let mut bytes = response.bytes_stream();
    let mut decoder = SseDecoder::new(surface);

    while let Some(chunk) = bytes.next().await {
        let chunk = chunk.map_err(|error| format!("读取 AI 流式响应失败：{error}"))?;
        decoder.push(&chunk)?;
    }

    decoder.finish()
}

struct SseDecoder {
    buffer: Vec<u8>,
    content: String,
    surface: StreamSurface,
}

#[derive(Clone, Copy)]
enum StreamSurface {
    Responses,
    ChatCompletions,
    Anthropic,
}

impl SseDecoder {
    fn new(surface: StreamSurface) -> Self {
        Self {
            buffer: Vec::new(),
            content: String::new(),
            surface,
        }
    }

    fn push(&mut self, chunk: &[u8]) -> Result<(), String> {
        self.buffer.extend_from_slice(chunk);
        while let Some((frame_end, separator_len)) = find_frame_end(&self.buffer) {
            let frame = self.buffer[..frame_end].to_vec();
            self.buffer.drain(..frame_end + separator_len);
            let frame = decode_frame(frame)?;
            handle_frame(&frame, self.surface, &mut self.content)?;
        }
        Ok(())
    }

    fn finish(mut self) -> Result<String, String> {
        if !self.buffer.is_empty() {
            let frame = decode_frame(std::mem::take(&mut self.buffer))?;
            handle_frame(&frame, self.surface, &mut self.content)?;
        }
        if self.content.trim().is_empty() {
            return Err("AI 接口未返回有效内容。".to_string());
        }
        Ok(self.content)
    }
}

fn decode_frame(frame: Vec<u8>) -> Result<String, String> {
    String::from_utf8(frame).map_err(|error| format!("解析 AI SSE UTF-8 响应失败：{error}"))
}

fn find_frame_end(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = find_bytes(buffer, b"\n\n").map(|index| (index, 2));
    let crlf = find_bytes(buffer, b"\r\n\r\n").map(|index| (index, 4));
    match (lf, crlf) {
        (Some(left), Some(right)) => Some(if left.0 < right.0 { left } else { right }),
        (Some(index), None) | (None, Some(index)) => Some(index),
        (None, None) => None,
    }
}

fn find_bytes(buffer: &[u8], needle: &[u8]) -> Option<usize> {
    buffer
        .windows(needle.len())
        .position(|window| window == needle)
}

fn handle_frame(frame: &str, surface: StreamSurface, content: &mut String) -> Result<(), String> {
    let mut event_name = None;
    let mut data_lines = Vec::new();
    for line in frame.lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        if let Some(value) = line.strip_prefix("event:") {
            event_name = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("data:") {
            data_lines.push(value.trim_start().to_string());
        }
    }
    if data_lines.is_empty() {
        return Ok(());
    }
    let data = data_lines.join("\n");
    if data.trim() == "[DONE]" {
        return Ok(());
    }
    let payload: Value =
        serde_json::from_str(&data).map_err(|error| format!("解析 AI SSE 事件失败：{error}"))?;
    let event_type = event_name
        .as_deref()
        .or_else(|| payload.get("type").and_then(Value::as_str))
        .unwrap_or_default();

    match surface {
        StreamSurface::Responses => handle_responses_event(event_type, &payload, content),
        StreamSurface::ChatCompletions => handle_chat_completions_event(&payload, content),
        StreamSurface::Anthropic => handle_anthropic_event(event_type, &payload, content),
    }
}

fn handle_responses_event(
    event_type: &str,
    payload: &Value,
    content: &mut String,
) -> Result<(), String> {
    match event_type {
        "response.output_text.delta" => {
            if let Some(delta) = payload.get("delta").and_then(Value::as_str) {
                content.push_str(delta);
            }
        }
        "response.output_text.done" => {
            if content.is_empty() {
                if let Some(text) = payload.get("text").and_then(Value::as_str) {
                    content.push_str(text);
                }
            }
        }
        "response.completed" => {
            if content.is_empty() {
                if let Some(text) = extract_completed_text(payload) {
                    content.push_str(&text);
                }
            }
        }
        "response.failed" | "error" => {
            let message = extract_error_message(payload)
                .unwrap_or_else(|| "Responses API 返回失败事件。".to_string());
            return Err(message);
        }
        _ => {}
    }
    Ok(())
}

fn handle_chat_completions_event(payload: &Value, content: &mut String) -> Result<(), String> {
    if let Some(error) = payload.get("error") {
        return Err(extract_error_message(error)
            .unwrap_or_else(|| "Chat Completions 返回失败事件。".to_string()));
    }
    if let Some(choices) = payload.get("choices").and_then(Value::as_array) {
        for choice in choices {
            if let Some(delta) = choice
                .get("delta")
                .and_then(|delta| delta.get("content"))
                .and_then(Value::as_str)
            {
                content.push_str(delta);
            }
        }
    }
    Ok(())
}

fn handle_anthropic_event(
    event_type: &str,
    payload: &Value,
    content: &mut String,
) -> Result<(), String> {
    match event_type {
        "content_block_delta" => {
            if let Some(delta) = payload.pointer("/delta/text").and_then(Value::as_str) {
                content.push_str(delta);
            }
        }
        "error" => {
            return Err(extract_error_message(payload)
                .unwrap_or_else(|| "Anthropic Messages 返回失败事件。".to_string()));
        }
        _ => {}
    }
    Ok(())
}

fn extract_completed_text(payload: &Value) -> Option<String> {
    let output = payload
        .get("response")
        .and_then(|response| response.get("output"))
        .and_then(Value::as_array)?;
    let mut text = String::new();
    for item in output {
        let Some(parts) = item.get("content").and_then(Value::as_array) else {
            continue;
        };
        for part in parts {
            if let Some(value) = part.get("text").and_then(Value::as_str) {
                text.push_str(value);
            }
        }
    }
    (!text.is_empty()).then_some(text)
}

fn extract_error_message(payload: &Value) -> Option<String> {
    payload
        .pointer("/error/message")
        .or_else(|| payload.pointer("/response/error/message"))
        .or_else(|| payload.get("message"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_utf8_when_character_crosses_network_chunks() {
        let frame = "event: response.output_text.delta\ndata: {\"delta\":\"桌面\"}\n\n";
        let bytes = frame.as_bytes();
        let split = frame.find("面").unwrap() + 1;
        let mut decoder = SseDecoder::new(StreamSurface::Responses);
        decoder.push(&bytes[..split]).unwrap();
        decoder.push(&bytes[split..]).unwrap();
        assert_eq!(decoder.finish().unwrap(), "桌面");
    }

    #[test]
    fn parses_delta_and_completed_events() {
        let mut content = String::new();
        handle_frame(
            "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}",
            StreamSurface::Responses,
            &mut content,
        )
        .unwrap();
        handle_frame(
            "event: response.output_text.delta\ndata: {\"delta\":\" world\"}",
            StreamSurface::Responses,
            &mut content,
        )
        .unwrap();
        handle_frame(
            "event: response.completed\ndata: {\"response\":{\"output\":[{\"content\":[{\"text\":\"ignored\"}]}]}}",
            StreamSurface::Responses,
            &mut content,
        )
        .unwrap();
        assert_eq!(content, "Hello world");
    }

    #[test]
    fn completed_event_can_supply_text_without_deltas() {
        let mut content = String::new();
        handle_frame(
            "data: {\"type\":\"response.completed\",\"response\":{\"output\":[{\"content\":[{\"text\":\"fallback\"}]}]}}",
            StreamSurface::Responses,
            &mut content,
        )
        .unwrap();
        assert_eq!(content, "fallback");
    }

    #[test]
    fn done_event_can_supply_text_without_deltas() {
        let mut content = String::new();
        handle_frame(
            "event: response.output_text.done\ndata: {\"text\":\"fallback\"}",
            StreamSurface::Responses,
            &mut content,
        )
        .unwrap();
        assert_eq!(content, "fallback");
    }

    #[test]
    fn exposes_responses_error_event() {
        let mut content = String::new();
        let error = handle_frame(
            "event: response.failed\ndata: {\"response\":{\"error\":{\"message\":\"quota exceeded\"}}}",
            StreamSurface::Responses,
            &mut content,
        )
        .unwrap_err();
        assert_eq!(error, "quota exceeded");
    }

    #[test]
    fn parses_anthropic_text_delta() {
        let mut content = String::new();
        handle_frame(
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"你好\"}}",
            StreamSurface::Anthropic,
            &mut content,
        )
        .unwrap();
        assert_eq!(content, "你好");
    }
}
