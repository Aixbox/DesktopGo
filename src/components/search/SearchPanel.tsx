import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { SearchHistoryEntry } from '@/lib/search/history'
import { parseEverythingHighlightedText } from '@/lib/search/highlight'
import type { SearchSource } from '@/lib/search/scope'
import type { SearchHit, SearchPreview, SearchRuntimeState, SearchSort } from '@/lib/search/types'
import type { DesktopIcon } from '@/types'
import { File, Folder, GripVertical, RefreshCw } from 'lucide-react'
import { translate, useI18n } from '@/lib/i18n'
import { SearchHistoryPanel } from './SearchHistoryPanel'
import { SearchPreviewPane } from './SearchPreviewPane'
import { SearchSourceTabs } from './SearchSourceTabs'
import { SearchToolbar } from './SearchToolbar'
import { ShortcutSearchResults } from './ShortcutSearchResults'
import { SearchResultSectionHeader } from './SearchResultSectionHeader'
import { useSearchSeekRows } from './useSearchSeekRows'
import { useVisibleSearchIcons } from './useVisibleSearchIcons'
import { Button } from '@/components/ui/button'
import { OverlayScrollArea } from '@/components/ui/overlay-scroll-area'

const ROW_HEIGHT = 60
const OVERSCAN_ROWS = 6
const MIN_LOAD_AHEAD_ROWS = 24
const EVERYTHING_BODY_HEIGHT = '56vh'
const EVERYTHING_LIST_PANE_MIN_WIDTH = 220
const EVERYTHING_LIST_CONTENT_MIN_WIDTH = 420
const EVERYTHING_PREVIEW_MIN_WIDTH = 0
const SPLIT_DIVIDER_WIDTH = 16
const DEFAULT_LIST_PANE_RATIO = 0.58
const PANEL_TRANSITION = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1] as const,
}

interface SearchPanelProps {
  source: SearchSource
  keyword: string
  onSourceChange: (source: SearchSource) => void
  visible: boolean
  loading: boolean
  searchPending: boolean
  loadingMore: boolean
  error: string | null
  onRetry: () => void
  runtimeState: SearchRuntimeState
  totalResults: number
  loadedCount: number
  pageSize: number
  hasCommittedQuery: boolean
  getItemAt: (index: number) => SearchHit | null
  selectedItem: SearchHit | null
  selectedIndex: number
  iconResults: DesktopIcon[]
  selectedIconIndex: number
  onSelectIcon: (index: number) => void
  onActivateIcon: (icon: DesktopIcon) => void
  matchPath: boolean
  onMatchPathChange: (value: boolean) => void
  matchCase: boolean
  onMatchCaseChange: (value: boolean) => void
  regex: boolean
  onRegexChange: (value: boolean) => void
  wholeWord: boolean
  onWholeWordChange: (value: boolean) => void
  sort: SearchSort
  onSortChange: (sort: SearchSort) => void
  history: SearchHistoryEntry[]
  onHistorySelect: (entry: SearchHistoryEntry) => void
  onHistoryRemove: (id: string) => void
  onHistoryClear: () => void
  preview: SearchPreview | null
  previewLoading: boolean
  previewError: string | null
  previewVisible: boolean
  onPreviewToggle: () => void
  onVisibleRangeChange: (startIndex: number, endIndex: number) => void
  onSelect: (index: number) => void
  allowDoubleClickOpen: boolean
  onActivate: (item: SearchHit) => void
}

function HighlightedText({
  highlightedText,
  fallbackText,
  className,
  highlightClassName,
}: {
  highlightedText: string
  fallbackText: string
  className: string
  highlightClassName: string
}) {
  const segments = parseEverythingHighlightedText(highlightedText, fallbackText)

  return (
    <span className={className}>
      {segments.map((segment, index) => (
        <span
          key={`${segment.text}-${index}`}
          className={segment.highlighted ? highlightClassName : undefined}
        >
          {segment.text}
        </span>
      ))}
    </span>
  )
}

