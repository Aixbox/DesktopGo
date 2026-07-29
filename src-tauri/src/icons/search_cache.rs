use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

const SEARCH_ICON_CACHE_CAPACITY: usize = 512;
const SEARCH_ICON_BATCH_LIMIT: usize = 64;

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct SearchIconCacheKey {
    normalized_path: String,
    icon_size: i32,
}

#[derive(Clone, Debug)]
struct SearchIconCacheEntry {
    icon_base64: String,
    last_used: u64,
}

#[derive(Debug)]
struct SearchIconCache {
    entries: HashMap<SearchIconCacheKey, SearchIconCacheEntry>,
    clock: u64,
    capacity: usize,
}

impl SearchIconCache {
    fn new(capacity: usize) -> Self {
        Self {
            entries: HashMap::new(),
            clock: 0,
            capacity,
        }
    }

    fn get(&mut self, key: &SearchIconCacheKey) -> Option<String> {
        self.clock = self.clock.saturating_add(1);
        let entry = self.entries.get_mut(key)?;
        entry.last_used = self.clock;
        Some(entry.icon_base64.clone())
    }

    fn insert(&mut self, key: SearchIconCacheKey, icon_base64: String) {
        if self.capacity == 0 {
            return;
        }

        self.clock = self.clock.saturating_add(1);
        if !self.entries.contains_key(&key) && self.entries.len() >= self.capacity {
            let oldest_key = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(entry_key, _)| entry_key.clone());
            if let Some(oldest_key) = oldest_key {
                self.entries.remove(&oldest_key);
            }
        }

        self.entries.insert(
            key,
            SearchIconCacheEntry {
                icon_base64,
                last_used: self.clock,
            },
        );
    }
}

static SEARCH_ICON_CACHE: OnceLock<Mutex<SearchIconCache>> = OnceLock::new();

fn cache_key(path: &str, icon_size: i32) -> SearchIconCacheKey {
    SearchIconCacheKey {
        normalized_path: path.to_lowercase(),
        icon_size,
    }
}

fn read_cached_icon(key: &SearchIconCacheKey) -> Option<String> {
    SEARCH_ICON_CACHE
        .get_or_init(|| Mutex::new(SearchIconCache::new(SEARCH_ICON_CACHE_CAPACITY)))
        .lock()
        .ok()?
        .get(key)
}

fn store_cached_icon(key: SearchIconCacheKey, icon_base64: String) {
    if let Ok(mut cache) = SEARCH_ICON_CACHE
        .get_or_init(|| Mutex::new(SearchIconCache::new(SEARCH_ICON_CACHE_CAPACITY)))
        .lock()
    {
        cache.insert(key, icon_base64);
    }
}

fn extract_icon(path: &str, icon_size: i32) -> String {
    #[cfg(windows)]
    {
        super::catalog_windows::get_path_icon_base64_windows(path, icon_size)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        let _ = icon_size;
        String::new()
    }
}

pub(super) fn get_search_result_icons(paths: &[String], icon_size: i32) -> Vec<(String, String)> {
    let icon_size = icon_size.clamp(16, 256);
    let mut seen = HashSet::new();

    paths
        .iter()
        .filter_map(|raw_path| {
            let path = raw_path.trim();
            if path.is_empty() || !seen.insert(path.to_string()) {
                return None;
            }
            Some(path.to_string())
        })
        .take(SEARCH_ICON_BATCH_LIMIT)
        .map(|path| {
            let key = cache_key(&path, icon_size);
            let icon_base64 = read_cached_icon(&key).unwrap_or_else(|| {
                let extracted = extract_icon(&path, icon_size);
                store_cached_icon(key, extracted.clone());
                extracted
            });
            (path, icon_base64)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{cache_key, SearchIconCache};

    #[test]
    fn cache_returns_inserted_icon() {
        let mut cache = SearchIconCache::new(2);
        let key = cache_key("C:\\first.txt", 32);
        cache.insert(key.clone(), "first-icon".to_string());

        assert_eq!(cache.get(&key).as_deref(), Some("first-icon"));
    }

    #[test]
    fn cache_evicts_least_recently_used_icon() {
        let mut cache = SearchIconCache::new(2);
        let first = cache_key("C:\\first.txt", 32);
        let second = cache_key("C:\\second.txt", 32);
        let third = cache_key("C:\\third.txt", 32);
        cache.insert(first.clone(), "first-icon".to_string());
        cache.insert(second.clone(), "second-icon".to_string());
        assert!(cache.get(&first).is_some());

        cache.insert(third.clone(), "third-icon".to_string());

        assert!(cache.get(&first).is_some());
        assert!(cache.get(&second).is_none());
        assert!(cache.get(&third).is_some());
    }
}
