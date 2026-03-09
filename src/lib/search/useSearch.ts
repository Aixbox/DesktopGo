import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchFiles } from "./api";
import {
  DEFAULT_SEARCH_SETTINGS,
  describeSearchRuntimeError,
  loadLastFilter,
  loadSearchSettings,
  saveLastFilter,
  type SearchDefaultFilter,
  type SearchSettings,
} from "./settings";
import type { SearchHit, SearchProvider, SearchQuery } from "./types";

const buildSearchKeyword = (
  keyword: string,
  filter: SearchDefaultFilter,
) => {
  const terms: string[] = [];
  if (filter === "files") {
    terms.push("file:");
  } else if (filter === "folders") {
    terms.push("folder:");
  }

  terms.push(keyword);

  return terms.join(" ").trim();
};

const buildQueryOptions = (settings: SearchSettings, offset: number): Omit<SearchQuery, "keyword"> => ({
  offset,
  limit: settings.maxResultsPerPage,
  matchPath: settings.matchPath,
  matchCase: settings.matchCase,
  regex: settings.regex,
  wholeWord: settings.matchWholeWord,
  sort: settings.sortBy,
});

const asErrorMessage = (error: unknown) => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
};

const SEARCH_BUSY_PREFIX = "EverythingBusy";
const SEARCH_BUSY_RETRY_BASE_MS = 250;
const SEARCH_BUSY_RETRY_MAX_MS = 1_000;

const isSearchBusyError = (error: unknown) =>
  asErrorMessage(error).startsWith(SEARCH_BUSY_PREFIX);

const getBusyRetryDelay = (attempt: number) =>
  Math.min(SEARCH_BUSY_RETRY_BASE_MS * (attempt + 1), SEARCH_BUSY_RETRY_MAX_MS);

interface UseSearchResult {
  keyword: string;
  setKeyword: (value: string) => void;
  submitSearch: () => void;
  isKeywordCommitted: boolean;
  items: SearchHit[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  provider: SearchProvider | null;
  tookMs: number;
  totalResults: number;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  moveSelection: (delta: number) => void;
  clear: () => void;
  filter: SearchDefaultFilter;
  setFilter: (filter: SearchDefaultFilter) => void;
  settings: SearchSettings;
  reloadSettings: () => Promise<void>;
  loadMore: () => void;
}

export function useSearch(): UseSearchResult {
  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SEARCH_SETTINGS);
  const [keyword, setKeyword] = useState("");
  const [committedKeyword, setCommittedKeyword] = useState("");
  const [filter, setFilterState] = useState<SearchDefaultFilter>(DEFAULT_SEARCH_SETTINGS.defaultFilter);

  const [items, setItems] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<SearchProvider | null>(null);
  const [tookMs, setTookMs] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const requestSeqRef = useRef(0);
  const activeQueryKeyRef = useRef("");

  const loadSettingsAndFilter = useCallback(async () => {
    const loaded = await loadSearchSettings();
    let nextFilter = loaded.defaultFilter;
    if (loaded.rememberLastFilter) {
      const saved = await loadLastFilter();
      if (saved) {
        nextFilter = saved;
      }
    }
    setSettings(loaded);
    setFilterState(nextFilter);
  }, []);

  useEffect(() => {
    void loadSettingsAndFilter().catch((e) => {
      setError(describeSearchRuntimeError(asErrorMessage(e)));
    });
  }, [loadSettingsAndFilter]);

  useEffect(() => {
    if (settings.liveOnType) {
      setCommittedKeyword(keyword.trim());
    }
  }, [keyword, settings.liveOnType]);

