use super::SearchQuery;

pub(super) const SNAPSHOT_RESULT_LIMIT: u32 = 50_000;

#[derive(Debug, Clone, PartialEq, Eq)]
struct SearchSnapshotKey {
    keyword: String,
    match_path: bool,
    match_case: bool,
    regex: bool,
    whole_word: bool,
    sort: super::super::models::SearchSort,
}

impl From<&SearchQuery> for SearchSnapshotKey {
    fn from(query: &SearchQuery) -> Self {
        Self {
            keyword: query.keyword.clone(),
            match_path: query.match_path,
            match_case: query.match_case,
            regex: query.regex,
            whole_word: query.whole_word,
            sort: query.sort,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct SnapshotRange {
    pub(super) local_offset: u32,
    pub(super) limit: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct SearchResultSnapshot {
    key: SearchSnapshotKey,
    offset: u32,
    result_count: u32,
    total_results: u32,
}

impl SearchResultSnapshot {
    pub(super) fn new(query: &SearchQuery, result_count: u32, total_results: u32) -> Self {
        Self {
            key: SearchSnapshotKey::from(query),
            offset: query.offset,
            result_count,
            total_results,
        }
    }

    pub(super) fn resolve_range(&self, query: &SearchQuery) -> Option<SnapshotRange> {
        if query.offset == 0 || self.key != SearchSnapshotKey::from(query) {
            return None;
        }
        if query.offset >= self.total_results {
            return Some(SnapshotRange {
                local_offset: 0,
                limit: 0,
            });
        }

        let requested_end = query
            .offset
            .saturating_add(query.limit)
            .min(self.total_results);
        let snapshot_end = self.offset.saturating_add(self.result_count);
        if query.offset < self.offset || requested_end > snapshot_end {
            return None;
        }

        Some(SnapshotRange {
            local_offset: query.offset - self.offset,
            limit: requested_end - query.offset,
        })
    }

    pub(super) fn resolve_complete(&self, query: &SearchQuery) -> Option<SnapshotRange> {
        if self.offset != 0
            || self.key != SearchSnapshotKey::from(query)
            || self.result_count < self.total_results
        {
            return None;
        }

        Some(SnapshotRange {
            local_offset: 0,
            limit: self.result_count,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::everything::models::SearchSort;

    fn query(keyword: &str, offset: u32, limit: u32) -> SearchQuery {
        SearchQuery {
            keyword: keyword.to_string(),
            offset,
            limit,
            match_path: false,
            match_case: false,
            regex: false,
            whole_word: false,
            sort: SearchSort::NameAsc,
        }
    }

    #[test]
    fn resolves_a_page_inside_the_sdk_result_snapshot() {
        let snapshot = SearchResultSnapshot::new(&query("report", 0, 200), 10_000, 10_000);

        assert_eq!(
            snapshot.resolve_range(&query("report", 6_000, 200)),
            Some(SnapshotRange {
                local_offset: 6_000,
                limit: 200,
            })
        );
    }

    #[test]
    fn rejects_a_page_outside_the_sdk_result_snapshot() {
        let snapshot = SearchResultSnapshot::new(&query("report", 0, 200), 10_000, 20_000);

        assert_eq!(snapshot.resolve_range(&query("report", 12_000, 200)), None);
    }

    #[test]
    fn rejects_a_different_search_even_when_the_range_is_available() {
        let snapshot = SearchResultSnapshot::new(&query("report", 0, 200), 10_000, 10_000);

        assert_eq!(snapshot.resolve_range(&query("photo", 200, 200)), None);
    }

    #[test]
    fn resolves_only_complete_snapshots_for_native_lists() {
        let complete = SearchResultSnapshot::new(&query("report", 0, 200), 10_000, 10_000);
        let partial = SearchResultSnapshot::new(&query("report", 0, 200), 10_000, 20_000);

        assert_eq!(
            complete.resolve_complete(&query("report", 0, 200)),
            Some(SnapshotRange {
                local_offset: 0,
                limit: 10_000,
            })
        );
        assert_eq!(partial.resolve_complete(&query("report", 0, 200)), None);
    }
}
