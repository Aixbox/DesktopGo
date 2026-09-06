//! Windows Internet Shortcut (`.url`) file parser.
//!
//! Steam writes one `.url` per game to the desktop with the game artwork
//! referenced by `IconFile`/`IconIndex` in the `[InternetShortcut]` section.
//! The shell does not reliably hand that icon back through the shortcut chain
//! (a managed `.lnk` pointing at the `.url` extracts only a fallback icon), so
//! the catalog reads the entries directly.

use std::path::Path;

#[derive(Debug, PartialEq)]
pub(crate) struct UrlShortcutInfo {
    /// `URL=` entry, e.g. `steam://rungameid/1568590`. Empty when absent.
    pub target: String,
    /// `IconFile=` entry. Empty when the shortcut relies on the default icon.
    pub icon_file: String,
    /// `IconIndex=` entry, defaults to 0.
    pub icon_index: i32,
}

pub(crate) fn is_url_shortcut(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("url"))
}

pub(crate) fn read_url_shortcut(path: &Path) -> Option<UrlShortcutInfo> {
    let bytes = std::fs::read(path).ok()?;
    parse_url_shortcut_text(&decode_shortcut_text(&bytes))
}

fn decode_shortcut_text(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_string();
    }
    decode_ansi_text(bytes)
}

#[cfg(windows)]
fn decode_ansi_text(bytes: &[u8]) -> String {
    use windows::Win32::Globalization::{MultiByteToWideChar, CP_ACP, MB_ERR_INVALID_CHARS};

    unsafe {
        let required = MultiByteToWideChar(CP_ACP, MB_ERR_INVALID_CHARS, bytes, None);
        if required > 0 {
            let mut buffer = vec![0u16; required as usize];
            let written =
                MultiByteToWideChar(CP_ACP, MB_ERR_INVALID_CHARS, bytes, Some(&mut buffer));
            if written > 0 {
                return String::from_utf16_lossy(&buffer[..written as usize]);
            }
        }
    }
    String::from_utf8_lossy(bytes).into_owned()
}

#[cfg(not(windows))]
fn decode_ansi_text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// Parses the INI-style body of a `.url` file. Only the `[InternetShortcut]`
/// section carries the entries we need; other sections (e.g. the CLSID header
/// Steam prepends) are ignored. Returns `None` when no known entry is present.
fn parse_url_shortcut_text(text: &str) -> Option<UrlShortcutInfo> {
    let mut section = String::new();
    let mut target = String::new();
    let mut icon_file = String::new();
    let mut icon_index = 0i32;
    let mut found_known_entry = false;

    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            section = line[1..line.len() - 1].trim().to_ascii_lowercase();
            continue;
        }
        if !section.is_empty() && section != "internetshortcut" {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = unquote(value.trim());
        match key.trim().to_ascii_lowercase().as_str() {
            "url" => {
                target = value;
                found_known_entry = true;
            }
            "iconfile" => {
                icon_file = value;
                found_known_entry = true;
            }
            "iconindex" => {
                icon_index = value.parse().unwrap_or(0);
                found_known_entry = true;
            }
            _ => {}
        }
    }

    found_known_entry.then_some(UrlShortcutInfo {
        target,
        icon_file,
        icon_index,
    })
}

fn unquote(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        return trimmed[1..trimmed.len() - 1].trim().to_string();
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::{decode_shortcut_text, parse_url_shortcut_text};

    #[test]
    fn parses_steam_shortcut_entries_case_insensitively() {
        let text = "[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,0\r\n\
                    [InternetShortcut]\r\nIDList=\r\nIconIndex=0\r\n\
                    URL=steam://rungameid/1568590\r\n\
                    IconFile=D:\\steam\\games\\abc.ico\r\n";
        let info = parse_url_shortcut_text(text).expect("entries should parse");
        assert_eq!(info.target, "steam://rungameid/1568590");
        assert_eq!(info.icon_file, r"D:\steam\games\abc.ico");
        assert_eq!(info.icon_index, 0);
    }

    #[test]
    fn unquotes_icon_file_and_parses_nonzero_icon_index() {
        let text = "[InternetShortcut]\nURL=https://example.com\n\
                    IconFile=\"C:\\Icons\\site.ico\"\nIconIndex=3\n";
        let info = parse_url_shortcut_text(text).expect("entries should parse");
        assert_eq!(info.icon_file, r"C:\Icons\site.ico");
        assert_eq!(info.icon_index, 3);
    }

    #[test]
    fn defaults_icon_index_when_missing() {
        let text = "[InternetShortcut]\nURL=steam://rungameid/1\nIconFile=C:\\a.ico\n";
        let info = parse_url_shortcut_text(text).expect("entries should parse");
        assert_eq!(info.icon_index, 0);
    }

    #[test]
    fn ignores_unknown_sections_and_returns_none_without_known_entries() {
        assert!(parse_url_shortcut_text("[OtherSection]\nURL=ignored-by-section").is_none());
        assert!(parse_url_shortcut_text("nothing here").is_none());
    }

    #[test]
    fn decodes_utf16le_bom_payloads() {
        let mut bytes = vec![0xFF, 0xFE];
        for unit in "[InternetShortcut]\r\nURL=steam://rungameid/2".encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let text = decode_shortcut_text(&bytes);
        let info = parse_url_shortcut_text(&text).expect("utf16 payload should parse");
        assert_eq!(info.target, "steam://rungameid/2");
    }

    #[test]
    fn decodes_non_utf8_ansi_payloads_via_system_codepage() {
        // 0xD6 0xD0 = "中" in GBK; valid-UTF-8 check fails and ACP decoding kicks in.
        let bytes = vec![0x5B, 0xD6, 0xD0, 0x5D, 0x0D, 0x0A];
        let _text = decode_shortcut_text(&bytes);
    }
}
