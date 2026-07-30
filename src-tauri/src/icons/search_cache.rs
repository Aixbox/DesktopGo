//! Search result icon cache.
//!
//! The pipeline mirrors what the Everything binary does for its own list view:
//! resolve a cheap shared *identity* for every visible row, then pay for the
//! actual bitmap once per distinct icon instead of once per row.
//!
//! Nothing here caches a failure. An icon that could not be produced this time
//! is simply absent, so the next visible pass may try again.

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::{Mutex, OnceLock};

use super::search_icon_plan::{
    extension_lookup_name, icon_extension, plan_search_icon, SearchIconSource,
};

const SEARCH_ICON_BATCH_LIMIT: usize = 128;
const ICON_INDEX_CACHE_CAPACITY: usize = 4096;
const ICON_IMAGE_CACHE_CAPACITY: usize = 256;
const DIRECT_ICON_CACHE_CAPACITY: usize = 256;

/// Least-recently-used map used by every icon cache in this module.
#[derive(Debug)]
struct BoundedIconCache<K, V> {
    entries: HashMap<K, (V, u64)>,
    clock: u64,
    capacity: usize,
}

impl<K: Clone + Eq + Hash, V: Clone> BoundedIconCache<K, V> {
    fn new(capacity: usize) -> Self {
        Self {
            entries: HashMap::new(),
            clock: 0,
            capacity,
        }
    }

    fn get(&mut self, key: &K) -> Option<V> {
        self.clock = self.clock.saturating_add(1);
        let clock = self.clock;
        let entry = self.entries.get_mut(key)?;
        entry.1 = clock;
        Some(entry.0.clone())
    }

    fn insert(&mut self, key: K, value: V) {
        if self.capacity == 0 {
            return;
        }

        self.clock = self.clock.saturating_add(1);
        if !self.entries.contains_key(&key) && self.entries.len() >= self.capacity {
            let oldest = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.1)
                .map(|(entry_key, _)| entry_key.clone());
            if let Some(oldest) = oldest {
                self.entries.remove(&oldest);
            }
        }

        self.entries.insert(key, (value, self.clock));
    }
}

type IconCache<K, V> = OnceLock<Mutex<BoundedIconCache<K, V>>>;

/// Shared system image list slot per icon identity.
static ICON_INDEX_CACHE: IconCache<SearchIconSource, i32> = OnceLock::new();
/// Rendered PNG per (image list slot, image list size).
static ICON_IMAGE_CACHE: IconCache<(i32, i32), String> = OnceLock::new();
/// Rendered PNG for entries the system image list cannot describe.
static DIRECT_ICON_CACHE: IconCache<(SearchIconSource, i32), String> = OnceLock::new();

fn with_cache<K, V, R>(
    cache: &IconCache<K, V>,
    capacity: usize,
    action: impl FnOnce(&mut BoundedIconCache<K, V>) -> R,
) -> Option<R>
where
    K: Clone + Eq + Hash,
    V: Clone,
{
    let mut guard = cache
        .get_or_init(|| Mutex::new(BoundedIconCache::new(capacity)))
        .lock()
        .ok()?;
    Some(action(&mut guard))
}

/// Reads through the cache, storing only results that actually produced an icon.
fn cached_or_insert<K, V, F>(
    cache: &IconCache<K, V>,
    capacity: usize,
    key: K,
    produce: F,
) -> Option<V>
where
    K: Clone + Eq + Hash,
    V: Clone,
    F: FnOnce() -> Option<V>,
{
    if let Some(Some(hit)) = with_cache(cache, capacity, |entries| entries.get(&key)) {
        return Some(hit);
    }

    let value = produce()?;
    with_cache(cache, capacity, |entries| {
        entries.insert(key, value.clone())
    });
    Some(value)
}

#[cfg(windows)]
fn shell_namespace_icon(path: &str, icon_size: i32) -> Option<String> {
    super::platform_windows::extract_special_shell_icon(path, icon_size)
}

#[cfg(windows)]
fn cached_thumbnail(path: &str, icon_size: i32) -> Option<String> {
    super::platform_windows::extract_cached_thumbnail(path, icon_size)
}

