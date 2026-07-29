use crate::everything::SearchHit;
use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSearchPalette {
    pub background: [u8; 3],
    pub foreground: [u8; 3],
    pub muted: [u8; 3],
    pub accent: [u8; 3],
    pub selection: [u8; 3],
    pub hover: [u8; 3],
}

impl Default for NativeSearchPalette {
    fn default() -> Self {
        Self {
            background: [248, 250, 252],
            foreground: [15, 23, 42],
            muted: [100, 116, 139],
            accent: [59, 130, 246],
            selection: [219, 234, 254],
            hover: [241, 245, 249],
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSearchBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub struct NativeSearchRow {
    pub item: SearchHit,
    pub name: Vec<u16>,
    pub parent: Vec<u16>,
}

impl From<SearchHit> for NativeSearchRow {
    fn from(item: SearchHit) -> Self {
        let name = strip_highlight_markers(if item.highlighted_name.is_empty() {
            if item.name.is_empty() {
                &item.path
            } else {
                &item.name
            }
        } else {
            &item.highlighted_name
        });
        let parent = strip_highlight_markers(if item.highlighted_path.is_empty() {
            &item.parent
        } else {
            &item.highlighted_path
        });
        Self {
            item,
            name: name.encode_utf16().collect(),
            parent: parent.encode_utf16().collect(),
        }
    }
}

pub struct NativeSearchModel {
    pub rows: Vec<NativeSearchRow>,
    pub selected: i32,
    pub hovered: i32,
    pub palette: NativeSearchPalette,
    pub scale_factor: f64,
}

impl Default for NativeSearchModel {
    fn default() -> Self {
        Self {
            rows: Vec::new(),
            selected: -1,
            hovered: -1,
            palette: NativeSearchPalette::default(),
            scale_factor: 1.0,
        }
    }
}

fn strip_highlight_markers(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(character) = chars.next() {
        if character != '*' {
            output.push(character);
        } else if chars.peek() == Some(&'*') {
            output.push('*');
            chars.next();
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::strip_highlight_markers;

    #[test]
    fn removes_everything_highlight_markers_and_preserves_escaped_stars() {
        assert_eq!(strip_highlight_markers("*desk*top**go"), "desktop*go");
    }
}