  useEffect(() => {
    if (keyword.trim().length === 0) {
      setCommittedKeyword("");
      setItems([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      setError(null);
      setProvider(null);
      setTookMs(0);
      setTotalResults(0);
      setSelectedIndex(-1);
      activeQueryKeyRef.current = "";
    }
  }, [keyword]);

  useEffect(() => {
    const trimmedKeyword = committedKeyword.trim();
    if (!trimmedKeyword) {
      return;
    }

    const queryKeyword = buildSearchKeyword(trimmedKeyword, filter);
    const queryKey = JSON.stringify({
      queryKeyword,
      filter,
      limit: settings.maxResultsPerPage,
      matchPath: settings.matchPath,
      matchCase: settings.matchCase,
      regex: settings.regex,
      wholeWord: settings.matchWholeWord,
      sortBy: settings.sortBy,
    });

    activeQueryKeyRef.current = queryKey;
    const seq = ++requestSeqRef.current;
    let retryTimer: number | null = null;
    let cancelled = false;

    const runSearch = (retryAttempt: number) => {
      if (cancelled) return;
      if (requestSeqRef.current !== seq || activeQueryKeyRef.current !== queryKey) return;

      setLoading(true);
      setLoadingMore(false);
      setError(null);

      let scheduledRetry = false;
      void searchFiles({
        keyword: queryKeyword,
        ...buildQueryOptions(settings, 0),
      })
        .then((page) => {
          if (requestSeqRef.current !== seq || activeQueryKeyRef.current !== queryKey) return;
          setItems(page.items);
          setProvider(page.provider);
          setTookMs(page.tookMs);
          setTotalResults(page.totalResults);
          setHasMore(page.hasMore);
          setSelectedIndex(
            page.items.length === 0 ? -1 : settings.autoSelectFirst ? 0 : -1,
          );
        })
        .catch((e) => {
          if (requestSeqRef.current !== seq || activeQueryKeyRef.current !== queryKey) return;
          if (isSearchBusyError(e)) {
            scheduledRetry = true;
            retryTimer = window.setTimeout(() => {
              retryTimer = null;
              runSearch(retryAttempt + 1);
            }, getBusyRetryDelay(retryAttempt));
            return;
          }
          setItems([]);
          setProvider(null);
          setTookMs(0);
          setTotalResults(0);
          setHasMore(false);
          setSelectedIndex(-1);
          setError(describeSearchRuntimeError(asErrorMessage(e)));
        })
        .finally(() => {
          if (scheduledRetry || cancelled) {
            return;
          }
          if (requestSeqRef.current === seq && activeQueryKeyRef.current === queryKey) {
            setLoading(false);
          }
        });
    };

    const timer = window.setTimeout(() => {
      runSearch(0);
    }, settings.debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [
    committedKeyword,
    filter,
    settings.autoSelectFirst,
    settings.debounceMs,
    settings.matchCase,
    settings.matchPath,
    settings.matchWholeWord,
    settings.maxResultsPerPage,
    settings.regex,
    settings.sortBy,
  ]);

  const reloadSettings = useCallback(async () => {
    await loadSettingsAndFilter();
  }, [loadSettingsAndFilter]);

  const clear = useCallback(() => {
    setKeyword("");
    setCommittedKeyword("");
    setItems([]);
    setLoading(false);
    setLoadingMore(false);
    setHasMore(false);
    setError(null);
    setProvider(null);
    setTookMs(0);
    setTotalResults(0);
    setSelectedIndex(-1);
    activeQueryKeyRef.current = "";
  }, []);

  const moveSelection = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      setSelectedIndex((current) => {
        const safeCurrent = current < 0 ? 0 : current;
        return (safeCurrent + delta + items.length) % items.length;
      });
    },
    [items.length],
  );

  const setFilter = useCallback(
    (nextFilter: SearchDefaultFilter) => {
      setFilterState(nextFilter);
      if (settings.rememberLastFilter) {
        void saveLastFilter(nextFilter).catch(() => {
          // Ignore persistence failure for filter cache.
        });
      }
      if (settings.liveOnType) {
        setCommittedKeyword(keyword.trim());
      }
    },
    [keyword, settings.liveOnType, settings.rememberLastFilter],
  );

  const submitSearch = useCallback(() => {
    setCommittedKeyword(keyword.trim());
  }, [keyword]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore || items.length === 0) return;
    const queryKey = activeQueryKeyRef.current;
    const trimmedKeyword = committedKeyword.trim();
    if (!queryKey || !trimmedKeyword) return;

    const seq = ++requestSeqRef.current;
    setLoadingMore(true);
    setError(null);

    const queryKeyword = buildSearchKeyword(trimmedKeyword, filter);
    void searchFiles({
      keyword: queryKeyword,
      ...buildQueryOptions(settings, items.length),
    })
      .then((page) => {
        if (requestSeqRef.current !== seq || activeQueryKeyRef.current !== queryKey) return;
        setItems((prev) => [...prev, ...page.items]);
        setProvider(page.provider);
        setTookMs((prev) => prev + page.tookMs);
        setTotalResults(page.totalResults);
        setHasMore(page.hasMore);
      })
      .catch((e) => {
        if (requestSeqRef.current !== seq || activeQueryKeyRef.current !== queryKey) return;
        setError(describeSearchRuntimeError(asErrorMessage(e)));
      })
      .finally(() => {
        if (requestSeqRef.current === seq && activeQueryKeyRef.current === queryKey) {
          setLoadingMore(false);
        }
      });
  }, [
    committedKeyword,
    filter,
    hasMore,
    items.length,
    loading,
    loadingMore,
    settings,
  ]);

  const isKeywordCommitted = keyword.trim() === committedKeyword.trim();

  return useMemo(
    () => ({
      keyword,
      setKeyword,
      submitSearch,
      isKeywordCommitted,
      items,
      loading,
      loadingMore,
      hasMore,
      error,
      provider,
      tookMs,
      totalResults,
      selectedIndex,
      setSelectedIndex,
      moveSelection,
      clear,
      filter,
      setFilter,
      settings,
      reloadSettings,
      loadMore,
    }),
    [
      clear,
      error,
      filter,
      hasMore,
      items,
      keyword,
      loadMore,
      loading,
      loadingMore,
      moveSelection,
      provider,
      reloadSettings,
      selectedIndex,
      setFilter,
      settings,
      submitSearch,
      isKeywordCommitted,
      totalResults,
      tookMs,
    ],
  );
}
