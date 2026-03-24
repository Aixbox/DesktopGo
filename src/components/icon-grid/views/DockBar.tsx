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
import type { GridItem } from '../model'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../ui/context-menu'
import { DOCK_GAP } from '../domain/dock'
import { FolderCreatePreview, FolderIconVisual } from './FolderVisuals'

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
  selectionMode: boolean
  bindDockContainerRef: (node: HTMLDivElement | null) => void
  bindDockGridRef: (node: HTMLDivElement | null) => void
  bindDockSlotRef: (index: number, node: HTMLDivElement | null) => void
  bindDockItemRef: (id: string, node: HTMLDivElement | null) => void
  onDockItemPointerDown: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void
  onDockItemClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onDockAutoScroll: () => void
  onLaunchIcon: (path: string) => void
  onOpenFolder: (folderId: string) => void
  onRemoveItem: (id: string) => void
}

const MENU_OPEN_LABEL = '打开'
const MENU_REMOVE_LABEL = '移出 Dock'
const DOCK_CONTAINER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const DOCK_CONTAINER_TRANSITION_MS = 220
const DOCK_PANEL_VIEWPORT_MARGIN = 32
const DOCK_AUTO_SCROLL_EDGE_ZONE = 72
const DOCK_AUTO_SCROLL_MAX_SPEED = 22
const DOCK_AUTO_SCROLL_VERTICAL_BUFFER = 36
const DOCK_OVERFLOW_THRESHOLD = 6
const DOCK_INDICATOR_MIN_WIDTH = 26

interface ScrollMetrics {
  scrollLeft: number
  clientWidth: number
  scrollWidth: number
}

interface IndicatorDragState {
  pointerId: number
  thumbGrabOffset: number
}

