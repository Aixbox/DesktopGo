import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { SearchHit } from '@/lib/search/types'
import { translate } from '@/lib/i18n'
import { OverlayScrollArea } from '@/components/ui/overlay-scroll-area'
import { SearchResultPlaceholder, SearchResultRow } from './SearchResultRow'
import { SearchResultSelectionHighlight } from './SearchResultSelectionHighlight'
import { useSearchScrollSelection } from './useSearchScrollSelection'
import { useStableSearchEvent } from './useStableSearchEvent'
import { useVisibleSearchIcons } from './useVisibleSearchIcons'
import { toIconCacheKey } from './visibleIconRequests'

const ROW_HEIGHT = 60
const OVERSCAN_ROWS = 16
const MIN_LOAD_AHEAD_ROWS = 24
const LIST_CONTENT_MIN_WIDTH = 420

interface SearchResultsListProps {
  visible: boolean
  loading: boolean
  loadingMore: boolean
  totalResults: number
  loadedCount: number
  pageSize: number
  getItemAt: (index: number) => SearchHit | null
  selectedIndex: number
  onVisibleRangeChange: (startIndex: number, endIndex: number) => void
  onSelect: (index: number) => void
  allowDoubleClickOpen: boolean
  onActivate: (item: SearchHit) => void
}

