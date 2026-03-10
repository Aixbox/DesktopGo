import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
const LOAD_AHEAD_ROWS = 24
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
  const imageMotionClass = 'group-hover:scale-105 group-active:scale-95'

  return (
    <button
      type="button"
      className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-none p-3 shadow-none transition-all duration-200 ${
        selected
          ? 'bg-blue-500/20 ring-1 ring-blue-500/70'
          : 'bg-transparent hover:bg-black/10 active:bg-black/20'
      }`}
      style={{ width: config.containerWidth }}
      title={icon.name}
      onMouseEnter={onSelect}
      onClick={onSelect}
      onDoubleClick={onActivate}
    >
      <div
        className={`flex items-center justify-center overflow-hidden transition-all duration-200 ${imageMotionClass}`}
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
          <Folder className="h-8 w-8 text-white/70" />
        ) : (
          <AppWindow className="h-8 w-8 text-white/60" />
        )}
      </div>

      <span
        className={`text-[11px] text-center leading-tight drop-shadow-md ${
          selected ? 'text-blue-200' : 'text-white'
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
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [bodyHeight, setBodyHeight] = useState(0)
  const prefersReducedMotion = useReducedMotion()
  const isEverything = source === 'everything'
  const trimmedKeyword = keyword.trim()
  const iconConfig = ICON_SIZE_CONFIG[iconSize]
  const singleLineTitle = titleLineCount === 'one'

  const virtualCount = totalResults > 0 ? totalResults : loadedCount
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
      const nextEndIndex = Math.min(
        virtualCount - 1,
        nextStartIndex + Math.max(nextVisibleRowCount, 1) - 1 + LOAD_AHEAD_ROWS
      )
      onVisibleRangeChange(nextStartIndex, nextEndIndex)
    },
    [isEverything, onVisibleRangeChange, virtualCount]
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
    if (!isEverything) {
      return
    }
    notifyVisibleRange(scrollTop, viewportHeight)
  }, [isEverything, notifyVisibleRange, scrollTop, viewportHeight])

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
  const iconEmptyText = trimmedKeyword ? 'No matching icons.' : 'Type to search desktop icons.'
  const everythingEmptyText = searchPending && virtualCount === 0 ? 'Searching...' : 'No results'
  const bodyStateKey = isEverything
    ? error
      ? `everything-error-${error}`
      : showHistoryState
        ? 'everything-history'
        : virtualCount === 0
          ? searchPending
            ? 'everything-searching-empty'
            : 'everything-empty'
          : 'everything-results'
    : trimmedKeyword
      ? iconResults.length > 0
        ? `icons-results-${iconResults.length}`
        : 'icons-empty'
      : 'icons-idle'

  useEffect(() => {
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

  const bodyContent = (
    <div ref={bodyContentRef}>
      {isEverything && error ? <div className="px-4 py-3 text-sm text-red-200">{error}</div> : null}

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
            <div className="px-4 py-3 text-sm text-white/60">{iconEmptyText}</div>
          )
        ) : (
          <div className="px-4 py-3 text-sm text-white/60">{iconEmptyText}</div>
        )
      ) : null}

      {isEverything && !error && !showHistoryState && virtualCount === 0 ? (
        <div className="px-4 py-3 text-sm text-white/60">{everythingEmptyText}</div>
      ) : null}

      {isEverything && !error && virtualCount > 0 ? (
        <div>
          <div className="relative">
            <div
              ref={viewportRef}
              className={`${previewVisible ? 'h-[38vh]' : 'h-[56vh]'} overflow-auto`}
              onScroll={e => {
                const nextScrollTop = e.currentTarget.scrollTop
                const nextViewportHeight = e.currentTarget.clientHeight
                setScrollTop(nextScrollTop)
                notifyVisibleRange(nextScrollTop, nextViewportHeight)
              }}
            >
              <div
                className="relative"
                style={{
                  height: virtualCount * ROW_HEIGHT,
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
                        <div className="flex h-full animate-pulse items-center gap-3 rounded-md bg-white/5 px-4">
                          <span className="h-8 w-8 rounded-md bg-white/10" />
                          <span className="min-w-0 flex-1">
                            <span className="mb-2 block h-3 w-1/3 rounded bg-white/10" />
                            <span className="block h-2.5 w-2/3 rounded bg-white/10" />
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
                        className={`flex h-full w-full items-center gap-3 px-4 py-3 text-left transition ${
                          selectedIndex === index ? 'bg-white/15' : 'hover:bg-white/10'
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
                            <Folder className="h-4 w-4 text-white/70" />
                          ) : (
                            <File className="h-4 w-4 text-white/70" />
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <HighlightedText
                            highlightedText={item.highlightedName}
                            fallbackText={item.name || item.path}
                            className="block truncate text-sm text-white"
                            highlightClassName="text-emerald-200"
                          />
                          <HighlightedText
                            highlightedText={item.highlightedPath}
                            fallbackText={item.parent}
                            className="block truncate text-xs text-white/55"
                            highlightClassName="text-white/90"
                          />
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {loadingMore ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/50 px-4 py-2 text-xs text-white/60 backdrop-blur-sm">
                Loading more...
              </div>
            ) : null}
          </div>

          {previewVisible ? (
            <SearchPreviewPane
              stacked
              item={selectedItem}
              preview={preview}
              loading={previewLoading}
              error={previewError}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )

  return (
    <div
      data-search-placeholder
      className="absolute left-1/2 top-[4.6rem] z-30 w-full max-w-2xl -translate-x-1/2 px-6"
    >
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.div
            key="search-panel"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={panelTransition}
            className="pointer-events-auto overflow-hidden rounded-2xl border border-white/15 bg-black/70 shadow-2xl backdrop-blur-xl will-change-[opacity,transform]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
