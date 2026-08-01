pub(crate) const DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 45;

const CHAT_COMPLETIONS_PATH: &str = "chat/completions";
const RESPONSES_PATH: &str = "responses";
const ANTHROPIC_MESSAGES_PATH: &str = "v1/messages";

fn normalize_endpoint_url(base_url: &str, endpoint_path: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("AI 接口地址（Base URL）不能为空。".to_string());
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("AI 接口地址必须以 http:// 或 https:// 开头。".to_string());
    }
    if trimmed.ends_with(CHAT_COMPLETIONS_PATH) {
        Ok(format!(
            "{}{}",
            trimmed.trim_end_matches(CHAT_COMPLETIONS_PATH),
            endpoint_path
        ))
    } else if trimmed.ends_with(RESPONSES_PATH) {
        Ok(format!(
            "{}{}",
            trimmed.trim_end_matches(RESPONSES_PATH),
            endpoint_path
        ))
    } else {
        Ok(format!("{trimmed}/{endpoint_path}"))
    }
}

pub(crate) fn normalize_chat_completions_url(base_url: &str) -> Result<String, String> {
    normalize_endpoint_url(base_url, CHAT_COMPLETIONS_PATH)
}

pub(crate) fn normalize_responses_url(base_url: &str) -> Result<String, String> {
    normalize_endpoint_url(base_url, RESPONSES_PATH)
}

pub(crate) fn normalize_anthropic_messages_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("AI 接口地址（Base URL）不能为空。".to_string());
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("AI 接口地址必须以 http:// 或 https:// 开头。".to_string());
    }
    if trimmed.ends_with(ANTHROPIC_MESSAGES_PATH) {
        Ok(trimmed.to_string())
    } else if trimmed.ends_with("/v1") {
        Ok(format!("{trimmed}/messages"))
    } else {
        Ok(format!("{trimmed}/{ANTHROPIC_MESSAGES_PATH}"))
    }
}

pub(crate) fn validate_base_url(base_url: &str) -> Result<(), String> {
    normalize_endpoint_url(base_url, RESPONSES_PATH).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_chat_url_appends_path() {
        assert_eq!(
            normalize_chat_completions_url("https://api.openai.com/v1/").unwrap(),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn normalize_chat_url_accepts_full_chat_endpoint() {
        assert_eq!(
            normalize_chat_completions_url("https://gateway.example.com/v1/chat/completions")
                .unwrap(),
            "https://gateway.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn normalize_responses_url_rewrites_full_chat_endpoint() {
        assert_eq!(
            normalize_responses_url("https://gateway.example.com/v1/chat/completions").unwrap(),
            "https://gateway.example.com/v1/responses"
        );
    }

    #[test]
    fn normalize_anthropic_messages_url_accepts_root_and_full_endpoint() {
        assert_eq!(
            normalize_anthropic_messages_url("https://api.anthropic.com").unwrap(),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            normalize_anthropic_messages_url("https://gateway.example/v1/messages").unwrap(),
            "https://gateway.example/v1/messages"
        );
    }

    #[test]
    fn normalize_endpoint_url_rejects_non_http() {
        assert!(normalize_chat_completions_url("ftp://example.com").is_err());
        assert!(normalize_responses_url("  ").is_err());
    }
}
