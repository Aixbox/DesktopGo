import {
  closestCenter,
  DndContext,
  useDroppable,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type SensorDescriptor,
} from '@dnd-kit/core'
import { SortableContext, useSortable } from '@dnd-kit/sortable'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useReducedMotion } from 'framer-motion'
import { Icon } from '../../Icon'
import type { FolderSize, GridSpan } from '../model'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import { FolderCreatePreview } from './FolderVisuals'
import { OuterFolderTile } from './OuterFolderTile'
import { WidgetTile } from './WidgetTile'
import { COLOROS_MOTION, MOTION_SPRING_EASING } from '../constants'
import { resolveMotionDuration } from '../domain/motionTokens'

const PAGE_SLIDE_EASING = MOTION_SPRING_EASING

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
  keyboardSensors?: SensorDescriptor<any>[]
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

interface KeyboardSortableGridItemBindings {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setNodeRef: ReturnType<typeof useSortable>['setNodeRef']
}

function KeyboardSortableGridItem({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: (bindings: KeyboardSortableGridItemBindings) => ReactNode
}) {
  const { attributes, listeners, setNodeRef } = useSortable({
    id,
    disabled,
    animateLayoutChanges: () => false,
  })
  return children({ attributes, listeners, setNodeRef })
}

function KeyboardGridCell({
  id,
  disabled,
  itemHeight,
}: {
  id: string
  disabled: boolean
  itemHeight: number
}) {
  const { setNodeRef } = useDroppable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      data-grid-item
      className="h-full w-full rounded-icon-tile border border-transparent bg-transparent"
      style={{ minHeight: `${itemHeight}px` }}
      aria-hidden="true"
    />
  )
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
  const prefersReduced = useReducedMotion() ?? false
  const pageSlideMs = resolveMotionDuration(COLOROS_MOTION.workspacePageSnapMs, prefersReduced)
  const prevPageRef = useRef(currentPage)
  const slideTimerRef = useRef<number | null>(null)
  const slideAnimationTokenRef = useRef(0)
  const slideAnimationsRef = useRef<Animation[]>([])
  const snapshotCloneRef = useRef<HTMLDivElement | null>(null)
  const prevGridSnapshotRef = useRef<HTMLDivElement | null>(null)
  const gridClipRef = useRef<HTMLDivElement | null>(null)
  const highlightedOuterItemIdSet = new Set(highlightedOuterItemIds)
  const occupiedCellIndices = new Set<number>()
  pageAnchorEntries.forEach(entry => {
    for (let row = entry.row; row < entry.row + entry.span.rows; row += 1) {
      for (let col = entry.col; col < entry.col + entry.span.cols; col += 1) {
        occupiedCellIndices.add(row * columns + col)
      }
    }
  })

  // Capture a detached DOM snapshot after every render for use as the "old page".
  // Cloning keeps browser-managed attributes and nested nodes intact while
  // avoiding a second React tree that could receive events during the slide.
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (grid && prevPageRef.current === currentPage) {
      prevGridSnapshotRef.current = grid.cloneNode(true) as HTMLDivElement
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
    slideAnimationsRef.current.forEach(animation => animation.cancel())
    slideAnimationsRef.current = []
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
    const animationToken = ++slideAnimationTokenRef.current

    if (pageSlideMs === 0) {
      grid.style.transition = ''
      grid.style.transform = ''
      prevGridSnapshotRef.current = grid.cloneNode(true) as HTMLDivElement
      return
    }

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
    const snapshot = prevGridSnapshotRef.current ?? (grid.cloneNode(true) as HTMLDivElement)
    clone.replaceChildren(...Array.from(snapshot.childNodes, node => node.cloneNode(true)))
    clipContainer.appendChild(clone)
    snapshotCloneRef.current = clone

    // Animate: old page slides out, new page slides in from opposite side
    const slideDistance = gridWidth
    const oldTransform = `translate3d(${-direction * slideDistance}px, 0, 0)`
    const newTransform = `translate3d(${direction * slideDistance}px, 0, 0)`

    const finishSlide = () => {
      if (slideAnimationTokenRef.current !== animationToken) return
      slideAnimationsRef.current.forEach(animation => animation.cancel())
      slideAnimationsRef.current = []
      grid.style.transition = ''
      grid.style.transform = ''
      clone.remove()
      snapshotCloneRef.current = null
      slideTimerRef.current = null
      clipContainer.style.overflow = ''
    }

    if (typeof clone.animate === 'function' && typeof grid.animate === 'function') {
      const oldAnimation = clone.animate(
        [
          { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          { transform: oldTransform, opacity: 0 },
        ],
        { duration: pageSlideMs, easing: PAGE_SLIDE_EASING, fill: 'forwards' }
      )
      const newAnimation = grid.animate(
        [{ transform: newTransform }, { transform: 'translate3d(0, 0, 0)' }],
        { duration: pageSlideMs, easing: PAGE_SLIDE_EASING, fill: 'forwards' }
      )
      slideAnimationsRef.current = [oldAnimation, newAnimation]
      void Promise.allSettled([oldAnimation.finished, newAnimation.finished]).then(finishSlide)
    } else {
      // WebView fallback for engines without WAAPI support.
      clone.style.transition = 'none'
      clone.style.transform = 'translate3d(0, 0, 0)'
      void clone.offsetWidth
      clone.style.transition = `transform ${pageSlideMs}ms ${PAGE_SLIDE_EASING}, opacity ${pageSlideMs}ms ${PAGE_SLIDE_EASING}`
      clone.style.transform = oldTransform
      clone.style.opacity = '0'
      grid.style.transition = 'none'
      grid.style.transform = newTransform
      void grid.offsetWidth
      grid.style.transition = `transform ${pageSlideMs}ms ${PAGE_SLIDE_EASING}`
      grid.style.transform = 'translate3d(0, 0, 0)'
    }

    // Save new page snapshot after animation content is ready
    prevGridSnapshotRef.current = grid.cloneNode(true) as HTMLDivElement

    slideTimerRef.current = window.setTimeout(finishSlide, pageSlideMs + 40)
  }, [currentPage, gridRef, gridWidth, pageSlideMs])

  useEffect(() => {
    return () => {
      slideAnimationTokenRef.current += 1
      slideAnimationsRef.current.forEach(animation => animation.cancel())
      slideAnimationsRef.current = []
      if (slideTimerRef.current !== null) {
        window.clearTimeout(slideTimerRef.current)
        slideTimerRef.current = null
      }
      snapshotCloneRef.current?.remove()
      snapshotCloneRef.current = null
      const grid = gridRef.current
      if (grid) {
        grid.style.transition = ''
        grid.style.transform = ''
      }
      const clipContainer = gridClipRef.current
      if (clipContainer) clipContainer.style.overflow = ''
    }
  }, [gridRef])

  return (
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
                <KeyboardGridCell
                  key={`cell-${currentPage}-${index}`}
                  id={`cell:${currentPage}:${index}`}
                  disabled={selectionMode || occupiedCellIndices.has(index)}
                  itemHeight={itemHeight}
                />
              )
            })}

            {dragContext === 'outer' &&
            dragPreviewSlotIndex !== null &&
            previewFootprint !== null ? (
              <div
                className="pointer-events-none rounded-icon-tile border border-border/60 bg-background/35 dark:border-white/22 dark:bg-white/8"
                style={{
                  gridColumn: `${previewFootprint.col + 1} / span ${previewFootprint.span.cols}`,
                  gridRow: `${previewFootprint.row + 1} / span ${previewFootprint.span.rows}`,
                }}
                aria-hidden="true"
              />
            ) : null}

            <SortableContext items={pageAnchorEntries.map(entry => entry.id)}>
              {pageAnchorEntries.map(entry => {
                const hideItem = hiddenOuterItemIds.includes(entry.id)
                const highlightedItem = highlightedOuterItemIdSet.has(entry.id)
                const folderPreview =
                  (dragContext === 'outer' && dragFolderPreviewTargetId === entry.id) ||
                  folderPreviewFreezeTargetId === entry.id ||
                  folderCreateTransitionTargetId === entry.id

                return (
                  <KeyboardSortableGridItem key={entry.id} id={entry.id} disabled={selectionMode}>
                    {sortable => (
                      <div
                        ref={node => {
                          sortable.setNodeRef(node)
                          bindTileRef(entry.id, node)
                        }}
                        {...sortable.attributes}
                        {...sortable.listeners}
                        className={`relative justify-self-center self-start ${
                          hideItem ? 'opacity-0' : 'opacity-100 transition-opacity duration-150'
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
                        ) : entry.item.kind === 'folder' ? (
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
                            onDissolveFolder={onDissolveFolder}
                          />
                        ) : (
                          <WidgetTile
                            widget={entry.item}
                            span={entry.span}
                            slotWidth={itemWidth}
                            slotHeight={itemHeight}
                            gridGap={gridGap}
                            onResize={onResizeWidget}
                          />
                        )}
                      </div>
                    )}
                  </KeyboardSortableGridItem>
                )
              })}
            </SortableContext>
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

        {/* 分页指示器（仅 scroll 模式传入 paginationOffset 时渲染；分页模式的
          指示器在 IconGrid 容器层固定贴 dock）。 */}
        {paginationOffset != null ? (
          <div
            data-pagination
            className="absolute left-1/2 z-10 -translate-x-1/2 px-3 py-1.5"
            style={{ top: `calc(100% + ${paginationOffset}px)` }}
            onMouseLeave={() => onHoverPage?.(null)}
          >
            <div className="flex items-center" style={{ columnGap: `${paginationDotGap ?? 10}px` }}>
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
  )
}