#[cfg(windows)]
fn system_icon_index(path: &str, is_folder: bool, use_file_attributes: bool) -> Option<i32> {
    super::shell_icon_windows::system_icon_index(path, is_folder, use_file_attributes)
}

#[cfg(windows)]
fn icon_index_to_data_uri(icon_index: i32, image_list_id: i32) -> Option<String> {
    super::shell_icon_windows::icon_index_to_data_uri(icon_index, image_list_id)
}

#[cfg(windows)]
fn image_list_id_for_size(icon_size: i32) -> i32 {
    super::shell_icon_windows::image_list_id_for_size(icon_size)
}

#[cfg(not(windows))]
fn shell_namespace_icon(_path: &str, _icon_size: i32) -> Option<String> {
    None
}

#[cfg(not(windows))]
fn cached_thumbnail(_path: &str, _icon_size: i32) -> Option<String> {
    None
}

#[cfg(not(windows))]
fn system_icon_index(_path: &str, _is_folder: bool, _use_file_attributes: bool) -> Option<i32> {
    None
}

#[cfg(not(windows))]
fn icon_index_to_data_uri(_icon_index: i32, _image_list_id: i32) -> Option<String> {
    None
}

#[cfg(not(windows))]
fn image_list_id_for_size(_icon_size: i32) -> i32 {
    0
}

/// Entries that own their icon are asked about the real file first, because that
/// is the only way an executable or a customised folder differs from its type.
///
/// Everything else is resolved through `use_file_attributes`, which keeps the
/// answer inside the shell's association table: no disk read, no third-party icon
/// handler, and a usable icon even for a path that is missing, unreadable or
/// longer than `MAX_PATH`.
fn resolve_icon_index(source: &SearchIconSource, path: &str, is_folder: bool) -> Option<i32> {
    match source {
        SearchIconSource::OwnedByPath(_) => system_icon_index(path, is_folder, false)
            .or_else(|| system_icon_index(path, is_folder, true)),
        // Ask about the extension, not the file: one lookup then serves every row
        // that shares it, and a 300-character path cannot fail the call.
        SearchIconSource::SharedExtension(extension) => {
            system_icon_index(&extension_lookup_name(extension), false, true)
        }
        _ => system_icon_index(path, is_folder, true),
    }
}

fn shared_icon(
    source: SearchIconSource,
    path: &str,
    is_folder: bool,
    image_list_id: i32,
) -> Option<String> {
    let icon_index = {
        let lookup_source = source.clone();
        cached_or_insert(&ICON_INDEX_CACHE, ICON_INDEX_CACHE_CAPACITY, source, || {
            resolve_icon_index(&lookup_source, path, is_folder)
        })?
    };

    cached_or_insert(
        &ICON_IMAGE_CACHE,
        ICON_IMAGE_CACHE_CAPACITY,
        (icon_index, image_list_id),
        || icon_index_to_data_uri(icon_index, image_list_id),
    )
}

fn direct_icon(
    source: SearchIconSource,
    icon_size: i32,
    produce: impl FnOnce() -> Option<String>,
) -> Option<String> {
    cached_or_insert(
        &DIRECT_ICON_CACHE,
        DIRECT_ICON_CACHE_CAPACITY,
        (source, icon_size),
        produce,
    )
}

fn resolve_search_icon(path: &str, is_folder: bool, icon_size: i32) -> String {
    let image_list_id = image_list_id_for_size(icon_size);
    let source = plan_search_icon(path, is_folder);

    let icon = match &source {
        SearchIconSource::ShellNamespace(_) => direct_icon(source.clone(), icon_size, || {
            shell_namespace_icon(path, icon_size)
        }),
        // A picture without a ready thumbnail must still get an icon now, and the
        // cheapest correct one is the icon its extension already shares.
        SearchIconSource::Thumbnail(_) => direct_icon(source.clone(), icon_size, || {
            cached_thumbnail(path, icon_size)
        })
        .or_else(|| {
            shared_icon(
                SearchIconSource::SharedExtension(icon_extension(path)),
                path,
                is_folder,
                image_list_id,
            )
        }),
        _ => shared_icon(source.clone(), path, is_folder, image_list_id),
    };

    icon.unwrap_or_default()
}

