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
import type { SearchSource } from '@/lib/search/scope'
import type { SearchHit, SearchPreview, SearchRuntimeState, SearchSort } from '@/lib/search/types'
import type { DesktopIcon } from '@/types'
import { RefreshCw } from 'lucide-react'
import { translate, useI18n } from '@/lib/i18n'
import { SearchHistoryPanel } from './SearchHistoryPanel'
import { SearchPreviewPane } from './SearchPreviewPane'
import { SearchSourceTabs } from './SearchSourceTabs'
import { SearchToolbar } from './SearchToolbar'
import { ShortcutSearchResults } from './ShortcutSearchResults'
import { SearchResultSectionHeader } from './SearchResultSectionHeader'
import { SearchResultsList } from './SearchResultsList'
import { Button } from '@/components/ui/button'

const EVERYTHING_BODY_HEIGHT = '56vh'
const EVERYTHING_LIST_PANE_MIN_WIDTH = 220
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

  const bodyContentRef = useRef<HTMLDivElement | null>(null)
  const splitContainerRef = useRef<HTMLDivElement | null>(null)
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

  const virtualCount = totalResults > 0 ? totalResults : loadedCount

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
        <SearchResultsList
          visible={visible && isEverything}
          loading={loading}
          loadingMore={loadingMore}
          totalResults={totalResults}
          loadedCount={loadedCount}
          pageSize={pageSize}
          getItemAt={getItemAt}
          selectedIndex={selectedIndex}
          onVisibleRangeChange={onVisibleRangeChange}
          onSelect={onSelect}
          allowDoubleClickOpen={allowDoubleClickOpen}
          onActivate={onActivate}
        />
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
            data-resizing={isResizingSplit ? 'true' : undefined}
            className="search-split-divider relative z-10 flex shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45"
            style={{ width: SPLIT_DIVIDER_WIDTH, cursor: 'col-resize' }}
            onPointerDown={event => {
              event.preventDefault()
              setIsResizingSplit(true)
            }}
            onKeyDown={handleSplitKeyDown}
          >
            <span aria-hidden="true" className="search-split-divider-grip pointer-events-none" />
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
