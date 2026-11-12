import { GridItemResizeContext, type GridItemResizeActions } from '../hooks/gridItemResizeContext'
import {
  closestCenter,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ComponentProps,
} from 'react'
import type { FolderSize, GridSpan, GridItem } from '../model'
import { getPageAnchorEntries, type PageAnchorEntry } from '../domain/topLevelLayout'
import type { PageSwipeVisual } from '../hooks/usePageSwipePreview'
import { OuterGridPageLayer, type OuterGridPageData } from './OuterGridPageLayer'
import { useOuterPageMotion } from '../hooks/useOuterPageMotion'
import type { EdgePagingControl } from '../hooks/useEdgeAutoPaging'

interface IconConfigLike {
  imgSize: number
  containerWidth: number
}

interface OuterGridViewProps {
  pageSwipe?: PageSwipeVisual
  itemById?: ReadonlyMap<string, GridItem>
  edgePaging?: EdgePagingControl
  resizeActions?: GridItemResizeActions
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
  pageOrder: Array<string | null>
  pageAnchorEntries: PageAnchorEntry[]
  dragContext: 'outer' | 'folder' | null
  dragPreviewSlotIndex: number | null
  dragFolderPreviewTargetId: string | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  hiddenOuterItemIds: string[]
  highlightedOuterItemIds: string[]
  keyboardSensors?: ComponentProps<typeof DndContext>['sensors']
  keyboardDragActive?: boolean
  onKeyboardDragStart?: (event: DragStartEvent) => void
  onKeyboardDragMove?: (event: DragMoveEvent) => void
  onKeyboardDragEnd?: (event: DragEndEvent) => void
  onKeyboardDragCancel?: (event: DragCancelEvent) => void
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
  folderResizePreview?: { folderId: string; size: FolderSize } | null
  onPreviewFolderResize?: (folderId: string, size: FolderSize) => void
  onCancelFolderResize?: () => void
  onResizeWidget?: (widgetId: string, spanX: number, spanY: number) => void
  onDissolveFolder: (folderId: string) => void
  bindTileRef: (id: string, node: HTMLDivElement | null) => void
  reorderAnimationMs: number
  /** 左右翻页按钮（相对内容底边垂直居中）。仅 scroll 模式使用；分页模式的
      翻页按钮在 IconGrid 容器层垂直居中于窗口，不传则不渲染。 */
  canGoLeft?: boolean
  canGoRight?: boolean
  sideArrowOffset?: number
  onGoLeft?: () => void
  onGoRight?: () => void
  /** 分页指示器（相对内容底边定位）。仅 scroll 模式使用；分页模式的指示器
      已上移到 IconGrid 容器层固定贴 dock，不传则不渲染。 */
  paginationOffset?: number
  paginationDotGap?: number
  paginationDotSize?: number
  paginationActiveWidth?: number
  pageCount?: number
  hoverPage?: number | null
  onHoverPage?: (page: number | null) => void
  onSwitchPage?: (page: number) => void
}

