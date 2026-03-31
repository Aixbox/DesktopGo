import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SearchHistoryEntry } from '@/lib/search/history'
import { parseEverythingHighlightedText } from '@/lib/search/highlight'
import type { SearchHit, SearchPreview, SearchSort } from '@/lib/search/types'
import { useIconStore } from '@/stores/iconStore'
import { ICON_SIZE_CONFIG, type DesktopIcon } from '@/types'
import { AppWindow, File, Folder } from 'lucide-react'
import { SearchHistoryPanel } from './SearchHistoryPanel'
import { SearchPreviewPane } from './SearchPreviewPane'
import { SearchSourceTabs } from './SearchSourceTabs'
import { SearchToolbar } from './SearchToolbar'

const ROW_HEIGHT = 68
const OVERSCAN_ROWS = 6
const MIN_LOAD_AHEAD_ROWS = 24
const SCROLL_RANGE_DEBOUNCE_MS = 80
const EVERYTHING_BODY_HEIGHT = '56vh'
const EVERYTHING_LIST_PANE_MIN_WIDTH = 220
const EVERYTHING_LIST_CONTENT_MIN_WIDTH = 420
const EVERYTHING_PREVIEW_MIN_WIDTH = 0
const SPLIT_DIVIDER_WIDTH = 10
const DEFAULT_LIST_PANE_RATIO = 0.58
const PANEL_TRANSITION = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1] as const,
}