export function SearchResultsList({
  visible,
  loading,
  loadingMore,
  totalResults,
  loadedCount,
  pageSize,
  getItemAt,
  selectedIndex,
  onVisibleRangeChange,
  onSelect,
  allowDoubleClickOpen,
  onActivate,
}: SearchResultsListProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const rangeNotifyFrameRef = useRef<number | null>(null)
  const pendingVisibleRangeRef = useRef<{ scrollTop: number; viewportHeight: number } | null>(null)
  const scrollTopRef = useRef(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const virtualCount = totalResults > 0 ? totalResults : loadedCount
  const handleResultActivate = useStableSearchEvent(onActivate)
  const {
    handleSelect: handleResultSelect,
    handleHover: handleResultHover,
    markScrollActivity,
    beginProgrammaticScroll,
    consumeSelectionScrollSkip,
  } = useSearchScrollSelection({
    viewportRef,
    rowHeight: ROW_HEIGHT,
    resultCount: virtualCount,
    selectedIndex,
    onSelect,
  })
  const loadAheadRows = Math.max(MIN_LOAD_AHEAD_ROWS, pageSize)
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN_ROWS * 2
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS)
  const endIndex =
    virtualCount === 0
      ? -1
      : Math.min(virtualCount - 1, startIndex + Math.max(visibleRowCount, 1) - 1)

  const syncViewportMetrics = useCallback(() => {
    const element = viewportRef.current
    if (!element) return

    const nextScrollTop = element.scrollTop
    scrollTopRef.current = nextScrollTop
    setViewportHeight(element.clientHeight)
    setScrollTop(nextScrollTop)
  }, [])

  const notifyVisibleRange = useCallback(
    (nextScrollTop: number, nextViewportHeight: number) => {
      if (virtualCount === 0 || nextViewportHeight <= 0) {
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
    [loadAheadRows, onVisibleRangeChange, virtualCount]
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
    (nextScrollTop: number, nextViewportHeight: number, immediate = false) => {
      pendingVisibleRangeRef.current = {
        scrollTop: nextScrollTop,
        viewportHeight: nextViewportHeight,
      }

      clearPendingRangeNotify()
      if (immediate) {
        flushPendingVisibleRange()
        return
      }

      rangeNotifyFrameRef.current = window.requestAnimationFrame(flushPendingVisibleRange)
    },
    [clearPendingRangeNotify, flushPendingVisibleRange]
  )

  useEffect(() => {
    if (!visible) return

    const element = viewportRef.current
    if (!element) return

    syncViewportMetrics()
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncViewportMetrics)

    resizeObserver?.observe(element)
    window.addEventListener('resize', syncViewportMetrics)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncViewportMetrics)
    }
  }, [syncViewportMetrics, visible])

  useLayoutEffect(() => {
    if (!visible) return

    syncViewportMetrics()
    const frame = window.requestAnimationFrame(syncViewportMetrics)
    return () => window.cancelAnimationFrame(frame)
  }, [syncViewportMetrics, visible])

  useEffect(() => {
    if (!visible || selectedIndex < 0) return

    if (consumeSelectionScrollSkip()) return

    const element = viewportRef.current
    if (!element) return

    const rowTop = selectedIndex * ROW_HEIGHT
    const rowBottom = rowTop + ROW_HEIGHT
    const viewportTop = element.scrollTop
    const viewportBottom = viewportTop + element.clientHeight

    if (rowTop < viewportTop) {
      beginProgrammaticScroll()
      element.scrollTop = rowTop
      syncViewportMetrics()
    } else if (rowBottom > viewportBottom) {
      beginProgrammaticScroll()
      element.scrollTop = rowBottom - element.clientHeight
      syncViewportMetrics()
    }
  }, [
    beginProgrammaticScroll,
    consumeSelectionScrollSkip,
    selectedIndex,
    syncViewportMetrics,
    visible,
  ])

  useEffect(() => {
    if (!loading || loadingMore) return
    const element = viewportRef.current
    if (!element) return

    if (element.scrollTop !== 0) {
      beginProgrammaticScroll()
      element.scrollTop = 0
    }
    syncViewportMetrics()
  }, [beginProgrammaticScroll, loading, loadingMore, syncViewportMetrics])

  useEffect(() => {
    if (!visible || viewportHeight <= 0) return
    scheduleVisibleRange(viewportRef.current?.scrollTop ?? 0, viewportHeight, true)
  }, [scheduleVisibleRange, viewportHeight, virtualCount, visible])

  useEffect(() => {
    if (!visible) return

    const flush = () => flushPendingVisibleRange()
    window.addEventListener('pointerup', flush, true)
    window.addEventListener('mouseup', flush, true)
    return () => {
      window.removeEventListener('pointerup', flush, true)
      window.removeEventListener('mouseup', flush, true)
    }
  }, [flushPendingVisibleRange, visible])

  useEffect(
    () => () => {
      pendingVisibleRangeRef.current = null
      clearPendingRangeNotify()
    },
    [clearPendingRangeNotify]
  )

  const virtualRows: Array<{ index: number; item: SearchHit | null }> = []
  if (endIndex >= startIndex) {
    for (let index = startIndex; index <= endIndex; index += 1) {
      virtualRows.push({ index, item: getItemAt(index) })
    }
  }
  const visibleIconRequests = virtualRows.flatMap(({ item }) =>
    item ? [{ path: item.path, isFolder: item.isFolder }] : []
  )
  const visibleSearchIcons = useVisibleSearchIcons(visibleIconRequests, visible)

  return (
    <div className="relative h-full min-w-0">
      <OverlayScrollArea
        ref={viewportRef}
        scrollbars="both"
        className="h-full"
        onWheel={markScrollActivity}
        onScroll={event => {
          markScrollActivity()
          const nextScrollTop = event.currentTarget.scrollTop
          const nextViewportHeight = event.currentTarget.clientHeight
          if (scrollTopRef.current !== nextScrollTop) {
            scrollTopRef.current = nextScrollTop
            flushSync(() => setScrollTop(nextScrollTop))
          }
          scheduleVisibleRange(nextScrollTop, nextViewportHeight)
        }}
      >
        <div
          className="relative isolate"
          style={{ height: virtualCount * ROW_HEIGHT, minWidth: LIST_CONTENT_MIN_WIDTH }}
        >
          {selectedIndex >= 0 && selectedIndex < virtualCount ? (
            <SearchResultSelectionHighlight
              index={selectedIndex}
              rowHeight={ROW_HEIGHT}
              scrollTop={scrollTop}
              viewportHeight={viewportHeight}
            />
          ) : null}

          {virtualRows.map(({ index, item }) => {
            const top = index * ROW_HEIGHT
            if (!item) {
              return (
                <SearchResultPlaceholder
                  key={`placeholder-${index}`}
                  top={top}
                  height={ROW_HEIGHT}
                />
              )
            }

            return (
              <SearchResultRow
                key={`${index}-${item.path}`}
                index={index}
                item={item}
                top={top}
                height={ROW_HEIGHT}
                iconBase64={
                  item.iconBase64 || visibleSearchIcons.get(toIconCacheKey(item.path)) || ''
                }
                selected={selectedIndex === index}
                allowDoubleClickOpen={allowDoubleClickOpen}
                onSelect={handleResultSelect}
                onHover={handleResultHover}
                onActivate={handleResultActivate}
              />
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
  )
}