export function OuterGridView({
  pageSwipe,
  itemById,
  edgePaging,
  resizeActions,
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
  pageOrder,
  dragContext,
  dragPreviewSlotIndex,
  dragFolderPreviewTargetId,
  folderPreviewFreezeTargetId,
  folderCreateTransitionTargetId,
  hiddenOuterItemIds,
  highlightedOuterItemIds,
  keyboardSensors = [],
  keyboardDragActive = false,
  onKeyboardDragStart = () => undefined,
  onKeyboardDragMove = () => undefined,
  onKeyboardDragEnd = () => undefined,
  onKeyboardDragCancel = () => undefined,
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
  folderResizePreview = null,
  onPreviewFolderResize,
  onCancelFolderResize,
  onResizeWidget,
  onDissolveFolder,
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
  const currentPageData: OuterGridPageData = {
    page: currentPage,
    entries: pageAnchorEntries,
    dragContext,
    dragPreviewSlotIndex,
    dragFolderPreviewTargetId,
    folderPreviewFreezeTargetId,
    folderCreateTransitionTargetId,
    hiddenOuterItemIds,
    highlightedOuterItemIds,
    previewFootprint,
  }

  const { pageTransition, oldPageLayerRef, currentPageLayerRef, peekLayerRef } = useOuterPageMotion(
    currentPageData,
    gridWidth,
    edgePaging,
    pageSwipe
  )

  const preview = pageSwipe?.preview
  const adjacentPages = useMemo(() => {
    if (!preview || preview.page !== currentPage || !itemById) return []
    return [currentPage - 1, currentPage + 1]
      .filter(page => page >= 0 && page < preview.pageCount)
      .map(page => ({
        page,
        x: (page - currentPage) * preview.width * preview.direction,
        entries: getPageAnchorEntries(
          pageOrder,
          Array.from(itemById.values()),
          page,
          pageCellCount,
          columns
        ),
      }))
  }, [preview, currentPage, itemById, pageOrder, pageCellCount, columns])
  const layerProps = {
    columns,
    rows,
    itemWidth,
    itemHeight,
    gridGap,
    pageCellCount,
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
    folderResizePreview,
    onPreviewFolderResize,
    onCancelFolderResize,
    onResizeWidget,
    onDissolveFolder,
    bindTileRef,
    reorderAnimationMs,
  }

  return (
    <GridItemResizeContext.Provider value={resizeActions ?? null}>
      <DndContext
        sensors={keyboardSensors}
        collisionDetection={closestCenter}
        onDragStart={onKeyboardDragStart}
        onDragMove={onKeyboardDragMove}
        onDragEnd={onKeyboardDragEnd}
        onDragCancel={onKeyboardDragCancel}
      >
        <div
          className="launchpad-edit-grid-motion relative"
          style={{
            width: `${gridWidth}px`,
            height: `${gridHeight}px`,
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        >
          {keyboardDragActive ? (
            <div
              data-keyboard-drag-hint="active"
              role="status"
              className="pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 rounded-full border border-primary/35 bg-background/85 px-3 py-1 text-[11px] text-foreground/80 shadow-lg backdrop-blur-sm dark:border-sky-200/35 dark:bg-black/55 dark:text-white/85"
            >
              方向键移动，Enter 或 Space 确认，Esc 取消
            </div>
          ) : null}
          <div
            ref={pageSwipe?.trackRef}
            data-page-swipe-track
            data-page-swipe-active={preview ? 'true' : undefined}
            className="relative h-full w-full"
            style={{ willChange: preview ? 'transform' : undefined }}
          >
            <div ref={peekLayerRef} className="relative h-full w-full">
              {pageTransition ? (
                <div
                  ref={oldPageLayerRef}
                  key={`page-transition-from-${pageTransition.from.page}`}
                  className="absolute inset-0 z-10 pointer-events-none"
                >
                  <OuterGridPageLayer
                    {...layerProps}
                    data={pageTransition.from}
                    interactive={false}
                  />
                </div>
              ) : null}
              <div
                ref={currentPageLayerRef}
                key={`page-${currentPage}`}
                className={pageTransition ? 'absolute inset-0 z-20' : 'relative h-full w-full'}
              >
                <OuterGridPageLayer
                  {...layerProps}
                  data={currentPageData}
                  interactive
                  pageOrder={pageOrder}
                  gridRef={gridRef}
                />
              </div>
            </div>
            {adjacentPages.map(neighbor => (
              <div
                key={`swipe-preview-${neighbor.page}`}
                data-page-swipe-neighbor={neighbor.page}
                className="pointer-events-none absolute inset-0"
                style={{ transform: `translate3d(${neighbor.x}px, 0, 0)` }}
                inert
                aria-hidden="true"
              >
                <OuterGridPageLayer
                  {...layerProps}
                  data={{ ...currentPageData, page: neighbor.page, entries: neighbor.entries }}
                  interactive={false}
                />
              </div>
            ))}
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

          {/* 分页指示器（仅 scroll 模式传入 paginationOffset 时渲染；分页模式的
          指示器在 IconGrid 容器层固定贴 dock）。 */}
          {paginationOffset != null ? (
            <div
              data-pagination
              className="absolute left-1/2 z-10 -translate-x-1/2 px-3 py-1.5"
              style={{ top: `calc(100% + ${paginationOffset}px)` }}
              onMouseLeave={() => onHoverPage?.(null)}
            >
              <div
                className="flex items-center"
                style={{ columnGap: `${paginationDotGap ?? 10}px` }}
              >
                {Array.from({ length: pageCount ?? 0 }, (_, index) => {
                  const isCurrent = currentPage === index
                  const isHovered = hoverPage === index
                  const shouldExpand = isCurrent || isHovered
                  return (
                    <button
                      key={index}
                      data-pagination
                      type="button"
                      aria-label={`Switch to page ${index + 1}`}
                      onMouseEnter={() => onHoverPage?.(index)}
                      onClick={() => onSwitchPage?.(index)}
                      className={`relative rounded-full transition-all duration-250 ease-out ${
                        isCurrent
                          ? 'bg-foreground/88 shadow-[0_0_10px_rgba(15,23,42,0.25)] dark:bg-white/95 dark:shadow-[0_0_10px_rgba(255,255,255,0.75)]'
                          : isHovered
                            ? 'bg-foreground/45 dark:bg-white/55'
                            : 'bg-foreground/25 hover:bg-foreground/35 dark:bg-white/35 dark:hover:bg-white/45'
                      }`}
                      style={{
                        width: `${shouldExpand ? (paginationActiveWidth ?? 18) : (paginationDotSize ?? 8)}px`,
                        height: `${paginationDotSize ?? 8}px`,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </DndContext>
    </GridItemResizeContext.Provider>
  )
}