export function SearchPanel({
  source,
  keyword,
  onSourceChange,
  visible,
  loading,
  searchPending,
  loadingMore,
  error,
  onRetry,
  runtimeState,
  totalResults,
  loadedCount,
  pageSize,
  hasCommittedQuery,
  getItemAt,
  selectedItem,
  selectedIndex,
  iconResults,
  selectedIconIndex,
  onSelectIcon,
  onActivateIcon,
  matchPath,
  onMatchPathChange,
  matchCase,
  onMatchCaseChange,
  regex,
  onRegexChange,
  wholeWord,
  onWholeWordChange,
  sort,
  onSortChange,
  history,
  onHistorySelect,
  onHistoryRemove,
  onHistoryClear,
  preview,
  previewLoading,
  previewError,
  previewVisible,
  onPreviewToggle,
  onVisibleRangeChange,
  onSelect,
  allowDoubleClickOpen,
  onActivate,
}: SearchPanelProps) {
  useI18n()

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const bodyContentRef = useRef<HTMLDivElement | null>(null)
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const rangeNotifyFrameRef = useRef<number | null>(null)
  const pendingVisibleRangeRef = useRef<{ scrollTop: number; viewportHeight: number } | null>(null)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [bodyHeight, setBodyHeight] = useState(0)
  const [listPaneWidth, setListPaneWidth] = useState<number | null>(null)
  const [splitContainerWidth, setSplitContainerWidth] = useState(
    EVERYTHING_LIST_PANE_MIN_WIDTH + SPLIT_DIVIDER_WIDTH
  )
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const isEverything = source !== 'icons'
  const includesEverything = isEverything
  const isFileOnly = source === 'everything'
  const isUnified = source === 'all'
  const trimmedKeyword = keyword.trim()

  const clampListPaneWidth = useCallback((nextWidth: number, containerWidth: number) => {
    const availableWidth = Math.max(containerWidth - SPLIT_DIVIDER_WIDTH, 0)
    const maxListWidth = Math.max(
      EVERYTHING_LIST_PANE_MIN_WIDTH,
      availableWidth - EVERYTHING_PREVIEW_MIN_WIDTH
    )
    const minListWidth = Math.min(EVERYTHING_LIST_PANE_MIN_WIDTH, maxListWidth)

    return Math.min(Math.max(nextWidth, minListWidth), maxListWidth)
  }, [])

  const syncViewportMetrics = useCallback(() => {
    const element = viewportRef.current
    if (!element) return

    setViewportHeight(element.clientHeight)
    setScrollTop(element.scrollTop)
  }, [])

  const virtualCount = totalResults > 0 ? totalResults : loadedCount
  const loadAheadRows = Math.max(MIN_LOAD_AHEAD_ROWS, pageSize)
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS)
  const endIndex =
    virtualCount === 0
      ? -1
      : Math.min(virtualCount - 1, startIndex + Math.max(visibleRowCount, 1) - 1)

  const notifyVisibleRange = useCallback(
    (nextScrollTop: number, nextViewportHeight: number) => {
      if (!includesEverything || virtualCount === 0 || nextViewportHeight <= 0) {
        onVisibleRangeChange(0, -1)
        return
      }

      const nextStartIndex = Math.max(0, Math.floor(nextScrollTop / ROW_HEIGHT))
      const nextVisibleRowCount = Math.ceil(nextViewportHeight / ROW_HEIGHT)
      const nextRangeStartIndex = Math.max(0, nextStartIndex - loadAheadRows)
      const nextEndIndex = Math.min(
        virtualCount - 1,
        nextStartIndex + Math.max(nextVisibleRowCount, 1) - 1 + loadAheadRows
      )
      onVisibleRangeChange(nextRangeStartIndex, nextEndIndex)
    },
    [includesEverything, loadAheadRows, onVisibleRangeChange, virtualCount]
  )

  const clearPendingRangeNotify = useCallback(() => {
    if (rangeNotifyFrameRef.current !== null) {
      window.cancelAnimationFrame(rangeNotifyFrameRef.current)
      rangeNotifyFrameRef.current = null
    }
  }, [])

  const flushPendingVisibleRange = useCallback(() => {
    const pendingRange = pendingVisibleRangeRef.current
    if (!pendingRange) return

    pendingVisibleRangeRef.current = null
    clearPendingRangeNotify()
    notifyVisibleRange(pendingRange.scrollTop, pendingRange.viewportHeight)
  }, [clearPendingRangeNotify, notifyVisibleRange])

  const scheduleVisibleRange = useCallback(
    (nextScrollTop: number, nextViewportHeight: number, options?: { immediate?: boolean }) => {
      pendingVisibleRangeRef.current = {
        scrollTop: nextScrollTop,
        viewportHeight: nextViewportHeight,
      }

      clearPendingRangeNotify()
      if (options?.immediate) {
        flushPendingVisibleRange()
        return
      }

      rangeNotifyFrameRef.current = window.requestAnimationFrame(() => {
        flushPendingVisibleRange()
      })
    },
    [clearPendingRangeNotify, flushPendingVisibleRange]
  )

  useEffect(() => {
    if (!visible || !isEverything) return

    const element = viewportRef.current
    if (!element) return

    syncViewportMetrics()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            syncViewportMetrics()
          })

    resizeObserver?.observe(element)
    window.addEventListener('resize', syncViewportMetrics)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncViewportMetrics)
    }
  }, [isEverything, syncViewportMetrics, visible])

  useLayoutEffect(() => {
    if (!visible || !isEverything) return

    syncViewportMetrics()

    const frame = window.requestAnimationFrame(() => {
      syncViewportMetrics()
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [isEverything, syncViewportMetrics, visible])

  useEffect(() => {
    if (!visible || !isEverything || !previewVisible) return

    const container = splitContainerRef.current
    if (!container) return

    const syncWidth = () => {
      const containerWidth = container.clientWidth
      if (containerWidth <= 0) return

      setSplitContainerWidth(containerWidth)
      setListPaneWidth(current => {
        if (current === null) {
          return clampListPaneWidth(containerWidth * DEFAULT_LIST_PANE_RATIO, containerWidth)
        }
        return clampListPaneWidth(current, containerWidth)
      })
    }

    syncWidth()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            syncWidth()
          })

    resizeObserver?.observe(container)

    return () => {
      resizeObserver?.disconnect()
    }
  }, [clampListPaneWidth, isEverything, previewVisible, visible])

  useEffect(() => {
    if (!isResizingSplit) return

    const handlePointerMove = (event: PointerEvent) => {
      const container = splitContainerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const nextWidth = clampListPaneWidth(event.clientX - rect.left, rect.width)
      setListPaneWidth(nextWidth)
    }

    const stopResize = () => {
      setIsResizingSplit(false)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', stopResize)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', stopResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [clampListPaneWidth, isResizingSplit])

  const handleSplitKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const container = splitContainerRef.current
    if (!container) return

    const containerWidth = container.clientWidth
    const currentWidth =
      listPaneWidth ?? clampListPaneWidth(containerWidth * DEFAULT_LIST_PANE_RATIO, containerWidth)
    const step = event.shiftKey ? 48 : 16
    let nextWidth: number | null = null

    switch (event.key) {
      case 'ArrowLeft':
        nextWidth = currentWidth - step
        break
      case 'ArrowRight':
        nextWidth = currentWidth + step
        break
      case 'Home':
        nextWidth = EVERYTHING_LIST_PANE_MIN_WIDTH
        break
      case 'End':
        nextWidth = containerWidth
        break
      default:
        return
    }

    event.preventDefault()
    setListPaneWidth(clampListPaneWidth(nextWidth, containerWidth))
  }

  const splitAriaMax = Math.max(
    EVERYTHING_LIST_PANE_MIN_WIDTH,
    splitContainerWidth - SPLIT_DIVIDER_WIDTH
  )
  const splitAriaNow = Math.round(
    listPaneWidth ??
      clampListPaneWidth(splitContainerWidth * DEFAULT_LIST_PANE_RATIO, splitContainerWidth)
  )

  useEffect(() => {
    if (!visible || !isEverything) return

    const element = viewportRef.current
    if (!element || selectedIndex < 0) return

    const rowTop = selectedIndex * ROW_HEIGHT
    const rowBottom = rowTop + ROW_HEIGHT
    const viewportTop = element.scrollTop
    const viewportBottom = viewportTop + element.clientHeight

    if (rowTop < viewportTop) {
      element.scrollTop = rowTop
      syncViewportMetrics()
    } else if (rowBottom > viewportBottom) {
      element.scrollTop = rowBottom - element.clientHeight
      syncViewportMetrics()
    }
  }, [isEverything, selectedIndex, syncViewportMetrics, visible])

  useEffect(() => {
    if (!isEverything || !loading || loadingMore) return
    const element = viewportRef.current
    if (!element) return
    element.scrollTop = 0
    syncViewportMetrics()
  }, [isEverything, loading, loadingMore, syncViewportMetrics])

  useEffect(() => {
    if (!visible || !isEverything || viewportHeight <= 0) return

    scheduleVisibleRange(viewportRef.current?.scrollTop ?? 0, viewportHeight, {
      immediate: true,
    })
  }, [isEverything, scheduleVisibleRange, viewportHeight, virtualCount, visible])

  useEffect(() => {
    if (!visible || !isEverything) return

    const flush = () => {
      flushPendingVisibleRange()
    }

    window.addEventListener('pointerup', flush, true)
    window.addEventListener('mouseup', flush, true)

    return () => {
      window.removeEventListener('pointerup', flush, true)
      window.removeEventListener('mouseup', flush, true)
    }
  }, [flushPendingVisibleRange, isEverything, visible])

  useEffect(() => {
    return () => {
      pendingVisibleRangeRef.current = null
      clearPendingRangeNotify()
    }
  }, [clearPendingRangeNotify])

  const virtualRows: Array<{ index: number; item: SearchHit | null }> = []
  if (isEverything && endIndex >= startIndex) {
    for (let index = startIndex; index <= endIndex; index += 1) {
      virtualRows.push({
        index,
        item: getItemAt(index),
      })
    }
  }
  const seekCacheKey = [source, trimmedKeyword, matchPath, matchCase, regex, wholeWord, sort].join(
    '\u0000'
  )
  const { seekRows, retainCurrentRows } = useSearchSeekRows(virtualRows, seekCacheKey)
  const visibleIconPaths = seekRows.flatMap(({ item }) => (item ? [item.path] : []))
  const visibleSearchIcons = useVisibleSearchIcons(visibleIconPaths, visible && isEverything)

  const showHistoryState = includesEverything && !hasCommittedQuery && !error && virtualCount === 0
  const panelTransition = prefersReducedMotion ? { duration: 0 } : PANEL_TRANSITION
  const isEverythingInitializing = isEverything && runtimeState === 'initializing'
  const everythingInitializingText = translate(
    'Everything 正在启动或建立索引，搜索结果可能暂不完整。'
  )
  const iconEmptyText = trimmedKeyword
    ? translate('没有匹配的快捷入口。')
    : translate('输入关键词以搜索快捷入口。')
  const everythingEmptyText =
    searchPending && virtualCount === 0
      ? translate('搜索中...')
      : isUnified
        ? translate('文件中没有匹配结果')
        : translate('没有结果')
  const effectiveEverythingEmptyText = isEverythingInitializing
    ? searchPending && virtualCount === 0
      ? translate('搜索中...')
      : everythingInitializingText
    : everythingEmptyText
  const bodyStateKey = includesEverything
    ? error
      ? `everything-error-${error}`
      : showHistoryState
        ? 'everything-history'
        : virtualCount === 0
          ? searchPending
            ? 'everything-searching-empty'
            : 'everything-empty'
          : `everything-results-${previewVisible ? 'split' : 'list'}`
    : trimmedKeyword
      ? iconResults.length > 0
        ? `icons-results-${iconResults.length}`
        : 'icons-empty'
      : 'icons-idle'

  useLayoutEffect(() => {
    if (!visible) return

    const element = bodyContentRef.current
    if (!element) return

    const updateBodyHeight = () => {
      setBodyHeight(element.getBoundingClientRect().height)
    }

    updateBodyHeight()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            updateBodyHeight()
          })

    resizeObserver?.observe(element)

    return () => {
      resizeObserver?.disconnect()
    }
  }, [bodyStateKey, visible])

  const everythingResultsContent = (
    <div
      ref={splitContainerRef}
      className={`relative ${previewVisible ? 'flex' : 'block'}`}
      style={{ height: EVERYTHING_BODY_HEIGHT }}
    >
      <div
        className="relative h-full min-w-0"
        style={
          previewVisible && listPaneWidth !== null ? { width: listPaneWidth } : { width: '100%' }
        }
      >
        <OverlayScrollArea
          ref={viewportRef}
          scrollbars="both"
          className="h-full"
          onScroll={e => {
            retainCurrentRows()
            const nextScrollTop = e.currentTarget.scrollTop
            const nextViewportHeight = e.currentTarget.clientHeight
            setScrollTop(nextScrollTop)
            scheduleVisibleRange(nextScrollTop, nextViewportHeight)
          }}
        >
          <div
            className="relative"
            style={{
              height: virtualCount * ROW_HEIGHT,
              minWidth: EVERYTHING_LIST_CONTENT_MIN_WIDTH,
            }}
          >
            {seekRows.map(({ index, item, retained }) => {
              const top = index * ROW_HEIGHT

              if (!item) {
                return null
              }

              const iconBase64 = item.iconBase64 || visibleSearchIcons.get(item.path) || ''

              return (
                <div
                  key={`${retained ? 'retained' : item.path}-${index}`}
                  className="absolute left-0 right-0 py-1 pl-2"
                  style={{ top, height: ROW_HEIGHT }}
                >
                  <button
                    type="button"
                    aria-current={!retained && selectedIndex === index ? 'true' : undefined}
                    aria-hidden={retained || undefined}
                    disabled={retained}
                    className={`flex h-full w-full items-center gap-3 rounded-md py-2 pl-2 pr-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 ${
                      retained
                        ? 'pointer-events-none'
                        : selectedIndex === index
                          ? 'bg-primary/18 ring-1 ring-inset ring-primary/55 dark:bg-primary/24 dark:ring-primary/65'
                          : 'hover:bg-accent/55'
                    }`}
                    onMouseEnter={retained ? undefined : () => onSelect(index)}
                    onDoubleClick={
                      retained
                        ? undefined
                        : () => {
                            if (allowDoubleClickOpen) {
                              onActivate(item)
                            }
                          }
                    }
                    onClick={retained ? undefined : () => onSelect(index)}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
                      {iconBase64 ? (
                        <img
                          src={iconBase64}
                          alt={item.name || item.path}
                          className="h-7 w-7 object-contain"
                          draggable={false}
                        />
                      ) : item.isFolder ? (
                        <Folder className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <File className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <HighlightedText
                        highlightedText={item.highlightedName}
                        fallbackText={item.name || item.path}
                        className="block truncate text-sm text-foreground"
                        highlightClassName="accent-foreground font-medium"
                      />
                      <HighlightedText
                        highlightedText={item.highlightedPath}
                        fallbackText={item.parent}
                        className="block truncate text-xs text-muted-foreground"
                        highlightClassName="font-medium text-foreground/85"
                      />
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </OverlayScrollArea>

        {loadingMore ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-border/70 bg-background/78 px-4 py-2 text-xs text-muted-foreground backdrop-blur-md dark:bg-background/82">
            {translate('正在加载更多...')}
          </div>
        ) : null}
      </div>

      {previewVisible ? (
        <>
          <button
            type="button"
            role="separator"
            aria-label={translate('调整预览宽度')}
            aria-orientation="vertical"
            aria-valuemin={EVERYTHING_LIST_PANE_MIN_WIDTH}
            aria-valuemax={splitAriaMax}
            aria-valuenow={splitAriaNow}
            aria-keyshortcuts="ArrowLeft ArrowRight Home End"
            className={`group relative z-10 shrink-0 bg-transparent transition-colors hover:bg-foreground/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 ${
              isResizingSplit ? 'bg-primary/8' : ''
            }`}
            style={{ width: SPLIT_DIVIDER_WIDTH, cursor: 'col-resize' }}
            onPointerDown={event => {
              event.preventDefault()
              setIsResizingSplit(true)
            }}
            onKeyDown={handleSplitKeyDown}
          >
            <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/70" />
            <GripVertical className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-3 -translate-x-1/2 -translate-y-1/2 bg-background/80 text-muted-foreground/60 transition-colors group-hover:text-foreground/70 group-focus-visible:text-foreground/70" />
          </button>

          <div
            className="min-w-0 flex-1 overflow-hidden"
            style={{ minWidth: EVERYTHING_PREVIEW_MIN_WIDTH }}
          >
            <SearchPreviewPane
              item={selectedItem}
              preview={preview}
              loading={previewLoading}
              error={previewError}
            />
          </div>
        </>
      ) : null}
    </div>
  )

  const bodyContent = (
    <div ref={bodyContentRef}>
      {isEverything && error ? (
        <div
          role="alert"
          className={`flex min-w-0 items-start justify-between gap-3 px-4 py-3 text-sm ${
            isEverythingInitializing
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-red-700 dark:text-red-300'
          }`}
        >
          <span className="min-w-0 flex-1 break-words leading-5">{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={searchPending}
            className="shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {translate('重试')}
          </Button>
        </div>
      ) : null}

      {includesEverything && !error && showHistoryState ? (
        <SearchHistoryPanel
          entries={history}
          onSelect={onHistorySelect}
          onRemove={onHistoryRemove}
          onClear={onHistoryClear}
        />
      ) : null}

      {source === 'icons' ? (
        trimmedKeyword && iconResults.length > 0 ? (
          <ShortcutSearchResults
            icons={iconResults}
            selectedIndex={selectedIconIndex}
            onSelect={onSelectIcon}
            onActivate={onActivateIcon}
            mode="grid"
          />
        ) : (
          <div className="px-4 py-3 text-sm text-muted-foreground">{iconEmptyText}</div>
        )
      ) : null}

      {isUnified && trimmedKeyword && iconResults.length > 0 ? (
        <ShortcutSearchResults
          icons={iconResults}
          selectedIndex={selectedIconIndex}
          onSelect={onSelectIcon}
          onActivate={onActivateIcon}
          mode="compact"
          heading="最佳快捷入口"
        />
      ) : null}

      {includesEverything && !error && !showHistoryState && virtualCount === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">
          {effectiveEverythingEmptyText}
        </div>
      ) : null}

      {includesEverything && !error && virtualCount > 0 ? (
        <>
          {isUnified ? (
            <SearchResultSectionHeader
              title={translate('文件与文件夹')}
              count={totalResults > 0 ? totalResults : loadedCount}
            />
          ) : null}
          {isEverythingInitializing ? (
            <div className="border-b border-amber-500/20 bg-amber-500/8 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
              {everythingInitializingText}
            </div>
          ) : null}
          {everythingResultsContent}
        </>
      ) : null}
    </div>
  )

  return (
    <div
      data-search-placeholder
      className="launchpad-search-shell absolute top-[4.6rem] z-30 mx-auto w-full max-w-2xl px-6"
    >
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.div
            key="search-panel"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
            className="launchpad-glass-panel-strong search-panel-surface pointer-events-auto relative overflow-hidden rounded-xl will-change-opacity"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <SearchSourceTabs source={source} onChange={onSourceChange} />
                </div>

                {isFileOnly ? (
                  <div className="shrink-0">
                    <SearchToolbar
                      matchPath={matchPath}
                      onMatchPathChange={onMatchPathChange}
                      matchCase={matchCase}
                      onMatchCaseChange={onMatchCaseChange}
                      regex={regex}
                      onRegexChange={onRegexChange}
                      wholeWord={wholeWord}
                      onWholeWordChange={onWholeWordChange}
                      sort={sort}
                      onSortChange={onSortChange}
                      previewVisible={previewVisible}
                      onPreviewToggle={onPreviewToggle}
                    />
                  </div>
                ) : null}
              </div>

              {prefersReducedMotion ? (
                bodyContent
              ) : (
                <motion.div
                  initial={false}
                  animate={{ height: bodyHeight }}
                  transition={panelTransition}
                  className="overflow-hidden"
                >
                  {bodyContent}
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