interface SearchPanelProps {
  source: 'icons' | 'everything'
  keyword: string
  onSourceChange: (source: 'icons' | 'everything') => void
  visible: boolean
  loading: boolean
  searchPending: boolean
  loadingMore: boolean
  error: string | null
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

function IconResultTile({
  icon,
  selected,
  onSelect,
  onActivate,
  singleLineTitle,
}: {
  icon: DesktopIcon
  selected: boolean
  onSelect: () => void
  onActivate: () => void
  singleLineTitle: boolean
}) {
  const { iconSize } = useIconStore()
  const config = ICON_SIZE_CONFIG[iconSize]

  return (
    <button
      type="button"
      className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-none p-3 shadow-none transition-all duration-200 ${
        selected
          ? 'bg-blue-500/12 ring-1 ring-blue-500/40 dark:bg-blue-400/18 dark:ring-blue-400/45'
          : 'bg-transparent hover:bg-accent/60 active:bg-accent'
      }`}
      style={{ width: config.containerWidth }}
      title={icon.name}
      onMouseEnter={onSelect}
      onClick={onSelect}
      onDoubleClick={onActivate}
    >
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200 group-hover:scale-105 group-active:scale-95"
        style={{ width: config.imgSize, height: config.imgSize }}
      >
        {icon.icon_base64 ? (
          <img
            src={icon.icon_base64}
            alt={icon.name}
            style={{ width: config.imgSize, height: config.imgSize }}
            className="object-contain"
            draggable={false}
          />
        ) : icon.item_type === 'folder' ? (
          <Folder className="h-8 w-8 text-muted-foreground" />
        ) : (
          <AppWindow className="h-8 w-8 text-muted-foreground" />
        )}
      </div>

      <span
        className={`text-[11px] text-center leading-tight ${
          selected ? 'text-blue-700 dark:text-blue-200' : 'text-foreground'
        }`}
        style={{
          maxWidth: config.containerWidth - 10,
          display: singleLineTitle ? 'block' : '-webkit-box',
          WebkitLineClamp: singleLineTitle ? 1 : 2,
          WebkitBoxOrient: singleLineTitle ? undefined : 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: singleLineTitle ? 'nowrap' : 'normal',
          overflowWrap: 'anywhere',
        }}
      >
        {icon.name}
      </span>
    </button>
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
  const { iconSize, titleLineCount } = useIconStore()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const bodyContentRef = useRef<HTMLDivElement | null>(null)
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const rangeNotifyTimerRef = useRef<number | null>(null)
  const pendingVisibleRangeRef = useRef<{ scrollTop: number; viewportHeight: number } | null>(null)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [bodyHeight, setBodyHeight] = useState(0)
  const [listPaneWidth, setListPaneWidth] = useState<number | null>(null)
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const isEverything = source === 'everything'
  const trimmedKeyword = keyword.trim()
  const iconConfig = ICON_SIZE_CONFIG[iconSize]
  const singleLineTitle = titleLineCount === 'one'

  const clampListPaneWidth = useCallback((nextWidth: number, containerWidth: number) => {
    const availableWidth = Math.max(containerWidth - SPLIT_DIVIDER_WIDTH, 0)
    const maxListWidth = Math.max(
      EVERYTHING_LIST_PANE_MIN_WIDTH,
      availableWidth - EVERYTHING_PREVIEW_MIN_WIDTH
    )
    const minListWidth = Math.min(EVERYTHING_LIST_PANE_MIN_WIDTH, maxListWidth)

    return Math.min(Math.max(nextWidth, minListWidth), maxListWidth)
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
      if (!isEverything || virtualCount === 0 || nextViewportHeight <= 0) {
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
    [isEverything, loadAheadRows, onVisibleRangeChange, virtualCount]
  )

  const clearPendingRangeNotify = useCallback(() => {
    if (rangeNotifyTimerRef.current !== null) {
      window.clearTimeout(rangeNotifyTimerRef.current)
      rangeNotifyTimerRef.current = null
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
    (
      nextScrollTop: number,
      nextViewportHeight: number,
      options?: { immediate?: boolean }
    ) => {
      pendingVisibleRangeRef.current = {
        scrollTop: nextScrollTop,
        viewportHeight: nextViewportHeight,
      }

      clearPendingRangeNotify()
      if (options?.immediate) {
        flushPendingVisibleRange()
        return
      }

      rangeNotifyTimerRef.current = window.setTimeout(() => {
        flushPendingVisibleRange()
      }, SCROLL_RANGE_DEBOUNCE_MS)
    },
    [clearPendingRangeNotify, flushPendingVisibleRange]
  )

  useEffect(() => {
    if (!visible || !isEverything) return

    const element = viewportRef.current
    if (!element) return

    const updateViewportHeight = () => {
      setViewportHeight(element.clientHeight)
    }

    updateViewportHeight()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            updateViewportHeight()
          })

    resizeObserver?.observe(element)
    window.addEventListener('resize', updateViewportHeight)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateViewportHeight)
    }
  }, [isEverything, visible])

  useEffect(() => {
    if (!visible || !isEverything || !previewVisible) return

    const container = splitContainerRef.current
    if (!container) return

    const syncWidth = () => {
      const containerWidth = container.clientWidth
      if (containerWidth <= 0) return

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

  useEffect(() => {
    if (!isEverything) return

    const element = viewportRef.current
    if (!element || selectedIndex < 0) return

    const rowTop = selectedIndex * ROW_HEIGHT
    const rowBottom = rowTop + ROW_HEIGHT
    const viewportTop = element.scrollTop
    const viewportBottom = viewportTop + element.clientHeight

    if (rowTop < viewportTop) {
      element.scrollTop = rowTop
    } else if (rowBottom > viewportBottom) {
      element.scrollTop = rowBottom - element.clientHeight
    }
  }, [isEverything, selectedIndex])

  useEffect(() => {
    if (!isEverything || !loading || loadingMore) return
    const element = viewportRef.current
    if (!element) return
    element.scrollTop = 0
    setScrollTop(0)
  }, [isEverything, loading, loadingMore])

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

  const virtualRows = useMemo(() => {
    if (!isEverything || endIndex < startIndex) return []

    const rows: Array<{ index: number; item: SearchHit | null }> = []
    for (let index = startIndex; index <= endIndex; index += 1) {
      rows.push({
        index,
        item: getItemAt(index),
      })
    }
    return rows
  }, [endIndex, getItemAt, isEverything, loadedCount, startIndex])

  const showHistoryState = isEverything && !hasCommittedQuery && !error && virtualCount === 0
  const panelTransition = prefersReducedMotion ? { duration: 0 } : PANEL_TRANSITION
  const iconEmptyText = trimmedKeyword ? '没有匹配的图标。' : '输入关键词以搜索桌面图标。'
  const everythingEmptyText = searchPending && virtualCount === 0 ? '搜索中...' : '没有结果'
  const bodyStateKey = isEverything
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
        className="relative min-w-0"
        style={
          previewVisible && listPaneWidth !== null ? { width: listPaneWidth } : { width: '100%' }
        }
      >
        <div
          ref={viewportRef}
          className="h-full overflow-auto"
          onScroll={e => {
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
            {virtualRows.map(({ index, item }) => {
              const top = index * ROW_HEIGHT

              if (!item) {
                return (
                  <div
                    key={`placeholder-${index}`}
                    className="absolute left-0 right-0 px-4 py-2"
                    style={{ top, height: ROW_HEIGHT }}
                  >
                    <div className="flex h-full animate-pulse items-center gap-3 rounded-xl border border-border/50 bg-background/45 px-4 backdrop-blur-sm">
                      <span className="h-8 w-8 rounded-md bg-foreground/10" />
                      <span className="min-w-0 flex-1">
                        <span className="mb-2 block h-3 w-1/3 rounded bg-foreground/10" />
                        <span className="block h-2.5 w-2/3 rounded bg-foreground/10" />
                      </span>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={`${item.path}-${index}`}
                  className="absolute left-0 right-0 px-0"
                  style={{ top, height: ROW_HEIGHT }}
                >
                  <button
                    type="button"
                    className={`flex h-full w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      selectedIndex === index
                        ? 'bg-accent/85 ring-1 ring-border/70'
                        : 'hover:bg-accent/55'
                    }`}
                    onMouseEnter={() => onSelect(index)}
                    onDoubleClick={() => {
                      if (allowDoubleClickOpen) {
                        onActivate(item)
                      }
                    }}
                    onClick={() => onSelect(index)}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
                      {item.iconBase64 ? (
                        <img
                          src={item.iconBase64}
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
                        highlightClassName="font-medium text-emerald-700 dark:text-emerald-300"
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
        </div>

        {loadingMore ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-border/70 bg-background/82 px-4 py-2 text-xs text-muted-foreground backdrop-blur-md">
            正在加载更多...
          </div>
        ) : null}
      </div>

      {previewVisible ? (
        <>
          <button
            type="button"
            aria-label="调整预览宽度"
            className={`relative z-10 shrink-0 border-l border-r border-border/70 bg-background/12 transition hover:bg-accent/45 ${
              isResizingSplit ? 'bg-accent/70' : ''
            }`}
            style={{ width: SPLIT_DIVIDER_WIDTH, cursor: 'col-resize' }}
            onPointerDown={event => {
              event.preventDefault()
              setIsResizingSplit(true)
            }}
          >
            <span className="absolute left-1/2 top-1/2 h-14 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/20" />
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
        <div className="px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      ) : null}

      {isEverything && !error && showHistoryState ? (
        <SearchHistoryPanel
          entries={history}
          onSelect={onHistorySelect}
          onRemove={onHistoryRemove}
          onClear={onHistoryClear}
        />
      ) : null}

      {!isEverything ? (
        trimmedKeyword ? (
          iconResults.length > 0 ? (
            <div className="max-h-[56vh] overflow-auto px-4 py-4">
              <div
                className="grid justify-center gap-x-4 gap-y-5"
                style={{
                  gridTemplateColumns: `repeat(auto-fit, minmax(${iconConfig.containerWidth}px, ${iconConfig.containerWidth}px))`,
                }}
              >
                {iconResults.map((icon, index) => (
                  <IconResultTile
                    key={`${icon.source}:${icon.id}`}
                    icon={icon}
                    selected={selectedIconIndex === index}
                    onSelect={() => onSelectIcon(index)}
                    onActivate={() => onActivateIcon(icon)}
                    singleLineTitle={singleLineTitle}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-muted-foreground">{iconEmptyText}</div>
          )
        ) : (
          <div className="px-4 py-3 text-sm text-muted-foreground">{iconEmptyText}</div>
        )
      ) : null}

      {isEverything && !error && !showHistoryState && virtualCount === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">{everythingEmptyText}</div>
      ) : null}

      {isEverything && !error && virtualCount > 0 ? everythingResultsContent : null}
    </div>
  )

  return (
    <div
      data-search-placeholder
      className="absolute inset-x-0 top-[4.6rem] z-30 mx-auto w-full max-w-2xl px-6"
    >
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.div
            key="search-panel"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
            className="launchpad-glass-panel-strong pointer-events-auto relative overflow-hidden rounded-2xl shadow-2xl will-change-opacity"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <SearchSourceTabs source={source} onChange={onSourceChange} />
                </div>

                {isEverything ? (
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
