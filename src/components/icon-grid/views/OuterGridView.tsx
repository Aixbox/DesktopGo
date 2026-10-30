import {
  closestCenter,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type SensorDescriptor,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { useReducedMotion } from 'framer-motion'
import type { FolderSize, GridSpan } from '../model'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import { OuterGridPageLayer, type OuterGridPageData } from './OuterGridPageLayer'
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
  const previousPageDataRef = useRef<OuterGridPageData | null>(null)
  const [pageTransition, setPageTransition] = useState<{
    from: OuterGridPageData
    direction: 1 | -1
  } | null>(null)
  const slideTimerRef = useRef<number | null>(null)
  const slideAnimationTokenRef = useRef(0)
  const slideAnimationsRef = useRef<Animation[]>([])
  const gridClipRef = useRef<HTMLDivElement | null>(null)
  const oldPageLayerRef = useRef<HTMLDivElement | null>(null)
  const currentPageLayerRef = useRef<HTMLDivElement | null>(null)
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

  useLayoutEffect(() => {
    const previousPage = prevPageRef.current
    const previousData = previousPageDataRef.current
    if (previousPage !== currentPage && previousData && pageSlideMs > 0) {
      setPageTransition({
        from: previousData,
        direction: currentPage > previousPage ? 1 : -1,
      })
    } else if (previousPage !== currentPage) {
      setPageTransition(null)
    }
    prevPageRef.current = currentPage
    previousPageDataRef.current = currentPageData
  }, [currentPage, currentPageData, pageSlideMs])

  useLayoutEffect(() => {
    if (!pageTransition) return
    const oldLayer = oldPageLayerRef.current
    const currentLayer = currentPageLayerRef.current
    const clipContainer = gridClipRef.current
    if (!oldLayer || !currentLayer || !clipContainer) return

    slideAnimationsRef.current.forEach(animation => animation.cancel())
    slideAnimationsRef.current = []
    if (slideTimerRef.current !== null) {
      window.clearTimeout(slideTimerRef.current)
      slideTimerRef.current = null
    }

    const direction = pageTransition.direction
    const animationToken = ++slideAnimationTokenRef.current
    clipContainer.style.overflow = 'hidden'
    const slideDistance = gridWidth
    const oldTransform = `translate3d(${-direction * slideDistance}px, 0, 0)`
    const newTransform = `translate3d(${direction * slideDistance}px, 0, 0)`

    const finishSlide = () => {
      if (slideAnimationTokenRef.current !== animationToken) return
      if (slideTimerRef.current !== null) {
        window.clearTimeout(slideTimerRef.current)
        slideTimerRef.current = null
      }
      slideAnimationsRef.current.forEach(animation => animation.cancel())
      slideAnimationsRef.current = []
      oldLayer.style.removeProperty('transition')
      oldLayer.style.removeProperty('transform')
      oldLayer.style.removeProperty('opacity')
      currentLayer.style.removeProperty('transition')
      currentLayer.style.removeProperty('transform')
      clipContainer.style.overflow = ''
      setPageTransition(null)
    }

    if (typeof oldLayer.animate === 'function' && typeof currentLayer.animate === 'function') {
      const oldAnimation = oldLayer.animate(
        [
          { transform: 'translate3d(0, 0, 0)', opacity: 1 },
          { transform: oldTransform, opacity: 0 },
        ],
        { duration: pageSlideMs, easing: PAGE_SLIDE_EASING, fill: 'forwards' }
      )
      const newAnimation = currentLayer.animate(
        [{ transform: newTransform }, { transform: 'translate3d(0, 0, 0)' }],
        { duration: pageSlideMs, easing: PAGE_SLIDE_EASING, fill: 'forwards' }
      )
      slideAnimationsRef.current = [oldAnimation, newAnimation]
      void Promise.allSettled([oldAnimation.finished, newAnimation.finished]).then(finishSlide)
    } else {
      // WebView fallback for engines without WAAPI support.
      oldLayer.style.transition = 'none'
      oldLayer.style.transform = 'translate3d(0, 0, 0)'
      void oldLayer.offsetWidth
      oldLayer.style.transition = `transform ${pageSlideMs}ms ${PAGE_SLIDE_EASING}, opacity ${pageSlideMs}ms ${PAGE_SLIDE_EASING}`
      oldLayer.style.transform = oldTransform
      oldLayer.style.opacity = '0'
      currentLayer.style.transition = 'none'
      currentLayer.style.transform = newTransform
      void currentLayer.offsetWidth
      currentLayer.style.transition = `transform ${pageSlideMs}ms ${PAGE_SLIDE_EASING}`
      currentLayer.style.transform = 'translate3d(0, 0, 0)'
    }

    slideTimerRef.current = window.setTimeout(finishSlide, pageSlideMs + 40)

    return () => {
      if (slideAnimationTokenRef.current !== animationToken) return
      slideAnimationTokenRef.current += 1
      slideAnimationsRef.current.forEach(animation => animation.cancel())
      slideAnimationsRef.current = []
      if (slideTimerRef.current !== null) {
        window.clearTimeout(slideTimerRef.current)
        slideTimerRef.current = null
      }
      oldLayer.style.removeProperty('transition')
      oldLayer.style.removeProperty('transform')
      oldLayer.style.removeProperty('opacity')
      currentLayer.style.removeProperty('transition')
      currentLayer.style.removeProperty('transform')
      clipContainer.style.overflow = ''
    }
  }, [gridWidth, pageSlideMs, pageTransition])

  useEffect(() => {
    return () => {
      slideAnimationTokenRef.current += 1
      slideAnimationsRef.current.forEach(animation => animation.cancel())
      slideAnimationsRef.current = []
      if (slideTimerRef.current !== null) {
        window.clearTimeout(slideTimerRef.current)
        slideTimerRef.current = null
      }
      oldPageLayerRef.current?.style.removeProperty('transition')
      oldPageLayerRef.current?.style.removeProperty('transform')
      oldPageLayerRef.current?.style.removeProperty('opacity')
      currentPageLayerRef.current?.style.removeProperty('transition')
      currentPageLayerRef.current?.style.removeProperty('transform')
      const clipContainer = gridClipRef.current
      if (clipContainer) clipContainer.style.overflow = ''
    }
  }, [])

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
          {pageTransition ? (
            <div
              ref={oldPageLayerRef}
              key={`page-transition-from-${pageTransition.from.page}`}
              className="absolute inset-0 z-10 pointer-events-none"
            >
              <OuterGridPageLayer
                data={pageTransition.from}
                interactive={false}
                columns={columns}
                rows={rows}
                itemWidth={itemWidth}
                itemHeight={itemHeight}
                gridGap={gridGap}
                pageCellCount={pageCellCount}
                iconConfig={iconConfig}
                selectionMode={selectionMode}
                selectedSet={selectedSet}
                openFolderId={openFolderId}
                activeFolderSharedLayoutId={activeFolderSharedLayoutId}
                onToggleSelectIcon={onToggleSelectIcon}
                onTilePointerDown={onTilePointerDown}
                onTileClickCapture={onTileClickCapture}
                onOpenFolder={onOpenFolder}
                onLaunchIcon={onLaunchIcon}
                onResizeFolder={onResizeFolder}
                onResizeWidget={onResizeWidget}
                onDissolveFolder={onDissolveFolder}
                bindTileRef={bindTileRef}
                reorderAnimationMs={reorderAnimationMs}
              />
            </div>
          ) : null}
          <div
            ref={currentPageLayerRef}
            key={`page-${currentPage}`}
            className={pageTransition ? 'absolute inset-0 z-20' : 'relative h-full w-full'}
          >
            <OuterGridPageLayer
              data={currentPageData}
              interactive
              gridRef={gridRef}
              columns={columns}
              rows={rows}
              itemWidth={itemWidth}
              itemHeight={itemHeight}
              gridGap={gridGap}
              pageCellCount={pageCellCount}
              iconConfig={iconConfig}
              selectionMode={selectionMode}
              selectedSet={selectedSet}
              openFolderId={openFolderId}
              activeFolderSharedLayoutId={activeFolderSharedLayoutId}
              onToggleSelectIcon={onToggleSelectIcon}
              onTilePointerDown={onTilePointerDown}
              onTileClickCapture={onTileClickCapture}
              onOpenFolder={onOpenFolder}
              onLaunchIcon={onLaunchIcon}
              onResizeFolder={onResizeFolder}
              onResizeWidget={onResizeWidget}
              onDissolveFolder={onDissolveFolder}
              bindTileRef={bindTileRef}
              reorderAnimationMs={reorderAnimationMs}
            />
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
