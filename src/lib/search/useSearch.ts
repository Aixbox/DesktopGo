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
import type { SearchHit, SearchPage, SearchProvider, SearchQuery } from "./types";

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

type SearchQueryOptions = Omit<SearchQuery, "keyword" | "offset"> & {
  limit: number;
};

const buildQueryOptions = (settings: SearchSettings): SearchQueryOptions => ({
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

type PageCache = Record<number, SearchHit[]>;

interface SearchContext {
  seq: number;
  queryKey: string;
  queryKeyword: string;
  queryOptions: SearchQueryOptions;
  autoSelectFirst: boolean;
}

interface RangeRequest {
  seq: number;
  token: number;
  offset: number;
}

interface VisibleRange {
  start: number;
  end: number;
}

interface UseSearchResult {
  keyword: string;
  setKeyword: (value: string) => void;
  submitSearch: () => void;
  isKeywordCommitted: boolean;
  searchPending: boolean;
  hasCommittedQuery: boolean;
  loadedCount: number;
  getItemAt: (index: number) => SearchHit | null;
  setVisibleRange: (startIndex: number, endIndex: number) => void;
  requestRange: (startIndex: number, endIndex: number) => void;
  loading: boolean;
  loadingMore: boolean;
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
}

export function useSearch(): UseSearchResult {
  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SEARCH_SETTINGS);
  const [keyword, setKeywordState] = useState("");
  const [committedKeyword, setCommittedKeyword] = useState("");
  const [filter, setFilterState] = useState<SearchDefaultFilter>(DEFAULT_SEARCH_SETTINGS.defaultFilter);

  const [pages, setPages] = useState<PageCache>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchPending, setSearchPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<SearchProvider | null>(null);
  const [tookMs, setTookMs] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const requestSeqRef = useRef(0);
  const rangeRequestTokenRef = useRef(0);
  const activeQueryRef = useRef<SearchContext | null>(null);
  const pagesRef = useRef<PageCache>({});
  const totalResultsRef = useRef(0);
  const displayedItemsRef = useRef(new Map<number, SearchHit>());
  const visibleRangeRef = useRef<VisibleRange>({ start: 0, end: -1 });
  const requestedOffsetsRef = useRef(new Set<number>());
  const flushTimerRef = useRef<number | null>(null);
  const rangeRequestRef = useRef<RangeRequest | null>(null);

  const loadedCount = useMemo(
    () => Object.values(pages).reduce((sum, page) => sum + page.length, 0),
    [pages],
  );

  const setPagesAndRef = useCallback((nextPages: PageCache) => {
    pagesRef.current = nextPages;
    setPages(nextPages);
  }, []);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const invalidateRangeRequest = useCallback(() => {
    rangeRequestTokenRef.current += 1;
    rangeRequestRef.current = null;
    setLoadingMore(false);
  }, []);

  const resetSearchState = useCallback(() => {
    clearFlushTimer();
    invalidateRangeRequest();
    activeQueryRef.current = null;
    requestedOffsetsRef.current.clear();
    visibleRangeRef.current = { start: 0, end: -1 };
    displayedItemsRef.current.clear();
    totalResultsRef.current = 0;
    setPagesAndRef({});
    setLoading(false);
    setSearchPending(false);
    setError(null);
    setProvider(null);
    setTookMs(0);
    setTotalResults(0);
    setSelectedIndex(-1);
  }, [clearFlushTimer, invalidateRangeRequest, setPagesAndRef]);

  const prepareSearchRefresh = useCallback(() => {
    clearFlushTimer();
    invalidateRangeRequest();
    requestedOffsetsRef.current.clear();
    visibleRangeRef.current = { start: 0, end: -1 };
    displayedItemsRef.current.clear();
    setLoading(true);
    setSearchPending(true);
    setError(null);
    setSelectedIndex(-1);
  }, [clearFlushTimer, invalidateRangeRequest]);

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

  const isContextActive = useCallback((context: SearchContext) => {
    const current = activeQueryRef.current;
    return current?.seq === context.seq && current.queryKey === context.queryKey;
  }, []);

  const executeSearchWithRetry = useCallback(
    async (
      context: SearchContext,
      offset: number,
      retryAttempt = 0,
    ): Promise<SearchPage> => {
      try {
        return await searchFiles({
          keyword: context.queryKeyword,
          offset,
          ...context.queryOptions,
        });
      } catch (error) {
        if (isSearchBusyError(error) && isContextActive(context)) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, getBusyRetryDelay(retryAttempt));
          });
          return executeSearchWithRetry(context, offset, retryAttempt + 1);
        }
        throw error;
      }
    },
    [isContextActive],
  );

  const requestInitialPage = useCallback(
    (context: SearchContext) => {
      setLoading(true);
      void executeSearchWithRetry(context, 0)
        .then((page) => {
          if (!isContextActive(context)) return;

          setPagesAndRef({ 0: page.items });
          totalResultsRef.current = page.totalResults;
          setTotalResults(page.totalResults);
          setProvider(page.provider);
          setTookMs(page.tookMs);
          setError(null);
          setSelectedIndex(page.totalResults === 0 ? -1 : context.autoSelectFirst ? 0 : -1);
        })
        .catch((searchError) => {
          if (!isContextActive(context)) return;

          setPagesAndRef({});
          totalResultsRef.current = 0;
          setProvider(null);
          setTookMs(0);
          setTotalResults(0);
          setSelectedIndex(-1);
          setError(describeSearchRuntimeError(asErrorMessage(searchError)));
        })
        .finally(() => {
          if (!isContextActive(context)) return;
          setLoading(false);
          setSearchPending(false);
        });
    },
    [executeSearchWithRetry, isContextActive, setPagesAndRef],
  );

  const flushRequestedOffsets = useCallback(() => {
    flushTimerRef.current = null;

    const context = activeQueryRef.current;
    if (!context || loading) {
      return;
    }

    const pageSize = context.queryOptions.limit;
    const visibleStartPage =
      visibleRangeRef.current.end >= 0
        ? Math.floor(visibleRangeRef.current.start / pageSize) * pageSize
        : 0;

    const candidateOffsets = [...requestedOffsetsRef.current].filter((offset) => {
      if (offset < 0) return false;
      if (totalResultsRef.current > 0 && offset >= totalResultsRef.current) return false;
      return !pagesRef.current[offset];
    });

    requestedOffsetsRef.current.clear();

    if (candidateOffsets.length === 0) {
      return;
    }

    candidateOffsets.sort((left, right) => {
      const leftDistance = Math.abs(left - visibleStartPage);
      const rightDistance = Math.abs(right - visibleStartPage);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return left - right;
    });

    const nextOffset = candidateOffsets[0];
    const nextToken = rangeRequestTokenRef.current + 1;
    rangeRequestTokenRef.current = nextToken;
    rangeRequestRef.current = {
      seq: context.seq,
      token: nextToken,
      offset: nextOffset,
    };
    setLoadingMore(true);

    void executeSearchWithRetry(context, nextOffset)
      .then((page) => {
        if (!isContextActive(context)) return;

        const activeRangeRequest = rangeRequestRef.current;
        if (
          !activeRangeRequest ||
          activeRangeRequest.seq !== context.seq ||
          activeRangeRequest.token !== nextToken ||
          activeRangeRequest.offset !== nextOffset
        ) {
          return;
        }

        setPagesAndRef({
          ...pagesRef.current,
          [nextOffset]: page.items,
        });
        totalResultsRef.current = page.totalResults;
        setTotalResults(page.totalResults);
        setProvider(page.provider);
        setTookMs((currentTookMs) => currentTookMs + page.tookMs);
        setError(null);
      })
      .catch((searchError) => {
        if (!isContextActive(context)) return;

        const activeRangeRequest = rangeRequestRef.current;
        if (
          !activeRangeRequest ||
          activeRangeRequest.seq !== context.seq ||
          activeRangeRequest.token !== nextToken ||
          activeRangeRequest.offset !== nextOffset
        ) {
          return;
        }

        setError(describeSearchRuntimeError(asErrorMessage(searchError)));
      })
      .finally(() => {
        const activeRangeRequest = rangeRequestRef.current;
        if (
          activeRangeRequest &&
          activeRangeRequest.seq === context.seq &&
          activeRangeRequest.token === nextToken &&
          activeRangeRequest.offset === nextOffset
        ) {
          rangeRequestRef.current = null;
          setLoadingMore(false);
        }

        if (requestedOffsetsRef.current.size > 0) {
          clearFlushTimer();
          flushTimerRef.current = window.setTimeout(flushRequestedOffsets, 0);
        }
      });
  }, [clearFlushTimer, executeSearchWithRetry, isContextActive, loading, setPagesAndRef]);

  const scheduleOffsetRequest = useCallback(
    (offset: number) => {
      const context = activeQueryRef.current;
      if (!context || loading) return;

      const pageSize = context.queryOptions.limit;
      const normalizedOffset = Math.max(0, Math.floor(offset / pageSize) * pageSize);

      if (totalResultsRef.current > 0 && normalizedOffset >= totalResultsRef.current) {
        return;
      }
      if (pagesRef.current[normalizedOffset]) {
        return;
      }

      const activeRangeRequest = rangeRequestRef.current;
      if (
        activeRangeRequest &&
        activeRangeRequest.seq === context.seq &&
        activeRangeRequest.offset === normalizedOffset
      ) {
        return;
      }

      requestedOffsetsRef.current.add(normalizedOffset);
      clearFlushTimer();
      flushTimerRef.current = window.setTimeout(flushRequestedOffsets, 0);
    },
    [clearFlushTimer, flushRequestedOffsets, loading],
  );

  const requestRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const context = activeQueryRef.current;
      if (!context || endIndex < startIndex) return;

      const pageSize = context.queryOptions.limit;
      const safeStart = Math.max(0, startIndex);
      const maxEnd = totalResultsRef.current > 0 ? totalResultsRef.current - 1 : endIndex;
      const safeEnd = Math.max(safeStart, Math.min(endIndex, maxEnd));

      for (
        let offset = Math.floor(safeStart / pageSize) * pageSize;
        offset <= safeEnd;
        offset += pageSize
      ) {
        scheduleOffsetRequest(offset);
      }
    },
    [scheduleOffsetRequest],
  );

  const setVisibleRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const safeStart = Math.max(0, startIndex);
      visibleRangeRef.current = {
        start: safeStart,
        end: endIndex,
      };

      const context = activeQueryRef.current;
      if (!context || loading || endIndex < safeStart) {
        return;
      }

      const pageSize = context.queryOptions.limit;
      const safeEnd =
        totalResultsRef.current > 0
          ? Math.min(totalResultsRef.current - 1, endIndex)
          : endIndex;

      requestedOffsetsRef.current.clear();
      for (
        let offset = Math.floor(safeStart / pageSize) * pageSize;
        offset <= safeEnd;
        offset += pageSize
      ) {
        if (pagesRef.current[offset]) {
          continue;
        }

        const activeRangeRequest = rangeRequestRef.current;
        if (
          activeRangeRequest &&
          activeRangeRequest.seq === context.seq &&
          activeRangeRequest.offset === offset
        ) {
          continue;
        }

        requestedOffsetsRef.current.add(offset);
      }

      if (requestedOffsetsRef.current.size > 0) {
        clearFlushTimer();
        flushTimerRef.current = window.setTimeout(flushRequestedOffsets, 0);
      }
    },
    [clearFlushTimer, flushRequestedOffsets, loading],
  );

  const getItemAt = useCallback(
    (index: number): SearchHit | null => {
      if (index < 0) {
        return null;
      }

      const pageSize = activeQueryRef.current?.queryOptions.limit ?? settings.maxResultsPerPage;
      const pageOffset = Math.floor(index / pageSize) * pageSize;
      const page = pagesRef.current[pageOffset];
      const pageItem = page?.[index - pageOffset] ?? null;

      if (pageItem) {
        displayedItemsRef.current.set(index, pageItem);
        return pageItem;
      }

      scheduleOffsetRequest(pageOffset);
      return displayedItemsRef.current.get(index) ?? null;
    },
    [scheduleOffsetRequest, settings.maxResultsPerPage],
  );

  useEffect(() => {
    void loadSettingsAndFilter().catch((searchError) => {
      setError(describeSearchRuntimeError(asErrorMessage(searchError)));
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
      resetSearchState();
    }
  }, [keyword, resetSearchState]);

  useEffect(() => {
    const trimmedKeyword = committedKeyword.trim();
    if (!trimmedKeyword) {
      return;
    }

    const queryKeyword = buildSearchKeyword(trimmedKeyword, filter);
    const queryOptions = buildQueryOptions(settings);
    const queryKey = JSON.stringify({
      queryKeyword,
      filter,
      ...queryOptions,
      autoSelectFirst: settings.autoSelectFirst,
    });
    const seq = ++requestSeqRef.current;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;

      prepareSearchRefresh();
      const context: SearchContext = {
        seq,
        queryKey,
        queryKeyword,
        queryOptions,
        autoSelectFirst: settings.autoSelectFirst,
      };
      activeQueryRef.current = context;
      requestInitialPage(context);
    }, settings.debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    committedKeyword,
    filter,
    prepareSearchRefresh,
    requestInitialPage,
    settings,
  ]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    requestRange(selectedIndex, selectedIndex);
  }, [requestRange, selectedIndex]);

  useEffect(() => {
    if (totalResults === 0) {
      if (selectedIndex !== -1) {
        setSelectedIndex(-1);
      }
      return;
    }

    if (selectedIndex >= totalResults) {
      setSelectedIndex(totalResults - 1);
    }
  }, [selectedIndex, totalResults]);

  const reloadSettings = useCallback(async () => {
    await loadSettingsAndFilter();
  }, [loadSettingsAndFilter]);

  const setKeyword = useCallback(
    (value: string) => {
      setKeywordState(value);
      if (value.trim().length === 0) {
        setSearchPending(false);
        return;
      }
      if (settings.liveOnType) {
        setSearchPending(true);
      }
    },
    [settings.liveOnType],
  );

  const clear = useCallback(() => {
    setKeywordState("");
    setCommittedKeyword("");
    resetSearchState();
  }, [resetSearchState]);

  const moveSelection = useCallback(
    (delta: number) => {
      const resultCount = totalResults > 0 ? totalResults : loadedCount;
      if (resultCount === 0) return;

      setSelectedIndex((current) => {
        const safeCurrent = current < 0 ? 0 : current;
        return (safeCurrent + delta + resultCount) % resultCount;
      });
    },
    [loadedCount, totalResults],
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
        setSearchPending(true);
        setCommittedKeyword(keyword.trim());
      }
    },
    [keyword, settings.liveOnType, settings.rememberLastFilter],
  );

  const submitSearch = useCallback(() => {
    if (keyword.trim().length > 0) {
      setSearchPending(true);
    }
    setCommittedKeyword(keyword.trim());
  }, [keyword]);

  const isKeywordCommitted = keyword.trim() === committedKeyword.trim();
  const hasCommittedQuery = committedKeyword.trim().length > 0;

  return useMemo(
    () => ({
      keyword,
      setKeyword,
      submitSearch,
      isKeywordCommitted,
      searchPending,
      hasCommittedQuery,
      loadedCount,
      getItemAt,
      setVisibleRange,
      requestRange,
      loading,
      loadingMore,
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
    }),
    [
      clear,
      error,
      filter,
      getItemAt,
      hasCommittedQuery,
      isKeywordCommitted,
      keyword,
      loadedCount,
      loading,
      loadingMore,
      moveSelection,
      provider,
      reloadSettings,
      requestRange,
      searchPending,
      selectedIndex,
      setFilter,
      setVisibleRange,
      settings,
      submitSearch,
      tookMs,
      totalResults,
    ],
  );
}
