mod candidate;
mod document;
mod document_assets;
mod http;
mod image;
mod operation;

#[cfg(test)]
mod tests;

pub(super) use document::normalize_website_url;
pub use image::optimize_icon_data_uri;

use super::models::WebsiteIconResult;

pub async fn extract_website_icon(value: String) -> Result<WebsiteIconResult, String> {
    operation::extract_website_icon(value).await
}
