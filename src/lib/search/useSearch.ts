import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCompleteSearchSnapshot, searchFiles } from './api'
import { buildSearchKeyword } from './filters'
import { buildSearchPriorityRules } from './priority'
import { rankSearchPageItems } from './relevance'
import { selectNextSearchOffset } from './rangeScheduling'
import { clampSearchSelection, resolveCommittedKeyword } from './searchState'
import {
  countCachedSearchResults,
  getCachedSearchResult,
  resolveCompleteSearchSnapshot,
  type SearchPageCache,
} from './resultCache'
import {
  addSearchHistoryEntry,
  clearSearchHistory,
  loadSearchHistory,
  removeSearchHistoryEntry,
  type SearchHistoryEntry,
} from './history'
import {
  DEFAULT_SEARCH_SETTINGS,
  describeSearchRuntimeError,
  getSearchRuntimeStateFromError,
  loadLastFilter,
  loadSearchSettings,
  saveLastFilter,
  type SearchDefaultFilter,
  type SearchSettings,
} from './settings'
import type {
  SearchHit,
  SearchPage,
  SearchProvider,
  SearchQuery,
  SearchRuntimeState,
  SearchSort,
} from './types'

type SearchQueryOptions = Omit<SearchQuery, 'keyword' | 'offset'> & {
  limit: number
}

const buildQueryOptions = (
  settings: SearchSettings,
  options: {
    matchPath: boolean
    matchCase: boolean
    regex: boolean
    wholeWord: boolean
    sort: SearchSort
  }
): SearchQueryOptions => ({
  limit: settings.maxResultsPerPage,
  matchPath: options.matchPath,
  matchCase: options.matchCase,
  regex: options.regex,
  wholeWord: options.wholeWord,
  sort: options.sort,
})

