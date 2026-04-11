import { Check } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import type { DesktopIcon } from '../../../types'
import { translate, useI18n } from '@/lib/i18n'
import type { GridItem } from '../model'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../ui/context-menu'
import { DOCK_GAP } from '../domain/dock'
import {
  DOCK_FOLDER_SURFACE_ACTIVE_CLASS,
  DOCK_FOLDER_SURFACE_CLASS,
  FolderIconVisual,
  FOLDER_SHARED_LAYOUT_TRANSITION,
  type DesktopSingleSlotFolderMetrics,
  getDesktopSingleSlotFolderMetrics,
  getFolderSharedLayoutId,
} from './FolderVisuals'

interface DockBarProps {
  displaySlots: Array<string | null>
  itemById: Map<string, GridItem>
  dockPreviewIndex: number | null
  dragContext: 'outer' | 'folder' | 'dock' | null
  dragFolderPreviewTargetId: string | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  dragPointerRef: MutableRefObject<{ pointerX: number; pointerY: number } | null>
  iconImageSize: number
  iconTileWidth: number
  iconTileHeight: number
  selectionMode: boolean
  selectedSet: Set<string>
  onToggleSelectIcon: (key: string) => void
  openFolderId: string | null
  activeFolderSharedLayoutId: string | null
  bindDockContainerRef: (node: HTMLDivElement | null) => void
  bindDockGridRef: (node: HTMLDivElement | null) => void
  bindDockSlotRef: (index: number, node: HTMLDivElement | null) => void
  bindDockItemRef: (id: string, node: HTMLDivElement | null) => void
  onDockItemPointerDown: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void
  onDockItemClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onDockAutoScroll: () => void
  onLaunchIcon: (path: string) => void
  onShowSystemMenu: (icon: DesktopIcon) => void
  onOpenFolder: (folderId: string) => void
  onRemoveItem: (id: string) => void
}

const MENU_OPEN_LABEL = '打开'
const MENU_SYSTEM_MENU_LABEL = '系统菜单'
const MENU_REMOVE_LABEL = '移出 Dock'
const DOCK_CONTAINER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const DOCK_CONTAINER_TRANSITION_MS = 220
const DOCK_PANEL_VIEWPORT_MARGIN = 32
const DOCK_AUTO_SCROLL_EDGE_ZONE = 72
const DOCK_AUTO_SCROLL_MAX_SPEED = 22
const DOCK_AUTO_SCROLL_VERTICAL_BUFFER = 36
const DOCK_OVERFLOW_THRESHOLD = 6
const DOCK_INDICATOR_MIN_WIDTH = 26
const DOCK_SMOOTH_SCROLL_EASING = 0.38
const DOCK_SMOOTH_SCROLL_STOP_DISTANCE = 0.35

interface IndicatorMetrics {
  thumbWidth: number
  thumbOffset: number
}

interface IndicatorDragState {
  pointerId: number
  thumbGrabOffset: number
  trackLeft: number
  trackWidth: number
}

interface DockFolderCreatePreviewProps {
  active: boolean
  icon: DesktopIcon
  metrics: DesktopSingleSlotFolderMetrics
  reorderAnimationMs: number
}

function DockFolderCreatePreview({
  active,
  icon,
  metrics,
  reorderAnimationMs,
}: DockFolderCreatePreviewProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={`${DOCK_FOLDER_SURFACE_CLASS} flex items-center justify-center transition-all duration-200 ${
            active
              ? `${DOCK_FOLDER_SURFACE_ACTIVE_CLASS} scale-100 opacity-100`
              : 'scale-[0.94] opacity-0'
          }`}
          style={{
            width: `${metrics.surfaceSize}px`,
            height: `${metrics.surfaceSize}px`,
            borderRadius: `${metrics.surfaceRadius}px`,
            transitionDuration: `${reorderAnimationMs}ms`,
          }}
        >
          <FolderIconVisual icons={[icon]} imgSize={metrics.previewSize} withSurface={false} />
        </div>
      </div>
    </div>
  )
}