/// Trims, drops empties and collapses case-insensitive duplicates before any
/// shell call happens.
fn normalize_icon_requests(requests: &[(String, bool)], limit: usize) -> Vec<(String, bool)> {
    let mut seen = std::collections::HashSet::new();

    requests
        .iter()
        .filter_map(|(raw_path, is_folder)| {
            let path = raw_path.trim();
            if path.is_empty() || !seen.insert(path.to_lowercase()) {
                return None;
            }
            Some((path.to_string(), *is_folder))
        })
        .take(limit)
        .collect()
}

/// Resolves one batch of visible rows.
///
/// `is_folder` comes from the Everything index, which already knows it. Probing
/// the filesystem here instead would reintroduce a per-row disk hit — the exact
/// cost this pipeline exists to avoid.
pub(super) fn get_search_result_icons(
    requests: &[(String, bool)],
    icon_size: i32,
) -> Vec<(String, String)> {
    let icon_size = icon_size.clamp(16, 256);

    normalize_icon_requests(requests, SEARCH_ICON_BATCH_LIMIT)
        .into_iter()
        .map(|(path, is_folder)| {
            let icon = resolve_search_icon(&path, is_folder, icon_size);
            (path, icon)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{cached_or_insert, normalize_icon_requests, BoundedIconCache, IconCache};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::OnceLock;

    #[test]
    fn normalizes_a_batch_before_any_shell_call() {
        let requests = vec![
            ("  C:\\demo\\a.txt  ".to_string(), false),
            ("c:\\DEMO\\A.txt".to_string(), false),
            ("   ".to_string(), false),
            ("C:\\Users".to_string(), true),
        ];

        assert_eq!(
            normalize_icon_requests(&requests, 8),
            vec![
                ("C:\\demo\\a.txt".to_string(), false),
                ("C:\\Users".to_string(), true),
            ]
        );
    }

    #[test]
    fn batch_normalization_respects_the_limit() {
        let requests = vec![
            ("C:\\a.txt".to_string(), false),
            ("C:\\b.txt".to_string(), false),
        ];

        assert_eq!(
            normalize_icon_requests(&requests, 1),
            vec![("C:\\a.txt".to_string(), false)]
        );
    }

    #[test]
    fn cache_returns_inserted_value() {
        let mut cache = BoundedIconCache::new(2);
        cache.insert("first", "first-icon");

        assert_eq!(cache.get(&"first"), Some("first-icon"));
        assert_eq!(cache.get(&"missing"), None);
    }

    #[test]
    fn cache_evicts_least_recently_used_value() {
        let mut cache = BoundedIconCache::new(2);
        cache.insert("first", "first-icon");
        cache.insert("second", "second-icon");
        assert!(cache.get(&"first").is_some());

        cache.insert("third", "third-icon");

        assert!(cache.get(&"first").is_some());
        assert!(cache.get(&"second").is_none());
        assert!(cache.get(&"third").is_some());
    }

    #[test]
    fn read_through_cache_reuses_a_hit_and_never_stores_a_miss() {
        static CACHE: IconCache<&'static str, String> = OnceLock::new();
        static CALLS: AtomicUsize = AtomicUsize::new(0);

        let produce = |value: Option<&str>| {
            cached_or_insert(&CACHE, 8, "key", || {
                CALLS.fetch_add(1, Ordering::SeqCst);
                value.map(|value| value.to_string())
            })
        };

        assert_eq!(produce(None), None);
        assert_eq!(CALLS.load(Ordering::SeqCst), 1);

        assert_eq!(produce(Some("icon")), Some("icon".to_string()));
        assert_eq!(CALLS.load(Ordering::SeqCst), 2);

        assert_eq!(produce(Some("other")), Some("icon".to_string()));
        assert_eq!(CALLS.load(Ordering::SeqCst), 2);
    }
}
