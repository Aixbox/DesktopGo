use serde_json::{json, Value};

use crate::ai::AiConfig;

use super::LlmMessage;

pub(super) fn build_responses_request(
    config: &AiConfig,
    messages: &[LlmMessage],
    strict_json: bool,
) -> Value {
    let input: Vec<Value> = messages
        .iter()
        .map(|message| {
            json!({
                "role": message.role,
                "content": message.content,
            })
        })
        .collect();
    let mut body = json!({
        "model": config.model.trim(),
        "input": input,
        "stream": true,
    });

    if let Some(temperature) = config.temperature {
        body["temperature"] = json!(temperature);
    }
    if let Some(effort) = config.reasoning_effort.as_openai_value() {
        body["reasoning"] = json!({ "effort": effort });
    }
    if strict_json {
        body["text"] = json!({
            "format": {
                "type": "json_schema",
                "name": "desktopgo_icon_groups",
                "strict": true,
                "schema": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["groups"],
                    "properties": {
                        "groups": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["folderName", "iconKeys", "folderSize"],
                                "properties": {
                                    "folderName": { "type": "string" },
                                    "iconKeys": {
                                        "type": "array",
                                        "items": { "type": "string" }
                                    },
                                    "folderSize": {
                                        "type": "string",
                                        "enum": ["1x1", "1x2", "2x1", "2x2"]
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }
    body
}

pub(super) fn build_chat_completions_request(
    config: &AiConfig,
    messages: &[LlmMessage],
    strict_json: bool,
) -> Value {
    let mut body = json!({
        "model": config.model.trim(),
        "messages": messages,
        "stream": true,
        "stream_options": {
            "include_usage": true
        }
    });
    if let Some(temperature) = config.temperature {
        body["temperature"] = json!(temperature);
    }
    if let Some(effort) = config.reasoning_effort.as_openai_value() {
        body["reasoning_effort"] = json!(effort);
    }
    if strict_json {
        body["response_format"] = json!({ "type": "json_object" });
    }
    body
}

pub(super) fn build_anthropic_messages_request(
    config: &AiConfig,
    messages: &[LlmMessage],
) -> Value {
    let mut system = Vec::new();
    let mut anthropic_messages = Vec::new();
    for message in messages {
        if message.role == "system" {
            system.push(message.content.as_str());
        } else {
            anthropic_messages.push(json!({
                "role": message.role,
                "content": message.content,
            }));
        }
    }

    let thinking_budget = config.reasoning_effort.anthropic_thinking_budget();
    let mut body = json!({
        "model": config.model.trim(),
        "messages": anthropic_messages,
        "max_tokens": thinking_budget.map_or(4096, |budget| budget + 4096),
        "stream": true,
    });
    if !system.is_empty() {
        body["system"] = json!(system.join("\n\n"));
    }
    if let Some(budget_tokens) = thinking_budget {
        body["thinking"] = json!({
            "type": "enabled",
            "budget_tokens": budget_tokens,
        });
    }
    body
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> AiConfig {
        AiConfig {
            provider: crate::ai::AiProvider::OpenAi,
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: "secret".to_string(),
            model: "test-model".to_string(),
            custom_prompt: None,
            temperature: Some(0.25),
            compatible_protocol: crate::ai::AiCompatibleProtocol::Responses,
            reasoning_effort: crate::ai::models::AiReasoningEffort::Medium,
        }
    }

    #[test]
    fn responses_request_includes_strict_schema() {
        let body = build_responses_request(&config(), &[LlmMessage::new("user", "organize")], true);
        assert_eq!(body["stream"], true);
        assert_eq!(body["temperature"], 0.25);
        assert_eq!(body["text"]["format"]["type"], "json_schema");
    }

    #[test]
    fn chat_request_omits_response_format_for_plain_chat() {
        let body =
            build_chat_completions_request(&config(), &[LlmMessage::new("user", "hello")], false);
        assert!(body.get("response_format").is_none());
        assert_eq!(body["stream_options"]["include_usage"], true);
    }

    #[test]
    fn anthropic_request_separates_system_and_maps_thinking_budget() {
        let body = build_anthropic_messages_request(
            &config(),
            &[
                LlmMessage::new("system", "rules"),
                LlmMessage::new("user", "organize"),
            ],
        );
        assert_eq!(body["system"], "rules");
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["thinking"]["budget_tokens"], 4096);
        assert_eq!(body["max_tokens"], 8192);
    }
}
