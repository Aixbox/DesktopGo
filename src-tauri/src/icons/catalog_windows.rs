mod image;
mod item;
pub(super) mod operations;
mod source;
mod storage;
mod view;

#[cfg(test)]
mod tests;

/// 「快捷导入」的应用扫描。`pub(super)` 让 icons::service 能直接转发调用。
pub(super) mod app_import;

pub(super) use image::get_path_icon_base64_windows;
