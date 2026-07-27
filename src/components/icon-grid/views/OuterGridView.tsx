import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { Icon } from '../../Icon'
import type { FolderSize, GridSpan } from '../model'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import { FolderCreatePreview } from './FolderVisuals'
import { OuterFolderTile } from './OuterFolderTile'

const PAGE_SLIDE_MS = 280
const PAGE_SLIDE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

interface IconConfigLike {
  imgSize: number
  containerWidth: number
}

interface OuterGridViewProps {
  gridRef: RefObject<HTMLDivElement | null>
  gridWidth: number
  gridHeight: number
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  pageCellCount: number
  currentPage: number
  pageAnchorEntries: PageAnchorEntry[]
  dragContext: 'outer' | 'folder' | null
  dragPreviewSlotIndex: number | null
  dragFolderPreviewTargetId: string | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  hiddenOuterItemIds: string[]
  highlightedOuterItemIds: string[]
  previewFootprint: { row: number; col: number; span: GridSpan } | null
  iconConfig: IconConfigLike
  selectionMode: boolean
  selectedSet: Set<string>
  openFolderId: string | null
  activeFolderSharedLayoutId: string | null
  onToggleSelectIcon: (key: string) => void
  onTilePointerDown: (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => void
  onTileClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onOpenFolder: (folderId: string) => void
  onLaunchIcon: (path: string) => void
  onResizeFolder: (folderId: string, size: FolderSize) => void
  bindTileRef: (id: string, node: HTMLDivElement | null) => void
  reorderAnimationMs: number
  canGoLeft: boolean
  canGoRight: boolean
  sideArrowOffset: number
  onGoLeft: () => void
  onGoRight: () => void
  paginationOffset: number
  paginationDotGap: number
  paginationDotSize: number
  paginationActiveWidth: number
  pageCount: number
  hoverPage: number | null
  onHoverPage: (page: number | null) => void
  onSwitchPage: (page: number) => void
}

export function OuterGridView({
  gridRef,
  gridWidth,
  gridHeight,
  columns,
  rows,
  itemWidth,
  itemHeight,
  gridGap,
  pageCellCount,
  currentPage,
  pageAnchorEntries,
  dragContext,
  dragPreviewSlotIndex,
  dragFolderPreviewTargetId,
  folderPreviewFreezeTargetId,
  folderCreateTransitionTargetId,
  hiddenOuterItemIds,
  highlightedOuterItemIds,
  previewFootprint,
  iconConfig,
  selectionMode,
  selectedSet,
  openFolderId,
  activeFolderSharedLayoutId,
  onToggleSelectIcon,
  onTilePointerDown,
  onTileClickCapture,
  onOpenFolder,
  onLaunchIcon,
  onResizeFolder,
  bindTileRef,
  reorderAnimationMs,
  canGoLeft,
  canGoRight,
  sideArrowOffset,
  onGoLeft,
  onGoRight,
  paginationOffset,
  paginationDotGap,
  paginationDotSize,
  paginationActiveWidth,
  pageCount,
  hoverPage,
  onHoverPage,
  onSwitchPage,
}: OuterGridViewProps) {
  const prevPageRef = useRef(currentPage)
  const slideTimerRef = useRef<number | null>(null)
  const snapshotCloneRef = useRef<HTMLDivElement | null>(null)
  const prevGridSnapshotRef = useRef<string>('')
  const gridClipRef = useRef<HTMLDivElement | null>(null)
  const highlightedOuterItemIdSet = new Set(highlightedOuterItemIds)

  // Capture grid innerHTML after every render for use as the "old page" snapshot
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (grid && prevPageRef.current === currentPage) {
      prevGridSnapshotRef.current = grid.innerHTML
    }
  })

  useLayoutEffect(() => {
    const prevPage = prevPageRef.current
    prevPageRef.current = currentPage
    if (prevPage === currentPage) return

    const grid = gridRef.current
    const clipContainer = gridClipRef.current
    if (!grid || !clipContainer) return

    // Clean up any in-flight animation
    if (slideTimerRef.current !== null) {
      window.clearTimeout(slideTimerRef.current)
      slideTimerRef.current = null
      grid.style.transition = ''
      grid.style.transform = ''
    }
    if (snapshotCloneRef.current) {
      snapshotCloneRef.current.remove()
      snapshotCloneRef.current = null
    }

    const direction = currentPage > prevPage ? 1 : -1

    // Only clip while a page slide is in-flight; otherwise let icon/folder
    // shadows extend beyond the grid edges instead of being cut off.
    clipContainer.style.overflow = 'hidden'

    // Create snapshot clone of the old page
    const clone = document.createElement('div')
    clone.className = grid.className
    clone.style.cssText = grid.style.cssText
    clone.style.position = 'absolute'
    clone.style.inset = '0'
    clone.style.pointerEvents = 'none'
    clone.innerHTML = prevGridSnapshotRef.current
    clipContainer.appendChild(clone)
    snapshotCloneRef.current = clone

    // Animate: old page slides out, new page slides in from opposite side
    const slideDistance = gridWidth

    // Old page: starts at 0, slides out
    clone.style.transition = 'none'
    clone.style.transform = 'translate3d(0, 0, 0)'
    void clone.offsetWidth
    clone.style.transition = `transform ${PAGE_SLIDE_MS}ms ${PAGE_SLIDE_EASING}, opacity ${PAGE_SLIDE_MS}ms ${PAGE_SLIDE_EASING}`
    clone.style.transform = `translate3d(${-direction * slideDistance}px, 0, 0)`
    clone.style.opacity = '0'

    // New page: starts offset, slides in
    grid.style.transition = 'none'
    grid.style.transform = `translate3d(${direction * slideDistance}px, 0, 0)`
    void grid.offsetWidth
    grid.style.transition = `transform ${PAGE_SLIDE_MS}ms ${PAGE_SLIDE_EASING}`
    grid.style.transform = 'translate3d(0, 0, 0)'

    // Save new page snapshot after animation content is ready
    prevGridSnapshotRef.current = grid.innerHTML

    slideTimerRef.current = window.setTimeout(() => {
      grid.style.transition = ''
      grid.style.transform = ''
      clone.remove()
      snapshotCloneRef.current = null
      slideTimerRef.current = null
      clipContainer.style.overflow = ''
    }, PAGE_SLIDE_MS + 40)
  }, [currentPage, gridWidth, gridRef])

  return (
    <div
      className="relative"
      style={{
        width: `${gridWidth}px`,
        height: `${gridHeight}px`,
        maxWidth: '100%',
        maxHeight: '100%',
      }}
    >
      <div ref={gridClipRef} className="relative h-full w-full">
        <div
          ref={gridRef}
          className="grid h-full w-full content-start"
          style={{
            gridTemplateColumns: `repeat(${columns}, ${itemWidth}px)`,
            gridTemplateRows: `repeat(${rows}, ${itemHeight}px)`,
            gap: `${gridGap}px`,
          }}
        >
          {Array.from({ length: pageCellCount }, (_, index) => {
            return (
              <div
                key={`cell-${currentPage}-${index}`}
                data-grid-item
                className="h-full w-full rounded-2xl border border-transparent bg-transparent"
                style={{ minHeight: `${itemHeight}px` }}
                aria-hidden="true"
              />
            )
          })}

          {dragContext === 'outer' && dragPreviewSlotIndex !== null && previewFootprint !== null ? (
            <div
              className="pointer-events-none rounded-2xl border border-border/60 bg-background/35 dark:border-white/22 dark:bg-white/8"
              style={{
                gridColumn: `${previewFootprint.col + 1} / span ${previewFootprint.span.cols}`,
                gridRow: `${previewFootprint.row + 1} / span ${previewFootprint.span.rows}`,
              }}
              aria-hidden="true"
            />
          ) : null}

          {pageAnchorEntries.map(entry => {
            const hideItem = hiddenOuterItemIds.includes(entry.id)
            const highlightedItem = highlightedOuterItemIdSet.has(entry.id)
            const folderPreview =
              (dragContext === 'outer' && dragFolderPreviewTargetId === entry.id) ||
              folderPreviewFreezeTargetId === entry.id ||
              folderCreateTransitionTargetId === entry.id

            return (
              <div
                key={entry.id}
                ref={node => {
                  bindTileRef(entry.id, node)
                }}
                className={`relative justify-self-center self-start transition-opacity duration-150 ${
                  hideItem ? 'opacity-0' : 'opacity-100'
                }`}
                style={{
                  gridColumn: `${entry.col + 1} / span ${entry.span.cols}`,
                  gridRow: `${entry.row + 1} / span ${entry.span.rows}`,
                  width: `${entry.span.cols * itemWidth + Math.max(0, entry.span.cols - 1) * gridGap}px`,
                  height: `${entry.span.rows * itemHeight + Math.max(0, entry.span.rows - 1) * gridGap}px`,
                }}
              >
                {entry.item.kind === 'icon' ? (
                  <div
                    className="relative touch-none"
                    onPointerDown={event => onTilePointerDown(event, entry.id)}
                    onClickCapture={onTileClickCapture}
                  >
                    <div
                      className={`transition-opacity duration-150 ${
                        folderPreview ? 'opacity-0' : 'opacity-100'
                      }`}
                    >
                      <Icon
                        icon={entry.item.icon}
                        selectionKey={entry.item.key}
                        selectionMode={selectionMode}
                        selected={selectedSet.has(entry.item.key)}
                        onToggleSelect={onToggleSelectIcon}
                        highlighted={highlightedItem}
                      />
                    </div>
                    <FolderCreatePreview
                      active={folderPreview}
                      icon={entry.item.icon}
                      imgSize={iconConfig.imgSize}
                      reorderAnimationMs={reorderAnimationMs}
                      tileWidth={itemWidth}
                      tileHeight={itemHeight}
                    />
                  </div>
                ) : (
                  <OuterFolderTile
                    folder={entry.item}
                    span={entry.span}
                    slotWidth={itemWidth}
                    slotHeight={itemHeight}
                    gridGap={gridGap}
                    folderPreview={folderPreview}
                    folderOpen={openFolderId === entry.item.id}
                    sharedLayoutActive={activeFolderSharedLayoutId === entry.item.id}
                    selectionMode={selectionMode}
                    onPointerDown={event => onTilePointerDown(event, entry.id)}
                    onClickCapture={onTileClickCapture}
                    onOpenFolder={onOpenFolder}
                    onLaunchIcon={onLaunchIcon}
                    onResizeFolder={onResizeFolder}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {canGoLeft ? (
        <button
          data-pagination
          type="button"
          aria-label="Previous page"
          className="absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/78 text-foreground/80 shadow-[0_8px_24px_rgba(15,23,42,0.1)] backdrop-blur-sm transition-colors hover:bg-background/92 dark:border-white/25 dark:bg-black/35 dark:text-white/85 dark:hover:bg-black/55"
          style={{ left: `-${sideArrowOffset}px` }}
          onClick={onGoLeft}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}

      {canGoRight ? (
        <button
          data-pagination
          type="button"
          aria-label="Next page"
          className="absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/78 text-foreground/80 shadow-[0_8px_24px_rgba(15,23,42,0.1)] backdrop-blur-sm transition-colors hover:bg-background/92 dark:border-white/25 dark:bg-black/35 dark:text-white/85 dark:hover:bg-black/55"
          style={{ right: `-${sideArrowOffset}px` }}
          onClick={onGoRight}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}

      <div
        data-pagination
        className="absolute left-1/2 z-10 -translate-x-1/2 px-3 py-1.5"
        style={{ top: `calc(100% + ${paginationOffset}px)` }}
        onMouseLeave={() => onHoverPage(null)}
      >
        <div className="flex items-center" style={{ columnGap: `${paginationDotGap}px` }}>
          {Array.from({ length: pageCount }, (_, index) => {
            const isCurrent = currentPage === index
            const isHovered = hoverPage === index
            const shouldExpand = isCurrent || isHovered
            return (
              <button
                key={index}
                data-pagination
                type="button"
                aria-label={`Switch to page ${index + 1}`}
                onMouseEnter={() => onHoverPage(index)}
                onClick={() => onSwitchPage(index)}
                className={`relative rounded-full transition-all duration-250 ease-out ${
                  isCurrent
                    ? 'bg-foreground/88 shadow-[0_0_10px_rgba(15,23,42,0.25)] dark:bg-white/95 dark:shadow-[0_0_10px_rgba(255,255,255,0.75)]'
                    : isHovered
                      ? 'bg-foreground/45 dark:bg-white/55'
                      : 'bg-foreground/25 hover:bg-foreground/35 dark:bg-white/35 dark:hover:bg-white/45'
                }`}
                style={{
                  width: `${shouldExpand ? paginationActiveWidth : paginationDotSize}px`,
                  height: `${paginationDotSize}px`,
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
