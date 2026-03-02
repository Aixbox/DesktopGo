#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchErrorCode {
    EverythingNotFound,
    EverythingLiteUnsupported,
    EverythingIpcUnavailable,
    EverythingStartTimeout,
}

impl SearchErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::EverythingNotFound => "EverythingNotFound",
            Self::EverythingLiteUnsupported => "EverythingLiteUnsupported",
            Self::EverythingIpcUnavailable => "EverythingIpcUnavailable",
            Self::EverythingStartTimeout => "EverythingStartTimeout",
        }
    }
}

pub fn build_error(code: SearchErrorCode, message: impl AsRef<str>) -> String {
    let msg = message.as_ref().trim();
    if msg.is_empty() {
        code.as_str().to_string()
    } else {
        format!("{}: {}", code.as_str(), msg)
    }
}

pub fn map_ipc_error(code: u32) -> &'static str {
    match code {
        0 => "No error",
        1 => "Memory allocation failed",
        2 => "IPC unavailable: Everything is not running",
        3 => "Failed to register search query window class",
        4 => "Failed to create search query window",
        5 => "Invalid query parameters",
        _ => "Unknown Everything IPC error",
    }
}