const asErrorMessage = (error: unknown) => {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

const SEARCH_BUSY_PREFIX = 'EverythingBusy'
const SEARCH_BUSY_RETRY_BASE_MS = 250
const SEARCH_BUSY_RETRY_MAX_MS = 1_000
const mergeHighPriorityHits = (current: SearchHit[], incoming: SearchHit[]): SearchHit[] => {
  const seen = new Set(current.map(hit => hit.path))
  const added = incoming.filter(hit => !seen.has(hit.path))
  return added.length === 0 ? current : [...current, ...added]
}

const isSearchBusyError = (error: unknown) => asErrorMessage(error).startsWith(SEARCH_BUSY_PREFIX)

const getBusyRetryDelay = (attempt: number) =>
  Math.min(SEARCH_BUSY_RETRY_BASE_MS * (attempt + 1), SEARCH_BUSY_RETRY_MAX_MS)

interface SearchContext {
  seq: number
  queryKey: string
  queryKeyword: string
  queryOptions: SearchQueryOptions
  autoSelectFirst: boolean
}

interface RangeRequest {
  seq: number
  token: number
  offset: number
}

interface VisibleRange {
  start: number
  end: number
}

interface UseSearchResult {
  keyword: string
  setKeyword: (value: string) => void
  submitSearch: () => void
  isKeywordCommitted: boolean
  searchPending: boolean
  hasCommittedQuery: boolean
  loadedCount: number
  /** 已加载结果的头部若干条，供「最佳匹配」挑选高优先级候选。 */
  bestMatchCandidates: SearchHit[]
  getItemAt: (index: number) => SearchHit | null
  setVisibleRange: (startIndex: number, endIndex: number) => void
  requestRange: (startIndex: number, endIndex: number) => void
  loading: boolean
  loadingMore: boolean
  error: string | null
  runtimeState: SearchRuntimeState
  provider: SearchProvider | null
  tookMs: number
  totalResults: number
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  moveSelection: (delta: number) => void
  resetResults: () => void
  clear: () => void
  filter: SearchDefaultFilter
  setFilter: (filter: SearchDefaultFilter) => void
  matchPath: boolean
  setMatchPath: (value: boolean) => void
  matchCase: boolean
  setMatchCase: (value: boolean) => void
  regex: boolean
  setRegex: (value: boolean) => void
  wholeWord: boolean
  setWholeWord: (value: boolean) => void
  sort: SearchSort
  setSort: (sort: SearchSort) => void
  history: SearchHistoryEntry[]
  applyHistoryEntry: (entry: SearchHistoryEntry) => void
  removeHistoryEntry: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
  recordCurrentSearch: () => Promise<void>
  settings: SearchSettings
  reloadSettings: () => Promise<void>
}

type UseSearchOptions = { enabled?: boolean }

export function useSearch({ enabled = true }: UseSearchOptions = {}): UseSearchResult {
  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SEARCH_SETTINGS)
  const [keyword, setKeywordState] = useState('')
  const [submittedKeyword, setSubmittedKeyword] = useState('')
  const [filter, setFilterState] = useState<SearchDefaultFilter>(
    DEFAULT_SEARCH_SETTINGS.defaultFilter
  )
  const [matchPath, setMatchPathState] = useState(DEFAULT_SEARCH_SETTINGS.matchPath)
  const [matchCase, setMatchCaseState] = useState(DEFAULT_SEARCH_SETTINGS.matchCase)
  const [regex, setRegexState] = useState(DEFAULT_SEARCH_SETTINGS.regex)
  const [wholeWord, setWholeWordState] = useState(DEFAULT_SEARCH_SETTINGS.matchWholeWord)
  const [sort, setSortState] = useState<SearchSort>(DEFAULT_SEARCH_SETTINGS.sortBy)
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])

  const [pages, setPages] = useState<SearchPageCache>({})
  const [completeItems, setCompleteItems] = useState<SearchHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchPending, setSearchPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runtimeState, setRuntimeState] = useState<SearchRuntimeState>('unknown')
  const [provider, setProvider] = useState<SearchProvider | null>(null)
  const [tookMs, setTookMs] = useState(0)
  const [totalResults, setTotalResults] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const requestSeqRef = useRef(0)
  const rangeRequestTokenRef = useRef(0)
  const activeQueryRef = useRef<SearchContext | null>(null)
  const pagesRef = useRef<SearchPageCache>({})
  const completeItemsRef = useRef<SearchHit[] | null>(null)
  const totalResultsRef = useRef(0)
  const visibleRangeRef = useRef<VisibleRange>({ start: 0, end: -1 })
  const requestedOffsetsRef = useRef(new Set<number>())
  const flushTimerRef = useRef<number | null>(null)
  const rangeRequestRef = useRef<RangeRequest | null>(null)

  const loadedCount = useMemo(
    () => completeItems?.length ?? countCachedSearchResults(pages),
    [completeItems, pages]
  )

  /**
   * 「最佳匹配」的文件候选：当前已加载结果里**全部**高优先级命中，不截断。
   * 由相关性排序在打分时顺带收集（优先级本来就要为每条结果算一次）。
   */
  const [bestMatchCandidates, setHighPriorityHits] = useState<SearchHit[]>([])

  /**
   * 优先级规则跟着设置走：自定义的高优先级目录和内置目录同权，既影响这里的结果排序，
   * 也决定哪些命中够格进「最佳匹配」。排序发生在异步回调里，所以额外用 ref 持有最新
   * 规则 —— 用户改完设置回到主窗口后，下一次排序立刻用新规则，不必重跑当前查询。
   */
  const priorityRules = useMemo(
    () => buildSearchPriorityRules(settings.bestMatchFolders),
    [settings.bestMatchFolders]
  )
  const priorityRulesRef = useRef(priorityRules)
  useEffect(() => {
    priorityRulesRef.current = priorityRules
  }, [priorityRules])
  const committedKeyword = resolveCommittedKeyword({
    keyword,
    submittedKeyword,
    liveOnType: settings.liveOnType,
  })

  const setPagesAndRef = useCallback((nextPages: SearchPageCache) => {
    pagesRef.current = nextPages
    setPages(nextPages)
  }, [])

  const setCompleteItemsAndRef = useCallback((items: SearchHit[] | null) => {
    completeItemsRef.current = items
    setCompleteItems(items)
  }, [])

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
  }, [])

  const invalidateRangeRequest = useCallback(() => {
    rangeRequestTokenRef.current += 1
    rangeRequestRef.current = null
    setLoadingMore(false)
  }, [])

  const resetSearchState = useCallback(() => {
    clearFlushTimer()
    invalidateRangeRequest()
    activeQueryRef.current = null
    requestedOffsetsRef.current.clear()
    visibleRangeRef.current = { start: 0, end: -1 }
    setCompleteItemsAndRef(null)
    totalResultsRef.current = 0
    setPagesAndRef({})
    setHighPriorityHits([])
    setLoading(false)
    setSearchPending(false)
    setError(null)
    setRuntimeState('unknown')
    setProvider(null)
    setTookMs(0)
    setTotalResults(0)
    setSelectedIndex(-1)
  }, [clearFlushTimer, invalidateRangeRequest, setCompleteItemsAndRef, setPagesAndRef])

  const prepareSearchRefresh = useCallback(() => {
    clearFlushTimer()
    invalidateRangeRequest()
    requestedOffsetsRef.current.clear()
    visibleRangeRef.current = { start: 0, end: -1 }
    setCompleteItemsAndRef(null)
    setPagesAndRef({})
    setHighPriorityHits([])
    totalResultsRef.current = 0
    setTotalResults(0)
    setLoading(true)
    setSearchPending(true)
    setError(null)
    setSelectedIndex(-1)
  }, [clearFlushTimer, invalidateRangeRequest, setCompleteItemsAndRef, setPagesAndRef])

  const applySearchConfiguration = useCallback(
    (loaded: SearchSettings, nextFilter: SearchDefaultFilter) => {
      setSettings(loaded)
      setFilterState(nextFilter)
      setMatchPathState(loaded.matchPath)
      setMatchCaseState(loaded.matchCase)
      setRegexState(loaded.regex)
      setWholeWordState(loaded.matchWholeWord)
      setSortState(loaded.sortBy)
    },
    []
  )

  const loadSettingsAndFilter = useCallback(async () => {
    const loaded = await loadSearchSettings()
    let nextFilter = loaded.defaultFilter
    if (loaded.rememberLastFilter) {
      const saved = await loadLastFilter()
      if (saved) {
        nextFilter = saved
      }
    }
    applySearchConfiguration(loaded, nextFilter)
  }, [applySearchConfiguration])

  const isContextActive = useCallback((context: SearchContext) => {
    const current = activeQueryRef.current
    return current?.seq === context.seq && current.queryKey === context.queryKey
  }, [])

  const executeSearchWithRetry = useCallback(
    async (context: SearchContext, offset: number): Promise<SearchPage> => {
      let retryAttempt = 0

      while (true) {
        try {
          return await searchFiles({
            keyword: context.queryKeyword,
            offset,
            ...context.queryOptions,
          })
        } catch (error) {
          if (!isSearchBusyError(error) || !isContextActive(context)) {
            throw error
          }
          await new Promise<void>(resolve => {
            window.setTimeout(resolve, getBusyRetryDelay(retryAttempt))
          })
          retryAttempt += 1
        }
      }
    },
    [isContextActive]
  )

  const requestInitialPage = useCallback(
    (context: SearchContext) => {
      setLoading(true)
      void executeSearchWithRetry(context, 0)
        .then(async page => {
          if (!isContextActive(context)) return

          let exactItems = resolveCompleteSearchSnapshot(page.items, page.totalResults)
          if (!exactItems && page.totalResults > 0) {
            try {
              const snapshotItems = await getCompleteSearchSnapshot({
                keyword: context.queryKeyword,
                offset: 0,
                limit: page.totalResults,
                matchPath: context.queryOptions.matchPath,
                matchCase: context.queryOptions.matchCase,
                regex: context.queryOptions.regex,
                wholeWord: context.queryOptions.wholeWord,
                sort: context.queryOptions.sort,
              })
              if (!isContextActive(context)) return
              exactItems = resolveCompleteSearchSnapshot(snapshotItems, page.totalResults)
            } catch {
              // Very large result sets fall back to sparse range loading.
            }
          }

          if (!isContextActive(context)) return
          if (exactItems) {
            const ranked = rankSearchPageItems(exactItems, context, priorityRulesRef.current)
            setCompleteItemsAndRef(ranked.items)
            setPagesAndRef({})
            setHighPriorityHits(ranked.highPriorityItems)
          } else {
            const ranked = rankSearchPageItems(page.items, context, priorityRulesRef.current)
            setCompleteItemsAndRef(null)
            setPagesAndRef({ 0: ranked.items })
            setHighPriorityHits(ranked.highPriorityItems)
          }
          totalResultsRef.current = page.totalResults
          setTotalResults(page.totalResults)
          setProvider(page.provider)
          setRuntimeState(page.runtimeState)
          setTookMs(page.tookMs)
          setError(null)
          setSelectedIndex(page.totalResults === 0 ? -1 : context.autoSelectFirst ? 0 : -1)
        })
        .catch(searchError => {
          if (!isContextActive(context)) return

          setPagesAndRef({})
          totalResultsRef.current = 0
          setProvider(null)
          setTookMs(0)
          setTotalResults(0)
          setSelectedIndex(-1)
          const rawMessage = asErrorMessage(searchError)
          setRuntimeState(getSearchRuntimeStateFromError(rawMessage))
          setError(describeSearchRuntimeError(rawMessage))
        })
        .finally(() => {
          if (!isContextActive(context)) return
          setLoading(false)
          setSearchPending(false)
        })
    },
    [executeSearchWithRetry, isContextActive, setCompleteItemsAndRef, setPagesAndRef]
  )

  const flushRequestedOffsets = useCallback(async () => {
    flushTimerRef.current = null

    while (true) {
      const context = activeQueryRef.current
      if (!context || completeItemsRef.current || loading || rangeRequestRef.current) return

      const pageSize = context.queryOptions.limit
      const visibleStartPage =
        visibleRangeRef.current.end >= 0
          ? Math.floor(visibleRangeRef.current.start / pageSize) * pageSize
          : 0
      const visibleCandidates: number[] = []

      if (visibleRangeRef.current.end >= visibleRangeRef.current.start) {
        const safeStart = Math.max(0, visibleRangeRef.current.start)
        const safeEnd =
          totalResultsRef.current > 0
            ? Math.min(totalResultsRef.current - 1, visibleRangeRef.current.end)
            : visibleRangeRef.current.end

        for (
          let offset = Math.floor(safeStart / pageSize) * pageSize;
          offset <= safeEnd;
          offset += pageSize
        ) {
          if (offset < 0) continue
          if (totalResultsRef.current > 0 && offset >= totalResultsRef.current) continue
          if (pagesRef.current[offset]) continue
          visibleCandidates.push(offset)
        }
      }

      const requestedOffsets = [...requestedOffsetsRef.current].filter(offset => {
        if (offset < 0) return false
        if (totalResultsRef.current > 0 && offset >= totalResultsRef.current) return false
        return !pagesRef.current[offset]
      })
      requestedOffsetsRef.current.clear()

      const nextOffset = selectNextSearchOffset({
        visibleCandidates,
        requestedOffsets,
        visibleStartPage,
      })
      if (nextOffset === null) return

      const nextToken = rangeRequestTokenRef.current + 1
      rangeRequestTokenRef.current = nextToken
      rangeRequestRef.current = { seq: context.seq, token: nextToken, offset: nextOffset }
      setLoadingMore(true)

      try {
        const page = await executeSearchWithRetry(context, nextOffset)
        if (!isContextActive(context)) return

        const activeRangeRequest = rangeRequestRef.current
        if (
          !activeRangeRequest ||
          activeRangeRequest.seq !== context.seq ||
          activeRangeRequest.token !== nextToken ||
          activeRangeRequest.offset !== nextOffset
        ) {
          return
        }

        const ranked = rankSearchPageItems(page.items, context, priorityRulesRef.current)
        setPagesAndRef({
          ...pagesRef.current,
          [nextOffset]: ranked.items,
        })
        // 后续分页里新出现的高优先级命中并入候选池，去重后保持先到先得。
        if (ranked.highPriorityItems.length > 0) {
          setHighPriorityHits(current => mergeHighPriorityHits(current, ranked.highPriorityItems))
        }
        totalResultsRef.current = page.totalResults
        setTotalResults(page.totalResults)
        setSelectedIndex(current => clampSearchSelection(current, page.totalResults))
        setProvider(page.provider)
        setRuntimeState(page.runtimeState)
        setTookMs(currentTookMs => currentTookMs + page.tookMs)
        setError(null)
      } catch (searchError) {
        if (!isContextActive(context)) return

        const activeRangeRequest = rangeRequestRef.current
        if (
          !activeRangeRequest ||
          activeRangeRequest.seq !== context.seq ||
          activeRangeRequest.token !== nextToken ||
          activeRangeRequest.offset !== nextOffset
        ) {
          return
        }

        const rawMessage = asErrorMessage(searchError)
        setRuntimeState(getSearchRuntimeStateFromError(rawMessage))
        setError(describeSearchRuntimeError(rawMessage))
      } finally {
        const activeRangeRequest = rangeRequestRef.current
        if (
          activeRangeRequest &&
          activeRangeRequest.seq === context.seq &&
          activeRangeRequest.token === nextToken &&
          activeRangeRequest.offset === nextOffset
        ) {
          rangeRequestRef.current = null
          setLoadingMore(false)
        }
      }

      await new Promise<void>(resolve => window.setTimeout(resolve, 0))
    }
  }, [executeSearchWithRetry, isContextActive, loading, setPagesAndRef])

  const scheduleOffsetRequest = useCallback(
    (offset: number) => {
      const context = activeQueryRef.current
      if (!context || completeItemsRef.current || loading) return

      const pageSize = context.queryOptions.limit
      const normalizedOffset = Math.max(0, Math.floor(offset / pageSize) * pageSize)

      if (totalResultsRef.current > 0 && normalizedOffset >= totalResultsRef.current) {
        return
      }
      if (pagesRef.current[normalizedOffset]) {
        return
      }

      const activeRangeRequest = rangeRequestRef.current
      if (
        activeRangeRequest &&
        activeRangeRequest.seq === context.seq &&
        activeRangeRequest.offset === normalizedOffset
      ) {
        return
      }

      requestedOffsetsRef.current.add(normalizedOffset)
      if (!rangeRequestRef.current) {
        clearFlushTimer()
        flushTimerRef.current = window.setTimeout(flushRequestedOffsets, 0)
      }
    },
    [clearFlushTimer, flushRequestedOffsets, loading]
  )

  const requestRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const context = activeQueryRef.current
      if (!context || completeItemsRef.current || endIndex < startIndex) return

      const pageSize = context.queryOptions.limit
      const safeStart = Math.max(0, startIndex)
      const maxEnd = totalResultsRef.current > 0 ? totalResultsRef.current - 1 : endIndex
      const safeEnd = Math.max(safeStart, Math.min(endIndex, maxEnd))

      for (
        let offset = Math.floor(safeStart / pageSize) * pageSize;
        offset <= safeEnd;
        offset += pageSize
      ) {
        scheduleOffsetRequest(offset)
      }
    },
    [scheduleOffsetRequest]
  )

  const setVisibleRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const safeStart = Math.max(0, startIndex)
      visibleRangeRef.current = {
        start: safeStart,
        end: endIndex,
      }

      const context = activeQueryRef.current
      if (!context || completeItemsRef.current || loading || endIndex < safeStart) {
        return
      }

      if (!rangeRequestRef.current) {
        clearFlushTimer()
        flushTimerRef.current = window.setTimeout(flushRequestedOffsets, 0)
      }
    },
    [clearFlushTimer, flushRequestedOffsets, loading]
  )

  const getItemAt = useCallback(
    (index: number): SearchHit | null =>
      getCachedSearchResult({
        index,
        completeItems: completeItemsRef.current,
        pages: pagesRef.current,
        pageSize: activeQueryRef.current?.queryOptions.limit ?? settings.maxResultsPerPage,
      }),
    [settings.maxResultsPerPage]
  )
  useEffect(() => {
    void loadSearchSettings()
      .then(async loaded => {
        const savedFilter = loaded.rememberLastFilter ? await loadLastFilter() : null
        applySearchConfiguration(loaded, savedFilter ?? loaded.defaultFilter)
      })
      .catch(searchError => {
        setError(describeSearchRuntimeError(asErrorMessage(searchError)))
      })
  }, [applySearchConfiguration])

  useEffect(() => {
    void loadSearchHistory()
      .then(entries => {
        setHistory(entries)
      })
      .catch(searchError => {
        setError(describeSearchRuntimeError(asErrorMessage(searchError)))
      })
  }, [])

  useEffect(() => {
    if (enabled) return
    requestSeqRef.current += 1
    activeQueryRef.current = null
    clearFlushTimer()
    requestedOffsetsRef.current.clear()
    rangeRequestTokenRef.current += 1
    rangeRequestRef.current = null
  }, [clearFlushTimer, enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const trimmedKeyword = committedKeyword.trim()
    if (!trimmedKeyword) {
      return
    }

    const queryKeyword = buildSearchKeyword(trimmedKeyword, filter)
    const queryOptions = buildQueryOptions(settings, {
      matchPath,
      matchCase,
      regex,
      wholeWord,
      sort,
    })
    const queryKey = JSON.stringify({
      queryKeyword,
      filter,
      ...queryOptions,
      autoSelectFirst: settings.autoSelectFirst,
    })
    const seq = ++requestSeqRef.current

    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return

      prepareSearchRefresh()
      const context: SearchContext = {
        seq,
        queryKey,
        queryKeyword,
        queryOptions,
        autoSelectFirst: settings.autoSelectFirst,
      }
      activeQueryRef.current = context
      requestInitialPage(context)
    }, settings.debounceMs)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    committedKeyword,
    enabled,
    filter,
    matchCase,
    matchPath,
    prepareSearchRefresh,
    regex,
    requestInitialPage,
    settings,
    sort,
    wholeWord,
  ])

  useEffect(() => {
    if (selectedIndex < 0) return
    requestRange(selectedIndex, selectedIndex)
  }, [requestRange, selectedIndex])

  const reloadSettings = useCallback(async () => {
    await loadSettingsAndFilter()
  }, [loadSettingsAndFilter])

  const refreshCurrentQuery = useCallback(() => {
    if (!enabled) {
      return
    }
    if (!keyword.trim()) {
      return
    }
    if (settings.liveOnType) {
      setSearchPending(true)
    }
  }, [enabled, keyword, settings.liveOnType])

  const recordCurrentSearch = useCallback(async () => {
    const trimmedKeyword = keyword.trim()
    if (!trimmedKeyword) {
      return
    }

    const nextHistory = await addSearchHistoryEntry({
      keyword: trimmedKeyword,
      filter,
      matchPath,
      matchCase,
      regex,
      wholeWord,
      sort,
    })
    setHistory(nextHistory)
  }, [filter, keyword, matchCase, matchPath, regex, sort, wholeWord])

  const setKeyword = useCallback(
    (value: string) => {
      setKeywordState(value)
      if (value.trim().length === 0) {
        setSubmittedKeyword('')
        resetSearchState()
        return
      }
      if (enabled && settings.liveOnType) {
        setSearchPending(true)
      }
    },
    [enabled, resetSearchState, settings.liveOnType]
  )

  const clear = useCallback(() => {
    setKeywordState('')
    setSubmittedKeyword('')
    resetSearchState()
  }, [resetSearchState])

  const moveSelection = useCallback(
    (delta: number) => {
      const resultCount = totalResults > 0 ? totalResults : loadedCount
      if (resultCount === 0) return

      setSelectedIndex(current => {
        const safeCurrent = current < 0 ? 0 : current
        return (safeCurrent + delta + resultCount) % resultCount
      })
    },
    [loadedCount, totalResults]
  )

  const setFilter = useCallback(
    (nextFilter: SearchDefaultFilter) => {
      setFilterState(nextFilter)
      if (settings.rememberLastFilter) {
        void saveLastFilter(nextFilter).catch(() => {
          // Ignore persistence failure for filter cache.
        })
      }
      refreshCurrentQuery()
    },
    [refreshCurrentQuery, settings.rememberLastFilter]
  )

  const setMatchPath = useCallback(
    (value: boolean) => {
      setMatchPathState(value)
      refreshCurrentQuery()
    },
    [refreshCurrentQuery]
  )

  const setMatchCase = useCallback(
    (value: boolean) => {
      setMatchCaseState(value)
      refreshCurrentQuery()
    },
    [refreshCurrentQuery]
  )

  const setRegex = useCallback(
    (value: boolean) => {
      setRegexState(value)
      refreshCurrentQuery()
    },
    [refreshCurrentQuery]
  )

  const setWholeWord = useCallback(
    (value: boolean) => {
      setWholeWordState(value)
      refreshCurrentQuery()
    },
    [refreshCurrentQuery]
  )

  const setSort = useCallback(
    (nextSort: SearchSort) => {
      setSortState(nextSort)
      refreshCurrentQuery()
    },
    [refreshCurrentQuery]
  )

  const applyHistoryEntry = useCallback(
    (entry: SearchHistoryEntry) => {
      setKeywordState(entry.keyword)
      setFilterState(entry.filter)
      setMatchPathState(entry.matchPath)
      setMatchCaseState(entry.matchCase)
      setRegexState(entry.regex)
      setWholeWordState(entry.wholeWord)
      setSortState(entry.sort)
      setSearchPending(true)
      setSubmittedKeyword(entry.keyword.trim())

      if (settings.rememberLastFilter) {
        void saveLastFilter(entry.filter).catch(() => {
          // Ignore persistence failure for filter cache.
        })
      }
    },
    [settings.rememberLastFilter]
  )

  const clearHistory = useCallback(async () => {
    const nextHistory = await clearSearchHistory()
    setHistory(nextHistory)
  }, [])

  const removeHistoryEntry = useCallback(async (id: string) => {
    const nextHistory = await removeSearchHistoryEntry(id)
    setHistory(nextHistory)
  }, [])

  const submitSearch = useCallback(() => {
    if (keyword.trim().length > 0) {
      setSearchPending(true)
      void recordCurrentSearch().catch(() => {
        // Ignore history persistence failure for live search.
      })
    }
    setSubmittedKeyword(keyword.trim())
  }, [keyword, recordCurrentSearch])

  const isKeywordCommitted = keyword.trim() === committedKeyword.trim()
  const hasCommittedQuery = committedKeyword.trim().length > 0

  return useMemo(
    () => ({
      keyword,
      setKeyword,
      submitSearch,
      isKeywordCommitted,
      searchPending,
      hasCommittedQuery,
      loadedCount,
      bestMatchCandidates,
      getItemAt,
      setVisibleRange,
      requestRange,
      loading,
      loadingMore,
      error,
      runtimeState,
      provider,
      tookMs,
      totalResults,
      selectedIndex,
      setSelectedIndex,
      moveSelection,
      resetResults: resetSearchState,
      clear,
      filter,
      setFilter,
      matchPath,
      setMatchPath,
      matchCase,
      setMatchCase,
      regex,
      setRegex,
      wholeWord,
      setWholeWord,
      sort,
      setSort,
      history,
      applyHistoryEntry,
      removeHistoryEntry,
      clearHistory,
      recordCurrentSearch,
      settings,
      reloadSettings,
    }),
    [
      applyHistoryEntry,
      clear,
      clearHistory,
      error,
      filter,
      getItemAt,
      hasCommittedQuery,
      history,
      isKeywordCommitted,
      keyword,
      bestMatchCandidates,
      loadedCount,
      loading,
      loadingMore,
      matchCase,
      matchPath,
      moveSelection,
      runtimeState,
      provider,
      recordCurrentSearch,
      reloadSettings,
      removeHistoryEntry,
      regex,
      requestRange,
      resetSearchState,
      searchPending,
      selectedIndex,
      setFilter,
      setMatchCase,
      setMatchPath,
      setKeyword,
      setRegex,
      setSort,
      setVisibleRange,
      setWholeWord,
      settings,
      sort,
      submitSearch,
      tookMs,
      totalResults,
      wholeWord,
    ]
  )
}