const resolveDockContentWidth = (slotCount: number, buttonSize: number) => {
  if (slotCount <= 0) return 0
  return slotCount * buttonSize + Math.max(0, slotCount - 1) * DOCK_GAP
}

const resolveIndicatorMetrics = (
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  trackWidth: number
): IndicatorMetrics => {
  if (clientWidth <= 0 || scrollWidth <= 0 || trackWidth <= 0) {
    return {
      thumbWidth: 0,
      thumbOffset: 0,
    }
  }

  const thumbWidth = Math.min(
    trackWidth,
    Math.max(DOCK_INDICATOR_MIN_WIDTH, (clientWidth * clientWidth) / Math.max(scrollWidth, 1))
  )
  const maxThumbOffset = Math.max(0, trackWidth - thumbWidth)
  const thumbOffset =
    scrollWidth > clientWidth ? (scrollLeft / (scrollWidth - clientWidth)) * maxThumbOffset : 0

  return {
    thumbWidth,
    thumbOffset,
  }
}

export function DockBar({
  displaySlots,
  itemById,
  dockPreviewIndex,
  dragContext,
  dragFolderPreviewTargetId,
  folderPreviewFreezeTargetId,
  folderCreateTransitionTargetId,
  dragPointerRef,
  iconImageSize,
  iconTileWidth,
  iconTileHeight,
  selectionMode,
  selectedSet,
  onToggleSelectIcon,
  openFolderId,
  activeFolderSharedLayoutId,
  bindDockContainerRef,
  bindDockGridRef,
  bindDockSlotRef,
  bindDockItemRef,
  onDockItemPointerDown,
  onDockItemClickCapture,
  onDockAutoScroll,
  onLaunchIcon,
  onShowSystemMenu,
  onOpenFolder,
  onRemoveItem,
}: DockBarProps) {
  useI18n()

  const panelRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const indicatorTrackRef = useRef<HTMLDivElement | null>(null)
  const indicatorThumbRef = useRef<HTMLDivElement | null>(null)
  const indicatorDragRef = useRef<IndicatorDragState | null>(null)
  const hasMountedRef = useRef(false)
  const clearWidthTimerRef = useRef<number | null>(null)
  const autoScrollRafRef = useRef<number | null>(null)
  const smoothScrollRafRef = useRef<number | null>(null)
  const smoothScrollTargetRef = useRef<number | null>(null)
  const smoothScrollLastFrameRef = useRef<number | null>(null)
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false)
  const [isIndicatorDragging, setIsIndicatorDragging] = useState(false)
  const dockButtonSize = Math.max(iconImageSize + 12, 52)
  const singleSlotFolderMetrics = getDesktopSingleSlotFolderMetrics(iconTileWidth, iconTileHeight)
  const dockContentWidth = resolveDockContentWidth(displaySlots.length, dockButtonSize)
  const showInsertionPreview =
    dragContext === 'dock' &&
    dockPreviewIndex !== null &&
    dragFolderPreviewTargetId === null &&
    folderPreviewFreezeTargetId === null

  const hasVisibleItems = displaySlots.some(slot => typeof slot === 'string')

  const updateOverflowState = () => {
    const panel = panelRef.current
    if (!panel) return

    const panelStyle = window.getComputedStyle(panel)
    const horizontalChrome =
      parseFloat(panelStyle.paddingLeft) +
      parseFloat(panelStyle.paddingRight) +
      parseFloat(panelStyle.borderLeftWidth) +
      parseFloat(panelStyle.borderRightWidth)
    const maxPanelContentWidth = Math.max(
      0,
      window.innerWidth - DOCK_PANEL_VIEWPORT_MARGIN * 2 - horizontalChrome
    )
    const nextOverflow = dockContentWidth - maxPanelContentWidth > DOCK_OVERFLOW_THRESHOLD

    setHasHorizontalOverflow(current => (current === nextOverflow ? current : nextOverflow))
  }

  const syncIndicatorVisual = () => {
    const scroller = scrollerRef.current
    const thumb = indicatorThumbRef.current
    if (!scroller || !thumb) return

    const trackWidth = indicatorTrackRef.current?.clientWidth ?? scroller.clientWidth
    const { thumbWidth, thumbOffset } = resolveIndicatorMetrics(
      scroller.scrollLeft,
      scroller.clientWidth,
      scroller.scrollWidth,
      trackWidth
    )

    thumb.style.width = `${thumbWidth}px`
    thumb.style.transform = `translate3d(${thumbOffset}px, -50%, 0px)`
  }

  const refreshDockMetrics = () => {
    updateOverflowState()
    syncIndicatorVisual()
  }

  const stopSmoothScroll = () => {
    if (smoothScrollRafRef.current !== null) {
      window.cancelAnimationFrame(smoothScrollRafRef.current)
      smoothScrollRafRef.current = null
    }
    smoothScrollTargetRef.current = null
    smoothScrollLastFrameRef.current = null
  }

  const queueSmoothScroll = (delta: number, options?: { relativeToCurrent?: boolean }) => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
    if (maxScrollLeft <= 0) return

    const baseScrollLeft = options?.relativeToCurrent
      ? scroller.scrollLeft
      : (smoothScrollTargetRef.current ?? scroller.scrollLeft)
    const nextTarget = Math.max(0, Math.min(maxScrollLeft, baseScrollLeft + delta))
    smoothScrollTargetRef.current = nextTarget

    if (smoothScrollRafRef.current !== null) return

    const step = (timestamp: number) => {
      const activeScroller = scrollerRef.current
      const targetScrollLeft = smoothScrollTargetRef.current
      if (!activeScroller || targetScrollLeft === null) {
        stopSmoothScroll()
        return
      }

      const previousTimestamp = smoothScrollLastFrameRef.current
      smoothScrollLastFrameRef.current = timestamp
      const frameDuration =
        previousTimestamp === null ? 16.667 : Math.min(34, timestamp - previousTimestamp)
      const easing = 1 - Math.pow(1 - DOCK_SMOOTH_SCROLL_EASING, frameDuration / 16.667)
      const currentScrollLeft = activeScroller.scrollLeft
      const nextScrollLeft =
        Math.abs(targetScrollLeft - currentScrollLeft) <= DOCK_SMOOTH_SCROLL_STOP_DISTANCE
          ? targetScrollLeft
          : currentScrollLeft + (targetScrollLeft - currentScrollLeft) * easing

      activeScroller.scrollLeft = nextScrollLeft
      syncIndicatorVisual()

      if (Math.abs(targetScrollLeft - nextScrollLeft) <= DOCK_SMOOTH_SCROLL_STOP_DISTANCE) {
        activeScroller.scrollLeft = targetScrollLeft
        syncIndicatorVisual()
        stopSmoothScroll()
        return
      }

      smoothScrollRafRef.current = window.requestAnimationFrame(step)
    }

    smoothScrollRafRef.current = window.requestAnimationFrame(step)
  }

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const panelStyle = window.getComputedStyle(panel)
    const horizontalChrome =
      parseFloat(panelStyle.paddingLeft) +
      parseFloat(panelStyle.paddingRight) +
      parseFloat(panelStyle.borderLeftWidth) +
      parseFloat(panelStyle.borderRightWidth)
    const maxWidth = Math.max(
      dockButtonSize + horizontalChrome,
      window.innerWidth - DOCK_PANEL_VIEWPORT_MARGIN * 2
    )
    const nextWidth = Math.min(Math.ceil(dockContentWidth + horizontalChrome), maxWidth)

    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      panel.style.width = ''
      return
    }

    const currentWidth = Math.ceil(panel.getBoundingClientRect().width)
    if (Math.abs(currentWidth - nextWidth) < 1) return

    if (clearWidthTimerRef.current !== null) {
      window.clearTimeout(clearWidthTimerRef.current)
      clearWidthTimerRef.current = null
    }

    panel.style.width = `${currentWidth}px`
    void panel.offsetWidth
    panel.style.width = `${nextWidth}px`

    clearWidthTimerRef.current = window.setTimeout(() => {
      const latestPanel = panelRef.current
      if (!latestPanel) return
      latestPanel.style.width = ''
      clearWidthTimerRef.current = null
    }, DOCK_CONTAINER_TRANSITION_MS + 40)
  }, [dockButtonSize, dockContentWidth])

  useEffect(() => {
    return () => {
      if (clearWidthTimerRef.current !== null) {
        window.clearTimeout(clearWidthTimerRef.current)
        clearWidthTimerRef.current = null
      }
      stopSmoothScroll()
    }
  }, [])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const grid = gridRef.current
    if (!scroller || !grid) return

    let raf = 0
    const scheduleMetricsUpdate = () => {
      cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(refreshDockMetrics)
    }

    scheduleMetricsUpdate()
    const observer = new ResizeObserver(scheduleMetricsUpdate)
    observer.observe(scroller)
    observer.observe(grid)
    window.addEventListener('resize', scheduleMetricsUpdate)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', scheduleMetricsUpdate)
    }
  }, [dockButtonSize, dockContentWidth])

  useLayoutEffect(() => {
    if (!hasHorizontalOverflow) return
    syncIndicatorVisual()
  }, [hasHorizontalOverflow, isIndicatorDragging, dockButtonSize, dockContentWidth])

  useEffect(() => {
    if (dragContext !== 'dock' || !hasHorizontalOverflow) return

    let lastFrameTimestamp: number | null = null
    const step = (timestamp: number) => {
      autoScrollRafRef.current = window.requestAnimationFrame(step)

      const frameDuration =
        lastFrameTimestamp === null ? 16.667 : Math.min(34, timestamp - lastFrameTimestamp)
      lastFrameTimestamp = timestamp

      const scroller = scrollerRef.current
      const pointer = dragPointerRef.current
      if (!scroller || !pointer) return

      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
      if (maxScrollLeft <= 0) return

      const rect = scroller.getBoundingClientRect()
      const withinVertical =
        pointer.pointerY >= rect.top - DOCK_AUTO_SCROLL_VERTICAL_BUFFER &&
        pointer.pointerY <= rect.bottom + DOCK_AUTO_SCROLL_VERTICAL_BUFFER
      if (!withinVertical) return

      let delta = 0
      if (pointer.pointerX < rect.left + DOCK_AUTO_SCROLL_EDGE_ZONE) {
        const ratio = Math.min(
          1,
          Math.max(
            0,
            (rect.left + DOCK_AUTO_SCROLL_EDGE_ZONE - pointer.pointerX) / DOCK_AUTO_SCROLL_EDGE_ZONE
          )
        )
        delta = -Math.max(1, ratio * DOCK_AUTO_SCROLL_MAX_SPEED) * (frameDuration / 16.667)
      } else if (pointer.pointerX > rect.right - DOCK_AUTO_SCROLL_EDGE_ZONE) {
        const ratio = Math.min(
          1,
          Math.max(
            0,
            (pointer.pointerX - (rect.right - DOCK_AUTO_SCROLL_EDGE_ZONE)) /
              DOCK_AUTO_SCROLL_EDGE_ZONE
          )
        )
        delta = Math.max(1, ratio * DOCK_AUTO_SCROLL_MAX_SPEED) * (frameDuration / 16.667)
      }

      if (Math.abs(delta) < 0.5) return

      const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, scroller.scrollLeft + delta))
      if (Math.abs(nextScrollLeft - scroller.scrollLeft) < 0.5) return

      queueSmoothScroll(delta, { relativeToCurrent: true })
    }

    autoScrollRafRef.current = window.requestAnimationFrame(step)
    return () => {
      if (autoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(autoScrollRafRef.current)
        autoScrollRafRef.current = null
      }
    }
  }, [dragContext, dragPointerRef, hasHorizontalOverflow])

  const handleScrollWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget
    if (!hasHorizontalOverflow) return
    if (scroller.scrollWidth <= scroller.clientWidth) return
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

    queueSmoothScroll(event.deltaY)
    event.preventDefault()
  }

  const handleScrollerScroll = () => {
    syncIndicatorVisual()
    if (!hasHorizontalOverflow) return
    if (dragContext === 'dock') {
      onDockAutoScroll()
    }
  }

  const scrollToIndicatorPointer = (
    clientX: number,
    thumbGrabOffset: number,
    trackLeft?: number,
    trackWidth?: number
  ) => {
    const scroller = scrollerRef.current
    const track = indicatorTrackRef.current
    if (!scroller || !track || !hasHorizontalOverflow) return

    const resolvedTrackLeft = trackLeft ?? track.getBoundingClientRect().left
    const resolvedTrackWidth = trackWidth ?? track.getBoundingClientRect().width
    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
    if (maxScrollLeft <= 0) return

    const { thumbWidth } = resolveIndicatorMetrics(
      scroller.scrollLeft,
      scroller.clientWidth,
      scroller.scrollWidth,
      resolvedTrackWidth
    )
    const maxThumbOffset = Math.max(0, resolvedTrackWidth - thumbWidth)
    const rawThumbOffset = clientX - resolvedTrackLeft - thumbGrabOffset
    const clampedThumbOffset = Math.max(0, Math.min(maxThumbOffset, rawThumbOffset))
    const ratio = maxThumbOffset > 0 ? clampedThumbOffset / maxThumbOffset : 0

    stopSmoothScroll()
    scroller.scrollLeft = ratio * maxScrollLeft
    syncIndicatorVisual()
  }

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = indicatorDragRef.current
      if (!current) return
      if (event.pointerId !== current.pointerId) return

      event.preventDefault()
      scrollToIndicatorPointer(
        event.clientX,
        current.thumbGrabOffset,
        current.trackLeft,
        current.trackWidth
      )
    }

    const handlePointerEnd = (event: PointerEvent) => {
      const current = indicatorDragRef.current
      if (!current || current.pointerId !== event.pointerId) return
      indicatorDragRef.current = null
      setIsIndicatorDragging(false)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }
  }, [hasHorizontalOverflow])

  const beginIndicatorDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    thumbGrabOffset: number
  ) => {
    if (!hasHorizontalOverflow) return

    const track = indicatorTrackRef.current
    if (!track) return

    const trackRect = track.getBoundingClientRect()
    stopSmoothScroll()
    event.preventDefault()
    event.stopPropagation()
    indicatorDragRef.current = {
      pointerId: event.pointerId,
      thumbGrabOffset,
      trackLeft: trackRect.left,
      trackWidth: trackRect.width,
    }
    setIsIndicatorDragging(true)
    scrollToIndicatorPointer(event.clientX, thumbGrabOffset, trackRect.left, trackRect.width)
  }

  const handleIndicatorTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const thumbWidth = indicatorThumbRef.current?.offsetWidth ?? DOCK_INDICATOR_MIN_WIDTH
    beginIndicatorDrag(event, thumbWidth / 2)
  }

  const handleIndicatorThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const thumbRect = event.currentTarget.getBoundingClientRect()
    beginIndicatorDrag(event, event.clientX - thumbRect.left)
  }

  return (
    <div
      ref={bindDockContainerRef}
      data-dock
      className="pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2"
    >
      <div
        ref={panelRef}
        className="launchpad-glass-panel relative overflow-hidden rounded-[28px] px-4 py-3 shadow-[0_20px_60px_rgba(15,23,42,0.18)] transition-[width] duration-[220ms] dark:shadow-[0_20px_60px_rgba(0,0,0,0.24)]"
        style={{
          maxWidth: `calc(100vw - ${DOCK_PANEL_VIEWPORT_MARGIN * 2}px)`,
          transitionTimingFunction: DOCK_CONTAINER_EASING,
        }}
      >
        <div
          ref={scrollerRef}
          className="dock-scrollbar-hidden overflow-x-auto overflow-y-hidden"
          onWheel={handleScrollWheel}
          onScroll={handleScrollerScroll}
        >
          <div
            ref={node => {
              gridRef.current = node
              bindDockGridRef(node)
            }}
            className="flex w-max items-center"
            style={{ columnGap: `${DOCK_GAP}px` }}
          >
            {displaySlots.map((id, index) => {
              const item = id ? (itemById.get(id) ?? null) : null
              const folderPreview =
                Boolean(id) &&
                ((dragContext === 'dock' && dragFolderPreviewTargetId === id) ||
                  folderPreviewFreezeTargetId === id ||
                  folderCreateTransitionTargetId === id)
              const folderOpen = item?.kind === 'folder' && openFolderId === item.id
              const sharedLayoutActive =
                item?.kind === 'folder' && activeFolderSharedLayoutId === item.id
              const selectableIcon = item?.kind === 'icon'

              return (
                <div
                  key={id ?? `dock-empty-${index}`}
                  ref={node => {
                    bindDockSlotRef(index, node)
                  }}
                  data-dock-slot
                  className="relative flex items-center justify-center"
                  style={{ width: dockButtonSize, height: dockButtonSize }}
                >
                  {item && id ? (
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div
                          ref={node => {
                            bindDockItemRef(id, node)
                          }}
                          data-dock-item
                          data-dock-key={id}
                          className="group relative flex items-center justify-center"
                          style={{ width: dockButtonSize, height: dockButtonSize }}
                          onPointerDown={event => {
                            onDockItemPointerDown(event, id)
                          }}
                          onClickCapture={onDockItemClickCapture}
                          onContextMenu={event => {
                            event.stopPropagation()
                          }}
                        >
                          <button
                            type="button"
                            title={item.kind === 'icon' ? item.icon.name : item.name}
                            className={`relative flex cursor-pointer items-center justify-center rounded-2xl border-none bg-transparent p-0 shadow-none transition ${
                              selectionMode ? '' : 'hover:-translate-y-0.5 active:translate-y-0'
                            }`}
                            style={{ width: dockButtonSize, height: dockButtonSize }}
                            onClick={event => {
                              event.stopPropagation()
                              if (selectionMode) {
                                if (item.kind === 'icon') {
                                  onToggleSelectIcon(id)
                                  return
                                }
                                onOpenFolder(item.id)
                                return
                              }
                              if (item.kind === 'icon') {
                                onLaunchIcon(item.icon.path)
                                return
                              }
                              onOpenFolder(item.id)
                            }}
                          >
                            {selectionMode && selectableIcon ? (
                              <span
                                className={`absolute right-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full border text-xs ${
                                  selectedSet.has(id)
                                    ? 'border-blue-500 bg-blue-500 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
                                    : 'border-border/70 bg-background/72 text-transparent shadow-sm dark:border-white/60 dark:bg-black/30'
                                }`}
                              >
                                {selectedSet.has(id) ? (
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                ) : null}
                              </span>
                            ) : null}
                            {item.kind === 'icon' ? (
                              <>
                                <div
                                  className={`transition-opacity duration-150 ${
                                    folderPreview ? 'opacity-0' : 'opacity-100'
                                  }`}
                                >
                                  {item.icon.icon_base64 ? (
                                    <img
                                      src={item.icon.icon_base64}
                                      alt={item.icon.name}
                                      className="icon-image object-contain"
                                      style={{ width: iconImageSize, height: iconImageSize }}
                                      draggable={false}
                                    />
                                  ) : (
                                    <div
                                      className="icon-image rounded-xl bg-foreground/8 dark:bg-white/12"
                                      style={{ width: iconImageSize, height: iconImageSize }}
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>
                                <DockFolderCreatePreview
                                  active={folderPreview}
                                  icon={item.icon}
                                  metrics={singleSlotFolderMetrics}
                                  reorderAnimationMs={220}
                                />
                              </>
                            ) : (
                              <div
                                className="flex items-center justify-center transition-opacity duration-150"
                                style={{ width: dockButtonSize, height: dockButtonSize }}
                              >
                                <motion.div
                                  layoutId={
                                    sharedLayoutActive
                                      ? getFolderSharedLayoutId(item.id)
                                      : undefined
                                  }
                                  transition={FOLDER_SHARED_LAYOUT_TRANSITION}
                                  className={`${DOCK_FOLDER_SURFACE_CLASS} flex items-center justify-center transition-all duration-150 ${
                                    folderPreview || folderOpen
                                      ? DOCK_FOLDER_SURFACE_ACTIVE_CLASS
                                      : ''
                                  }`}
                                  style={{
                                    width: `${singleSlotFolderMetrics.surfaceSize}px`,
                                    height: `${singleSlotFolderMetrics.surfaceSize}px`,
                                    borderRadius: `${singleSlotFolderMetrics.surfaceRadius}px`,
                                  }}
                                >
                                  <FolderIconVisual
                                    icons={item.children.map(child => child.icon)}
                                    imgSize={singleSlotFolderMetrics.previewSize}
                                    withSurface={false}
                                  />
                                </motion.div>
                              </div>
                            )}
                          </button>
                        </div>
                      </ContextMenuTrigger>

                      {!selectionMode ? (
                        <ContextMenuContent
                          data-dock-menu="true"
                          className="w-44 rounded-2xl p-1.5 shadow-2xl backdrop-blur-xl"
                        >
                          <ContextMenuItem
                            className="rounded-xl px-3 py-2 text-foreground/85 focus:bg-accent focus:text-foreground"
                            onSelect={() => {
                              if (item.kind === 'icon') {
                                onLaunchIcon(item.icon.path)
                                return
                              }
                              onOpenFolder(item.id)
                            }}
                          >
                            {translate(MENU_OPEN_LABEL)}
                          </ContextMenuItem>
                          {item.kind === 'icon' ? (
                            <ContextMenuItem
                              className="rounded-xl px-3 py-2 text-foreground/85 focus:bg-accent focus:text-foreground"
                              onSelect={() => {
                                onShowSystemMenu(item.icon)
                              }}
                            >
                              {translate(MENU_SYSTEM_MENU_LABEL)}
                            </ContextMenuItem>
                          ) : null}
                          <ContextMenuItem
                            className="rounded-xl px-3 py-2 text-red-700 focus:bg-red-500/12 focus:text-red-800 dark:text-red-200 dark:focus:bg-red-500/20 dark:focus:text-red-100"
                            onSelect={() => {
                              onRemoveItem(id)
                            }}
                          >
                            {translate(MENU_REMOVE_LABEL)}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      ) : null}
                    </ContextMenu>
                  ) : (
                    <div
                      className={`pointer-events-none flex items-center justify-center rounded-[18px] border border-dashed transition ${
                        hasVisibleItems
                          ? 'border-border/35 bg-background/36 dark:border-white/18 dark:bg-white/[0.04]'
                          : 'border-border/45 bg-background/48 dark:border-white/24 dark:bg-white/[0.06]'
                      } ${showInsertionPreview ? 'scale-100 opacity-100' : 'opacity-80'}`}
                      style={{ width: iconImageSize + 8, height: iconImageSize + 8 }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {hasHorizontalOverflow ? (
          <div className="pointer-events-none absolute bottom-[-1px] left-4 right-4 h-4">
            <div
              ref={indicatorTrackRef}
              className="group/dock-scrollbar pointer-events-auto absolute inset-x-0 bottom-0 h-4 touch-none"
              onPointerDown={handleIndicatorTrackPointerDown}
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              <div
                ref={indicatorThumbRef}
                className={`absolute top-1/2 h-[5px] -translate-y-1/2 rounded-full will-change-transform transition-[width,opacity,background-color,box-shadow] duration-150 ${
                  isIndicatorDragging
                    ? 'cursor-grabbing bg-foreground/50 opacity-100 shadow-[0_0_0_1px_rgba(15,23,42,0.08)] dark:bg-white/55 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
                    : 'cursor-grab bg-foreground/34 opacity-85 shadow-[0_0_0_1px_rgba(15,23,42,0.06)] group-hover/dock-scrollbar:bg-foreground/46 group-hover/dock-scrollbar:opacity-100 dark:bg-white/36 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.05)] dark:group-hover/dock-scrollbar:bg-white/48'
                }`}
                style={{
                  width: '0px',
                  transform: 'translate3d(0px, -50%, 0px)',
                }}
                onPointerDown={handleIndicatorThumbPointerDown}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
