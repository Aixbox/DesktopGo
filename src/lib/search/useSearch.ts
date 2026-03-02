import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchFiles, startSearchRuntime } from "./api";
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
  includeHidden: boolean,
) => {
  const terms: string[] = [];
  if (filter === "files") {
    terms.push("file:");
  } else if (filter === "folders") {
    terms.push("folder:");
  }

  terms.push(keyword);

  if (!includeHidden) {
    terms.push("!attrib:h");
  }

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
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const requestSeqRef = useRef(0);
  const activeQueryKeyRef = useRef("");
  const runtimeStartedRef = useRef(false);

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
    if (!settings.autoStartRuntime || runtimeStartedRef.current) {
      return;
    }
    runtimeStartedRef.current = true;
    void startSearchRuntime().catch(() => {
      // Keep lazy retry on first query.
    });
  }, [settings.autoStartRuntime]);

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
      setSelectedIndex(-1);
      activeQueryKeyRef.current = "";
    }
  }, [keyword]);

  useEffect(() => {
    const trimmedKeyword = committedKeyword.trim();
    if (!trimmedKeyword) {
      return;
    }

    const queryKeyword = buildSearchKeyword(trimmedKeyword, filter, settings.includeHidden);
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
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadingMore(false);
      setError(null);
      void searchFiles({
        keyword: queryKeyword,
        ...buildQueryOptions(settings, 0),
      })
        .then((page) => {
          if (requestSeqRef.current !== seq || activeQueryKeyRef.current !== queryKey) return;
          setItems(page.items);
          setProvider(page.provider);
          setTookMs(page.tookMs);
          setHasMore(page.hasMore);
          setSelectedIndex(
            page.items.length === 0 ? -1 : settings.autoSelectFirst ? 0 : -1,
          );
        })
        .catch((e) => {
          if (requestSeqRef.current !== seq || activeQueryKeyRef.current !== queryKey) return;
          setItems([]);
          setProvider(null);
          setTookMs(0);
          setHasMore(false);
          setSelectedIndex(-1);
          setError(describeSearchRuntimeError(asErrorMessage(e)));
        })
        .finally(() => {
          if (requestSeqRef.current === seq && activeQueryKeyRef.current === queryKey) {
            setLoading(false);
          }
        });
    }, settings.debounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    committedKeyword,
    filter,
    settings.autoSelectFirst,
    settings.debounceMs,
    settings.includeHidden,
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

    const queryKeyword = buildSearchKeyword(trimmedKeyword, filter, settings.includeHidden);
    void searchFiles({
      keyword: queryKeyword,
      ...buildQueryOptions(settings, items.length),
    })
      .then((page) => {
        if (requestSeqRef.current !== seq || activeQueryKeyRef.current !== queryKey) return;
        setItems((prev) => [...prev, ...page.items]);
        setProvider(page.provider);
        setTookMs((prev) => prev + page.tookMs);
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
      tookMs,
    ],
  );
}
