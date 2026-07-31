//! `.lnk` 目标解析（带缓存）。
//!
//! 「最佳匹配」要把一个程序和指向它的快捷方式判成同一条，就必须知道 `.lnk` 指向哪里。
//! 开始菜单一次枚举有几百个 `.lnk`，每条都走一次 COM（`CoCreateInstance` +
//! `IPersistFile::Load`）在面板打开时是能感觉到的开销，所以这里按
//! 「路径 + 修改时间 + 大小」缓存解析结果：快捷方式被改写时键自然变化，
//! 不需要额外的失效逻辑。
//!
//! 解析失败（应用商店应用、指向 shell 命名空间的快捷方式等）也一并缓存成空串，
//! 否则每次进面板都要为同一批解析不出来的 `.lnk` 重复付出 COM 开销。
//!
//! 刻意只调 `IShellLink::GetPath`、不调 `Resolve`：后者会做快捷方式跟踪，
//! 可能弹 UI、访问网络，批量枚举时绝对不能碰。

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

/// 缓存上限，和目录表的枚举上限（`launcher_catalog::MAX_CATALOG_ENTRIES`）同一量级。
const CACHE_CAPACITY: usize = 4_096;

fn cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 是不是 `.lnk`。只有它能被 `IShellLink` 解析，`.url` 之类不在这里处理。
pub fn is_shortcut_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("lnk"))
        .unwrap_or(false)
}

/// 缓存键：路径 + 修改时间 + 大小。快捷方式被改写后旧值不会被复用。
/// 拿不到元数据时退化成只按路径缓存，反正下一步的解析也会失败。
fn cache_key(path: &Path) -> String {
    let stamp = std::fs::metadata(path)
        .map(|meta| {
            let modified = meta
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|value| value.as_millis())
                .unwrap_or_default();
            format!("{modified}:{}", meta.len())
        })
        .unwrap_or_default();
    format!("{}|{stamp}", path.to_string_lossy().to_lowercase())
}

fn remember(key: String, target: &str) {
    let Ok(mut cache) = cache().lock() else {
        return;
    };
    // 命中率比容量精细度重要：装满之后整表丢弃、下一轮重新填，不维护 LRU 顺序。
    if cache.len() >= CACHE_CAPACITY && !cache.contains_key(&key) {
        cache.clear();
    }
    cache.insert(key, target.to_string());
}

/// 解析 `.lnk` 指向的目标路径。不是快捷方式、解析不出来或非 Windows 时返回 `None`。
pub fn resolve_shortcut_target(path: &Path) -> Option<String> {
    if !is_shortcut_file(path) {
        return None;
    }

    let key = cache_key(path);
    let cached = cache()
        .lock()
        .ok()
        .and_then(|cache| cache.get(&key).cloned());
    if let Some(cached) = cached {
        return Some(cached).filter(|value| !value.is_empty());
    }

    let target = resolve_uncached(path).unwrap_or_default();
    remember(key, &target);
    Some(target).filter(|value| !value.is_empty())
}

#[cfg(windows)]
fn resolve_uncached(path: &Path) -> Option<String> {
    crate::icons::resolve_lnk(path)
}

#[cfg(not(windows))]
fn resolve_uncached(_path: &Path) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_shortcut_extension_case_insensitively() {
        assert!(is_shortcut_file(Path::new("C:/apps/Foo.lnk")));
        assert!(is_shortcut_file(Path::new("C:/apps/Foo.LNK")));
        assert!(!is_shortcut_file(Path::new("C:/apps/Foo.exe")));
        assert!(!is_shortcut_file(Path::new("C:/apps/Foo")));
    }

    #[test]
    fn non_shortcut_paths_are_not_resolved() {
        assert!(resolve_shortcut_target(Path::new("C:/apps/Foo.exe")).is_none());
    }

    #[test]
    fn missing_shortcut_resolves_to_none_and_is_cached() {
        let path = std::env::temp_dir().join("desktopgo-does-not-exist.lnk");
        assert!(resolve_shortcut_target(&path).is_none());
        // 失败也进缓存，第二次不再重复走 COM。
        assert!(resolve_shortcut_target(&path).is_none());
        let key = cache_key(&path);
        assert_eq!(
            cache().lock().unwrap().get(&key).map(String::as_str),
            Some("")
        );
    }
}
