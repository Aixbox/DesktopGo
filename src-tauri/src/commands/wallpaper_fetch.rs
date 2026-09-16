use std::time::Duration;

use once_cell::sync::Lazy;

const LIST_TIMEOUT: Duration = Duration::from_secs(20);
const IMAGE_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_IMAGE_BYTES: usize = 24 * 1024 * 1024;
const MAX_FEED_BYTES: usize = 12 * 1024 * 1024;
const MAX_FEED_URL_LENGTH: usize = 2048;

static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent(concat!("DesktopGo/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("构建壁纸 HTTP 客户端失败")
});

/// 壁纸列表/API 允许请求的域名白名单：
/// 必应存档镜像、Wikimedia Commons、Wallhaven、Pexels。
const ALLOWED_FEED_HOSTS: [&str; 5] = [
    "cdn.jsdelivr.net",
    "raw.githubusercontent.com",
    "commons.wikimedia.org",
    "wallhaven.cc",
    "api.pexels.com",
];

/// 壁纸图片允许下载的域名白名单：各源的图片 CDN（含必应官方与开源存档 CDN）。
const ALLOWED_IMAGE_HOSTS: [&str; 8] = [
    "cn.bing.com",
    "www.bing.com",
    "cdn.bimg.cc",
    "images.pexels.com",
    "th.wallhaven.cc",
    "w.wallhaven.cc",
    "upload.wikimedia.org",
    "thumb.wikimedia.org",
];

fn host_allowed(url: &str, hosts: &[&str]) -> bool {
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    parsed.scheme() == "https" && parsed.host_str().is_some_and(|host| hosts.contains(&host))
}

fn is_allowed_feed_url(url: &str) -> bool {
    host_allowed(url, &ALLOWED_FEED_HOSTS)
}

fn is_allowed_wallpaper_url(url: &str) -> bool {
    host_allowed(url, &ALLOWED_IMAGE_HOSTS)
}

/// 拉取壁纸列表/API 响应（JSON 文本原样返回，由前端解析）。
/// 目标域名受白名单约束，避免该命令被当作任意网络代理使用。
#[tauri::command]
pub async fn fetch_wallpaper_feed(url: String) -> Result<String, String> {
    if url.len() > MAX_FEED_URL_LENGTH || !is_allowed_feed_url(&url) {
        return Err("仅支持白名单壁纸源的列表地址。".to_string());
    }
    let response = HTTP_CLIENT
        .get(&url)
        .timeout(LIST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("请求壁纸列表失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("壁纸列表返回异常状态：{}", response.status()));
    }
    let text = response
        .text()
        .await
        .map_err(|error| format!("读取壁纸列表失败：{error}"))?;
    if text.len() > MAX_FEED_BYTES {
        return Err("壁纸列表数据过大。".to_string());
    }
    Ok(text)
}

/// 下载壁纸原图并以 data URI（base64）返回。URL 必须命中白名单域名，供前端走统一压缩管线。
#[tauri::command]
pub async fn fetch_wallpaper_image(url: String) -> Result<String, String> {
    if !is_allowed_wallpaper_url(&url) {
        return Err("仅支持白名单壁纸源的图片地址。".to_string());
    }
    let response = HTTP_CLIENT
        .get(&url)
        .timeout(IMAGE_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("下载壁纸失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("下载壁纸返回异常状态：{}", response.status()));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .unwrap_or("image/jpeg")
        .trim()
        .to_ascii_lowercase();
    let mime = if content_type.starts_with("image/") {
        content_type.as_str()
    } else {
        "image/jpeg"
    };
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取壁纸数据失败：{error}"))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("壁纸图片过大。".to_string());
    }
    use base64::Engine as _;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feed_url_validation_allows_only_whitelisted_hosts() {
        assert!(is_allowed_feed_url(
            "https://cdn.jsdelivr.net/gh/Zhu-junwei/bing-wallpaper-archive/Bing_zh-CN_all.json"
        ));
        assert!(is_allowed_feed_url(
            "https://commons.wikimedia.org/w/api.php?action=query&format=json"
        ));
        assert!(is_allowed_feed_url(
            "https://wallhaven.cc/api/v1/search?categories=111&purity=100"
        ));
        assert!(is_allowed_feed_url(
            "https://api.pexels.com/v1/search?query=nature"
        ));
        // 已下线的 Unsplash/Pixabay/Picsum/NASA 不再放行。
        assert!(!is_allowed_feed_url(
            "https://api.unsplash.com/search/photos?query=nature"
        ));
        assert!(!is_allowed_feed_url(
            "https://pixabay.com/api/?key=x&q=nature"
        ));
        assert!(!is_allowed_feed_url(
            "https://picsum.photos/v2/list?page=2&limit=30"
        ));
        assert!(!is_allowed_feed_url(
            "https://images-api.nasa.gov/search?q=mars&media_type=image"
        ));
        assert!(!is_allowed_feed_url(
            "http://api.pexels.com/v1/search?query=nature"
        ));
        assert!(!is_allowed_feed_url("https://evil.example.com/api"));
        assert!(!is_allowed_feed_url(
            "https://wallhaven.cc.evil.com/api/v1/search"
        ));
    }

    #[test]
    fn image_url_validation_allows_only_whitelisted_hosts() {
        assert!(is_allowed_wallpaper_url(
            "https://cn.bing.com/th?id=OHR.IcyCubs_ZH-CN5287408951_1920x1080.jpg&pid=hp"
        ));
        assert!(is_allowed_wallpaper_url(
            "https://cdn.bimg.cc/bing/2016/OHR.LaurelMoss_ZH-CN9578543974_1920x1080.jpg"
        ));
        assert!(is_allowed_wallpaper_url(
            "https://images.pexels.com/photos/1/pexels-photo-1.jpeg"
        ));
        assert!(is_allowed_wallpaper_url(
            "https://th.wallhaven.cc/lg/w5/w535dq.jpg"
        ));
        assert!(is_allowed_wallpaper_url(
            "https://w.wallhaven.cc/full/w5/wallhaven-w535dq.jpg"
        ));
        assert!(is_allowed_wallpaper_url(
            "https://upload.wikimedia.org/wikipedia/commons/1/14/X.JPG"
        ));
        assert!(is_allowed_wallpaper_url(
            "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/X.JPG/640px-X.JPG"
        ));
        // 已下线的 Unsplash/Pixabay/Picsum/NASA 图床不再放行。
        assert!(!is_allowed_wallpaper_url(
            "https://images.unsplash.com/photo-123?w=1080"
        ));
        assert!(!is_allowed_wallpaper_url(
            "https://cdn.pixabay.com/photo/2020/01/01/00/00/img-1_1280.jpg"
        ));
        assert!(!is_allowed_wallpaper_url(
            "https://picsum.photos/id/10/1920/1080"
        ));
        assert!(!is_allowed_wallpaper_url(
            "https://images-assets.nasa.gov/image/PIA05445/PIA05445~orig.jpg"
        ));
        assert!(!is_allowed_wallpaper_url(
            "http://cn.bing.com/th?id=OHR.X.jpg"
        ));
        assert!(!is_allowed_wallpaper_url(
            "https://evil.example.com/img.jpg"
        ));
        assert!(!is_allowed_wallpaper_url(
            "https://cn.bing.com.evil.com/img.jpg"
        ));
    }
}