const resolveDockContentWidth = (slotCount: number, buttonSize: number) => {
  if (slotCount <= 0) return 0
  return slotCount * buttonSize + Math.max(0, slotCount - 1) * DOCK_GAP
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
  selectionMode,
  bindDockContainerRef,
  bindDockGridRef,
  bindDockSlotRef,
  bindDockItemRef,
  onDockItemPointerDown,
  onDockItemClickCapture,
  onDockAutoScroll,
  onLaunchIcon,
  onOpenFolder,
  onRemoveItem,
}: DockBarProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const indicatorTrackRef = useRef<HTMLDivElement | null>(null)
  const indicatorDragRef = useRef<IndicatorDragState | null>(null)
  const hasMountedRef = useRef(false)
  const clearWidthTimerRef = useRef<number | null>(null)
  const autoScrollRafRef = useRef<number | null>(null)
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false)
  const [isIndicatorDragging, setIsIndicatorDragging] = useState(false)
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({
    scrollLeft: 0,
    clientWidth: 0,
    scrollWidth: 0,
  })
  const dockButtonSize = Math.max(iconImageSize + 12, 52)
  const dockContentWidth = resolveDockContentWidth(displaySlots.length, dockButtonSize)
  const showInsertionPreview =
    dragContext === 'dock' &&
    dockPreviewIndex !== null &&
    dragFolderPreviewTargetId === null &&
    folderPreviewFreezeTargetId === null

  const hasVisibleItems = displaySlots.some(slot => typeof slot === 'string')

  const updateScrollMetrics = () => {
    const panel = panelRef.current
    const scroller = scrollerRef.current
    if (!panel || !scroller) return

    const nextMetrics = {
      scrollLeft: scroller.scrollLeft,
      clientWidth: scroller.clientWidth,
      scrollWidth: scroller.scrollWidth,
    }

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
    setScrollMetrics(current =>
      current.scrollLeft === nextMetrics.scrollLeft &&
      current.clientWidth === nextMetrics.clientWidth &&
      current.scrollWidth === nextMetrics.scrollWidth
        ? current
        : nextMetrics
    )
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
  }, [displaySlots.length, dockButtonSize])

  useEffect(() => {
    return () => {
      if (clearWidthTimerRef.current !== null) {
        window.clearTimeout(clearWidthTimerRef.current)
        clearWidthTimerRef.current = null
      }
    }
  }, [])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const grid = gridRef.current
    if (!scroller || !grid) return

    let raf = 0
    const scheduleMetricsUpdate = () => {
      cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(updateScrollMetrics)
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
  }, [displaySlots.length, dockButtonSize])

  useEffect(() => {
    if (dragContext !== 'dock' || !hasHorizontalOverflow) return

    const step = () => {
      autoScrollRafRef.current = window.requestAnimationFrame(step)

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
        delta = -Math.max(1, ratio * DOCK_AUTO_SCROLL_MAX_SPEED)
      } else if (pointer.pointerX > rect.right - DOCK_AUTO_SCROLL_EDGE_ZONE) {
        const ratio = Math.min(
          1,
          Math.max(
            0,
            (pointer.pointerX - (rect.right - DOCK_AUTO_SCROLL_EDGE_ZONE)) /
              DOCK_AUTO_SCROLL_EDGE_ZONE
          )
        )
        delta = Math.max(1, ratio * DOCK_AUTO_SCROLL_MAX_SPEED)
      }

      if (Math.abs(delta) < 0.5) return

      const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, scroller.scrollLeft + delta))
      if (Math.abs(nextScrollLeft - scroller.scrollLeft) < 0.5) return

      scroller.scrollLeft = nextScrollLeft
      updateScrollMetrics()
    }

    step()
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

    scroller.scrollLeft += event.deltaY
    updateScrollMetrics()
    event.preventDefault()
  }

  const handleScrollerScroll = () => {
    updateScrollMetrics()
    if (!hasHorizontalOverflow) return
    if (dragContext === 'dock') {
      onDockAutoScroll()
    }
  }

  const indicatorThumbWidth = hasHorizontalOverflow
    ? Math.max(
        DOCK_INDICATOR_MIN_WIDTH,
        (scrollMetrics.clientWidth * scrollMetrics.clientWidth) /
          Math.max(scrollMetrics.scrollWidth, 1)
      )
    : 0
  const indicatorTrackWidth = scrollMetrics.clientWidth
  const indicatorMaxOffset = Math.max(0, indicatorTrackWidth - indicatorThumbWidth)
  const indicatorOffset =
    hasHorizontalOverflow && scrollMetrics.scrollWidth > scrollMetrics.clientWidth
      ? (scrollMetrics.scrollLeft / (scrollMetrics.scrollWidth - scrollMetrics.clientWidth)) *
        indicatorMaxOffset
      : 0

  const scrollToIndicatorPointer = (clientX: number, thumbGrabOffset: number) => {
    const scroller = scrollerRef.current
    const track = indicatorTrackRef.current
    if (!scroller || !track || !hasHorizontalOverflow) return

    const trackRect = track.getBoundingClientRect()
    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
    if (maxScrollLeft <= 0) return

    const maxThumbOffset = Math.max(0, trackRect.width - indicatorThumbWidth)
    const rawThumbOffset = clientX - trackRect.left - thumbGrabOffset
    const clampedThumbOffset = Math.max(0, Math.min(maxThumbOffset, rawThumbOffset))
    const ratio = maxThumbOffset > 0 ? clampedThumbOffset / maxThumbOffset : 0

    scroller.scrollLeft = ratio * maxScrollLeft
    updateScrollMetrics()
  }

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = indicatorDragRef.current
      if (!current) return
      if (event.pointerId !== current.pointerId) return

      event.preventDefault()
      scrollToIndicatorPointer(event.clientX, current.thumbGrabOffset)
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
  }, [hasHorizontalOverflow, indicatorThumbWidth])

  const beginIndicatorDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    thumbGrabOffset: number
  ) => {
    if (!hasHorizontalOverflow) return

    event.preventDefault()
    event.stopPropagation()
    indicatorDragRef.current = {
      pointerId: event.pointerId,
      thumbGrabOffset,
    }
    setIsIndicatorDragging(true)
    scrollToIndicatorPointer(event.clientX, thumbGrabOffset)
  }

  const handleIndicatorTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    beginIndicatorDrag(event, indicatorThumbWidth / 2)
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
        className="relative overflow-hidden rounded-[28px] border border-white/16 bg-black/24 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition-[width] duration-[220ms]"
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
                              selectionMode
                                ? 'pointer-events-none'
                                : 'hover:-translate-y-0.5 active:translate-y-0'
                            }`}
                            style={{ width: dockButtonSize, height: dockButtonSize }}
                            onClick={event => {
                              event.stopPropagation()
                              if (selectionMode) return
                              if (item.kind === 'icon') {
                                onLaunchIcon(item.icon.path)
                                return
                              }
                              onOpenFolder(item.id)
                            }}
                          >
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
                                      className="icon-image rounded-xl bg-white/12"
                                      style={{ width: iconImageSize, height: iconImageSize }}
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>
                                <FolderCreatePreview
                                  active={folderPreview}
                                  icon={item.icon}
                                  imgSize={iconImageSize}
                                  reorderAnimationMs={220}
                                />
                              </>
                            ) : (
                              <div
                                className="flex items-center justify-center transition-opacity duration-150"
                                style={{ width: dockButtonSize, height: dockButtonSize }}
                              >
                                <FolderIconVisual
                                  icons={item.children.map(child => child.icon)}
                                  imgSize={iconImageSize}
                                  expanded={folderPreview}
                                />
                              </div>
                            )}
                          </button>
                        </div>
                      </ContextMenuTrigger>

                      {!selectionMode ? (
                        <ContextMenuContent
                          data-dock-menu="true"
                          className="w-44 rounded-2xl border-white/15 bg-black/90 p-1.5 text-white shadow-2xl backdrop-blur-xl"
                        >
                          <ContextMenuItem
                            className="rounded-xl px-3 py-2 text-white/85 focus:bg-white/12 focus:text-white"
                            onSelect={() => {
                              if (item.kind === 'icon') {
                                onLaunchIcon(item.icon.path)
                                return
                              }
                              onOpenFolder(item.id)
                            }}
                          >
                            {MENU_OPEN_LABEL}
                          </ContextMenuItem>
                          <ContextMenuItem
                            className="rounded-xl px-3 py-2 text-red-200 focus:bg-red-500/20 focus:text-red-100"
                            onSelect={() => {
                              onRemoveItem(id)
                            }}
                          >
                            {MENU_REMOVE_LABEL}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      ) : null}
                    </ContextMenu>
                  ) : (
                    <div
                      className={`pointer-events-none flex items-center justify-center rounded-[18px] border border-dashed transition ${
                        hasVisibleItems
                          ? 'border-white/18 bg-white/[0.04]'
                          : 'border-white/24 bg-white/[0.06]'
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
                className={`absolute top-1/2 h-[5px] -translate-y-1/2 rounded-full transition-[width,transform,opacity,background-color,box-shadow] duration-150 ${
                  isIndicatorDragging
                    ? 'cursor-grabbing bg-white/55 opacity-100 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
                    : 'cursor-grab bg-white/36 opacity-85 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] group-hover/dock-scrollbar:bg-white/48 group-hover/dock-scrollbar:opacity-100'
                }`}
                style={{
                  width: `${indicatorThumbWidth}px`,
                  transform: `translate3d(${indicatorOffset}px, -50%, 0px)`,
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
