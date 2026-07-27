import {
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useReducedMotion } from 'framer-motion'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import { activateDragPointerCapture, releaseDragPointerCapture } from '../hooks/dragPointerCapture'
import type { GridItem } from '../model'
import { getGridItemSpan } from '../model'
import type { ScrollGridSection } from '../views/scrollableOuterGridTypes'
import {
  buildScrollGroupEntries,
  moveScrollItemRelative,
  resolveScrollDropPosition,
  SCROLL_PREVIEW_REORDER_DWELL_MS,
  SCROLL_PREVIEW_REORDER_LOCK_MS,
  type ScrollDropPosition,
} from './scrollGroupLayout'

interface LogicalGridHit {
  entry: PageAnchorEntry
  rect: { left: number; top: number; width: number; height: number }
}

interface GridItemPosition {
  left: number
  top: number
}

interface PointerDragSession {
  pointerId: number
  pointerType: string
  activeId: string
  sourceNode: HTMLDivElement
  sourceRect: DOMRect | null
  overlayNode: HTMLDivElement | null
  started: boolean
  startPoint: { x: number; y: number }
  latestPoint: { x: number; y: number }
  activationTime: number
  gridRect: DOMRect | null
  containerRect: DOMRect | null
  startScrollTop: number
}

const POINTER_DRAG_DISTANCE = 4
const TOUCH_DRAG_DELAY_MS = 200
const POINTER_COLLISION_INTERVAL_MS = 40
const EDGE_SCROLL_THRESHOLD_PX = 72
const EDGE_SCROLL_MAX_SPEED_PX = 12

interface UseScrollableOuterGridDragWorkflowParams {
  containerRef: MutableRefObject<HTMLDivElement | null>
  activeSection: ScrollGridSection | null
  committedEntries: PageAnchorEntry[]
  committedItemIds: string[]
  activeItemById: Map<string, GridItem>
  layoutColumns: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  selectionMode: boolean
  externalGridFlipPositionsRef: MutableRefObject<Map<string, GridItemPosition> | null>
  reorderAnimationMs: number
  onCommitItemOrder: (groupId: string, itemIds: string[]) => void
  onMoveItemToGroup: (itemId: string, targetGroupId: string) => void
  onMoveItemToDock: (itemId: string, targetIndex: number) => void
  onMergeItems: (sourceId: string, targetId: string) => void
  onTileClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
}

export function useScrollableOuterGridDragWorkflow({
  containerRef,
  activeSection,
  committedEntries,
  committedItemIds,
  activeItemById,
  layoutColumns,
  itemWidth,
  itemHeight,
  gridGap,
  selectionMode,
  externalGridFlipPositionsRef,
  reorderAnimationMs,
  onCommitItemOrder,
  onMoveItemToGroup,
  onMoveItemToDock,
  onMergeItems,
  onTileClickCapture,
}: UseScrollableOuterGridDragWorkflowParams) {
  const itemDragDidMoveRef = useRef(false)
  const mergeHoverRef = useRef<{ targetId: string } | null>(null)
  const mergeTimerRef = useRef<number | null>(null)
  const layoutSettleTimerRef = useRef<number | null>(null)
  const previewOrderRef = useRef<string[] | null>(null)
  const lastOverIdRef = useRef<string | null>(null)
  const lastDropPositionRef = useRef<ScrollDropPosition | null>(null)
  const previewShiftLockUntilRef = useRef(0)
  const previewShiftTimerRef = useRef<number | null>(null)
  const pendingPreviewShiftRef = useRef<{
    activeId: string
    overId: string
    position: Exclude<ScrollDropPosition, 'middle'>
  } | null>(null)
  const lastGridHitPointRef = useRef<{ x: number; y: number } | null>(null)
  const lastGridHitIdRef = useRef<string | null>(null)
  const gridElementRef = useRef<HTMLDivElement | null>(null)
  const gridItemRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingGridFlipRef = useRef<Map<string, GridItemPosition> | null>(null)
  const gridFlipAnimationsRef = useRef(new Map<string, Animation>())
  const pointerDragSessionRef = useRef<PointerDragSession | null>(null)
  const pointerOverlayFrameRef = useRef<number | null>(null)
  const pointerCollisionTimerRef = useRef<number | null>(null)
  const pointerLastCollisionAtRef = useRef(0)
  const edgeScrollFrameRef = useRef<number | null>(null)
  const edgeScrollSpeedRef = useRef(0)
  const cancelPointerDragRef = useRef<() => void>(() => undefined)
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [activeDraggedItemId, setActiveDraggedItemId] = useState<string | null>(null)
  const [keyboardDraggedItemId, setKeyboardDraggedItemId] = useState<string | null>(null)
  const [previewItemIds, setPreviewItemIds] = useState<string[] | null>(null)
  const [layoutMotionActive, setLayoutMotionActive] = useState(false)
  const reducedMotion = useReducedMotion()
  const itemSensors = useSensors(
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const entries = useMemo(() => {
    if (!previewItemIds) return committedEntries
    const previewEntries = buildScrollGroupEntries(previewItemIds, activeItemById, layoutColumns)
    const activePlaceholder = activeDraggedItemId
      ? previewEntries.filter(entry => entry.id === activeDraggedItemId)
      : []
    return activePlaceholder.length > 0
      ? buildScrollGroupEntries(previewItemIds, activeItemById, layoutColumns, activePlaceholder)
      : previewEntries
  }, [activeDraggedItemId, activeItemById, committedEntries, layoutColumns, previewItemIds])
  const entriesRef = useRef(entries)
  const keyboardDraggedItem = keyboardDraggedItemId
    ? (activeItemById.get(keyboardDraggedItemId) ?? null)
    : null
  const keyboardDraggedSpan = keyboardDraggedItem ? getGridItemSpan(keyboardDraggedItem) : null

  useLayoutEffect(() => {
    entriesRef.current = entries
  }, [entries])

  const resolveGridEntryAtPoint = (
    point: { x: number; y: number },
    dragRect: { left: number; top: number; width: number; height: number } | null,
    activeId: string,
    cachedGridRect?: { left: number; top: number }
  ): LogicalGridHit | null => {
    const grid = gridElementRef.current
    if (!grid) return null

    const rect = cachedGridRect ?? grid.getBoundingClientRect()
    const currentEntries = entriesRef.current
    const strideX = itemWidth + gridGap
    const strideY = itemHeight + gridGap
    const getEntryRect = (entry: PageAnchorEntry) => ({
      left: rect.left + entry.col * strideX,
      top: rect.top + entry.row * strideY,
      width: entry.span.cols * itemWidth + Math.max(0, entry.span.cols - 1) * gridGap,
      height: entry.span.rows * itemHeight + Math.max(0, entry.span.rows - 1) * gridGap,
    })
    const overlapRate = (
      first: { left: number; top: number; width: number; height: number },
      second: { left: number; top: number; width: number; height: number }
    ) => {
      const overlapWidth = Math.max(
        0,
        Math.min(first.left + first.width, second.left + second.width) -
          Math.max(first.left, second.left)
      )
      const overlapHeight = Math.max(
        0,
        Math.min(first.top + first.height, second.top + second.height) -
          Math.max(first.top, second.top)
      )
      const overlapArea = overlapWidth * overlapHeight
      if (overlapArea <= 0) return 0
      return Math.max(
        overlapArea / Math.max(1, first.width * first.height),
        overlapArea / Math.max(1, second.width * second.height)
      )
    }
    const cachedPoint = lastGridHitPointRef.current
    const cachedId = lastGridHitIdRef.current
    if (cachedPoint && cachedId) {
      const movedX = point.x - cachedPoint.x
      const movedY = point.y - cachedPoint.y
      if (movedX * movedX + movedY * movedY < 100) {
        const cachedEntry = currentEntries.find(entry => entry.id === cachedId)
        if (cachedEntry) return { entry: cachedEntry, rect: getEntryRect(cachedEntry) }
      }
    }

    const localX = point.x - rect.left
    const localY = point.y - rect.top
    if (localX < 0 || localY < 0) return null
    const col = Math.floor(localX / strideX)
    const row = Math.floor(localY / strideY)
    const withinX = localX % strideX
    const withinY = localY % strideY
    if (col < 0 || col >= layoutColumns) return null
    const pointInsideCell = withinX <= itemWidth && withinY <= itemHeight
    const cellEntry = pointInsideCell
      ? currentEntries.find(
          item =>
            row >= item.row &&
            row < item.row + item.span.rows &&
            col >= item.col &&
            col < item.col + item.span.cols
        )
      : null
    if (cellEntry?.id === activeId) {
      lastGridHitPointRef.current = point
      lastGridHitIdRef.current = activeId
      return { entry: cellEntry, rect: getEntryRect(cellEntry) }
    }
    const stickyId = lastGridHitIdRef.current
    if (!cellEntry && dragRect && stickyId && stickyId !== activeId) {
      const stickyEntry = currentEntries.find(entry => entry.id === stickyId)
      if (stickyEntry && overlapRate(dragRect, getEntryRect(stickyEntry)) > 0.1) {
        lastGridHitPointRef.current = point
        return { entry: stickyEntry, rect: getEntryRect(stickyEntry) }
      }
    }

    let resolvedEntry: PageAnchorEntry | null = null
    if (dragRect) {
      const dragCenterX = dragRect.left + dragRect.width / 2
      const dragCenterY = dragRect.top + dragRect.height / 2
      const nearest = currentEntries
        .filter(entry => entry.id !== activeId)
        .reduce<{ entry: PageAnchorEntry; distance: number } | null>((best, entry) => {
          const entryRect = getEntryRect(entry)
          const entryCenterX = entryRect.left + entryRect.width / 2
          const entryCenterY = entryRect.top + entryRect.height / 2
          const distance = Math.hypot(dragCenterX - entryCenterX, dragCenterY - entryCenterY)
          return best === null || distance < best.distance ? { entry, distance } : best
        }, null)
      if (nearest && overlapRate(dragRect, getEntryRect(nearest.entry)) > 0.1) {
        resolvedEntry = nearest.entry
      }
    }
    if (
      !resolvedEntry &&
      cellEntry &&
      (cellEntry.id === activeId ||
        !dragRect ||
        overlapRate(dragRect, getEntryRect(cellEntry)) > 0.1)
    ) {
      resolvedEntry = cellEntry
    }
    if (!resolvedEntry) return null
    lastGridHitPointRef.current = point
    lastGridHitIdRef.current = resolvedEntry.id
    return { entry: resolvedEntry, rect: getEntryRect(resolvedEntry) }
  }

  const clearMergeIntent = () => {
    if (mergeTimerRef.current !== null) {
      window.clearTimeout(mergeTimerRef.current)
      mergeTimerRef.current = null
    }
    mergeHoverRef.current = null
    setMergeTargetId(null)
  }
  const scheduleMergeIntent = (targetId: string) => {
    if (mergeHoverRef.current?.targetId === targetId) return
    clearMergeIntent()
    mergeHoverRef.current = { targetId }
    mergeTimerRef.current = window.setTimeout(() => {
      if (mergeHoverRef.current?.targetId === targetId) setMergeTargetId(targetId)
      mergeTimerRef.current = null
    }, 520)
  }
  const clearPreviewShiftTimer = () => {
    if (previewShiftTimerRef.current !== null) {
      window.clearTimeout(previewShiftTimerRef.current)
      previewShiftTimerRef.current = null
    }
    pendingPreviewShiftRef.current = null
  }
  const captureGridItemPositions = () => {
    const previousPositions = new Map<string, GridItemPosition>()
    gridItemRefs.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect()
      previousPositions.set(id, { left: rect.left, top: rect.top })
    })
    gridFlipAnimationsRef.current.forEach(animation => animation.cancel())
    gridFlipAnimationsRef.current.clear()
    pendingGridFlipRef.current = previousPositions
  }
  const commitPreviewOrder = (
    activeId: string,
    overId: string,
    position: Exclude<ScrollDropPosition, 'middle'>,
    lockDuration = SCROLL_PREVIEW_REORDER_LOCK_MS
  ) => {
    if (
      activeId === overId ||
      (lastOverIdRef.current === overId && lastDropPositionRef.current === position)
    ) {
      return
    }
    if (lockDuration > 0 && performance.now() < previewShiftLockUntilRef.current) return
    const currentOrder = previewOrderRef.current
    if (!currentOrder) return
    const nextOrder = moveScrollItemRelative(currentOrder, activeId, overId, position)
    lastOverIdRef.current = overId
    lastDropPositionRef.current = position
    if (nextOrder === currentOrder) return
    captureGridItemPositions()
    previewOrderRef.current = nextOrder
    previewShiftLockUntilRef.current = performance.now() + lockDuration
    setPreviewItemIds(nextOrder)
  }
  const schedulePreviewOrder = (
    activeId: string,
    overId: string,
    position: Exclude<ScrollDropPosition, 'middle'>
  ) => {
    if (
      activeId === overId ||
      (lastOverIdRef.current === overId && lastDropPositionRef.current === position)
    ) {
      clearPreviewShiftTimer()
      return
    }
    const pending = pendingPreviewShiftRef.current
    if (
      pending?.activeId === activeId &&
      pending.overId === overId &&
      pending.position === position
    ) {
      return
    }
    clearPreviewShiftTimer()
    pendingPreviewShiftRef.current = { activeId, overId, position }
    previewShiftTimerRef.current = window.setTimeout(() => {
      const queued = pendingPreviewShiftRef.current
      previewShiftTimerRef.current = null
      pendingPreviewShiftRef.current = null
      if (queued) commitPreviewOrder(queued.activeId, queued.overId, queued.position)
    }, SCROLL_PREVIEW_REORDER_DWELL_MS)
  }

  useLayoutEffect(() => {
    const internalPositions = pendingGridFlipRef.current
    const externalPositions = externalGridFlipPositionsRef.current
    const previousPositions = internalPositions ?? externalPositions
    pendingGridFlipRef.current = null
    externalGridFlipPositionsRef.current = null
    if (!previousPositions || reducedMotion) return
    if (!internalPositions && externalPositions) {
      gridFlipAnimationsRef.current.forEach(animation => animation.cancel())
      gridFlipAnimationsRef.current.clear()
    }
    const movedItems: Array<{
      id: string
      node: HTMLDivElement
      deltaX: number
      deltaY: number
    }> = []
    previousPositions.forEach((previous, id) => {
      if (id === activeDraggedItemId) return
      const node = gridItemRefs.current.get(id)
      if (!node) return
      const next = node.getBoundingClientRect()
      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
      movedItems.push({ id, node, deltaX, deltaY })
    })
    movedItems.forEach(({ id, node, deltaX, deltaY }) => {
      const animation = node.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: reorderAnimationMs, easing: 'ease' }
      )
      const clearAnimation = () => {
        if (gridFlipAnimationsRef.current.get(id) === animation) {
          gridFlipAnimationsRef.current.delete(id)
        }
      }
      animation.onfinish = clearAnimation
      animation.oncancel = clearAnimation
      gridFlipAnimationsRef.current.set(id, animation)
    })
  }, [
    activeDraggedItemId,
    entries,
    externalGridFlipPositionsRef,
    reducedMotion,
    reorderAnimationMs,
  ])

  const startItemDrag = (activeId: string) => {
    const initialOrder = committedItemIds.filter(id => activeItemById.has(id))
    itemDragDidMoveRef.current = true
    if (layoutSettleTimerRef.current !== null) {
      window.clearTimeout(layoutSettleTimerRef.current)
      layoutSettleTimerRef.current = null
    }
    previewOrderRef.current = initialOrder
    lastOverIdRef.current = activeId
    lastDropPositionRef.current = null
    previewShiftLockUntilRef.current = 0
    lastGridHitPointRef.current = null
    lastGridHitIdRef.current = null
    setActiveDraggedItemId(activeId)
    setPreviewItemIds(initialOrder)
    setLayoutMotionActive(true)
    clearMergeIntent()
  }
  const finishItemDrag = () => {
    clearPreviewShiftTimer()
    setHoveredGroupId(null)
    clearMergeIntent()
    previewOrderRef.current = null
    lastOverIdRef.current = null
    lastDropPositionRef.current = null
    previewShiftLockUntilRef.current = 0
    lastGridHitPointRef.current = null
    lastGridHitIdRef.current = null
    setPreviewItemIds(null)
    setActiveDraggedItemId(null)
    layoutSettleTimerRef.current = window.setTimeout(() => {
      setLayoutMotionActive(false)
      layoutSettleTimerRef.current = null
    }, 280)
    window.setTimeout(() => {
      itemDragDidMoveRef.current = false
    }, 0)
  }
  const getPointerDragRect = (session: PointerDragSession) => {
    if (!session.sourceRect) return null
    const deltaX = session.latestPoint.x - session.startPoint.x
    const deltaY = session.latestPoint.y - session.startPoint.y
    return {
      left: session.sourceRect.left + deltaX,
      top: session.sourceRect.top + deltaY,
      width: session.sourceRect.width,
      height: session.sourceRect.height,
    }
  }
  const getPointerGridRect = (session: PointerDragSession) => {
    if (!session.gridRect) return undefined
    const scrollDelta =
      (containerRef.current?.scrollTop ?? session.startScrollTop) - session.startScrollTop
    return { left: session.gridRect.left, top: session.gridRect.top - scrollDelta }
  }
  const getPointerGridHitPoint = (
    session: PointerDragSession,
    dragRect: { left: number; top: number; width: number; height: number } | null
  ) => {
    const activeItem = activeItemById.get(session.activeId)
    const activeSpan = activeItem ? getGridItemSpan(activeItem) : null
    if (dragRect && activeSpan?.cols === 1 && activeSpan.rows === 1) {
      return { x: dragRect.left + dragRect.width / 2, y: dragRect.top + dragRect.height / 2 }
    }
    return session.latestPoint
  }
  const resetDragTargetTracking = () => {
    clearPreviewShiftTimer()
    lastOverIdRef.current = null
    lastDropPositionRef.current = null
    lastGridHitPointRef.current = null
    lastGridHitIdRef.current = null
    clearMergeIntent()
  }
  const getVisibleGridHitRect = (hit: LogicalGridHit) => {
    const node = gridItemRefs.current.get(hit.entry.id)
    if (!node) return hit.rect
    const rect = node.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }
  const processPointerDragMove = (session: PointerDragSession) => {
    const { activeId, latestPoint: point } = session
    const target = document.elementFromPoint(point.x, point.y) as HTMLElement | null
    const groupId = target?.closest<HTMLElement>('[data-scroll-group-id]')?.dataset.scrollGroupId
    setHoveredGroupId(current => (current === (groupId ?? null) ? current : (groupId ?? null)))
    if (groupId || target?.closest('[data-dock-slot]')) {
      resetDragTargetTracking()
      return
    }
    const dragRect = getPointerDragRect(session)
    const logicalHit = resolveGridEntryAtPoint(
      getPointerGridHitPoint(session, dragRect),
      dragRect,
      activeId,
      getPointerGridRect(session)
    )
    const overId = logicalHit?.entry.id ?? null
    if (!logicalHit || !overId || overId === activeId) {
      clearPreviewShiftTimer()
      clearMergeIntent()
      return
    }
    const sourceItem = activeItemById.get(activeId)
    const targetItem = activeItemById.get(overId)
    const overRect = getVisibleGridHitRect(logicalHit)
    const mergePoint = dragRect
      ? { x: dragRect.left + dragRect.width / 2, y: dragRect.top + dragRect.height / 2 }
      : point
    const mergeAllowed =
      sourceItem?.kind === 'icon' &&
      Boolean(targetItem && (targetItem.kind === 'icon' || targetItem.kind === 'folder'))
    const dropPosition = resolveScrollDropPosition(mergePoint, overRect, mergeAllowed)
    if (dropPosition === 'middle') {
      clearPreviewShiftTimer()
      scheduleMergeIntent(overId)
    } else {
      clearMergeIntent()
      schedulePreviewOrder(activeId, overId, dropPosition)
    }
  }
  const queuePointerCollision = () => {
    const session = pointerDragSessionRef.current
    if (!session?.started || pointerCollisionTimerRef.current !== null) return
    const elapsed = performance.now() - pointerLastCollisionAtRef.current
    const delay = Math.max(0, POINTER_COLLISION_INTERVAL_MS - elapsed)
    pointerCollisionTimerRef.current = window.setTimeout(() => {
      pointerCollisionTimerRef.current = null
      pointerLastCollisionAtRef.current = performance.now()
      const currentSession = pointerDragSessionRef.current
      if (currentSession?.started) processPointerDragMove(currentSession)
    }, delay)
  }
  const schedulePointerOverlayUpdate = () => {
    if (pointerOverlayFrameRef.current !== null) return
    pointerOverlayFrameRef.current = window.requestAnimationFrame(() => {
      pointerOverlayFrameRef.current = null
      const session = pointerDragSessionRef.current
      if (!session?.started || !session.overlayNode) return
      const deltaX = session.latestPoint.x - session.startPoint.x
      const deltaY = session.latestPoint.y - session.startPoint.y
      session.overlayNode.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
    })
  }
  const stopEdgeScroll = () => {
    edgeScrollSpeedRef.current = 0
    if (edgeScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(edgeScrollFrameRef.current)
      edgeScrollFrameRef.current = null
    }
  }
  const ensureEdgeScrollFrame = () => {
    if (edgeScrollFrameRef.current !== null || edgeScrollSpeedRef.current === 0) return
    const step = () => {
      edgeScrollFrameRef.current = null
      const session = pointerDragSessionRef.current
      const container = containerRef.current
      const speed = edgeScrollSpeedRef.current
      if (!session?.started || !container || speed === 0) return
      const previousScrollTop = container.scrollTop
      container.scrollTop += speed
      if (container.scrollTop !== previousScrollTop) queuePointerCollision()
      if (
        container.scrollTop === previousScrollTop ||
        (speed < 0 && container.scrollTop <= 0) ||
        (speed > 0 && container.scrollTop + container.clientHeight >= container.scrollHeight)
      ) {
        stopEdgeScroll()
        return
      }
      edgeScrollFrameRef.current = window.requestAnimationFrame(step)
    }
    edgeScrollFrameRef.current = window.requestAnimationFrame(step)
  }
  const updateEdgeScroll = (session: PointerDragSession) => {
    const container = containerRef.current
    const rect = session.containerRect
    if (!container || !rect || container.scrollHeight <= container.clientHeight) {
      stopEdgeScroll()
      return
    }
    const { y } = session.latestPoint
    let speed = 0
    if (y < rect.top + EDGE_SCROLL_THRESHOLD_PX) {
      const ratio = Math.min(
        1,
        (rect.top + EDGE_SCROLL_THRESHOLD_PX - y) / EDGE_SCROLL_THRESHOLD_PX
      )
      speed = -Math.max(1, Math.round(EDGE_SCROLL_MAX_SPEED_PX * ratio))
    } else if (y > rect.bottom - EDGE_SCROLL_THRESHOLD_PX) {
      const ratio = Math.min(
        1,
        (y - (rect.bottom - EDGE_SCROLL_THRESHOLD_PX)) / EDGE_SCROLL_THRESHOLD_PX
      )
      speed = Math.max(1, Math.round(EDGE_SCROLL_MAX_SPEED_PX * ratio))
    }
    edgeScrollSpeedRef.current = speed
    if (speed === 0) stopEdgeScroll()
    else ensureEdgeScrollFrame()
  }
  const activatePointerDrag = (session: PointerDragSession) => {
    activateDragPointerCapture(gridElementRef.current, session.pointerId)
    const sourceRect = session.sourceNode.getBoundingClientRect()
    const overlayNode = session.sourceNode.cloneNode(true) as HTMLDivElement
    overlayNode.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
    overlayNode.setAttribute('aria-hidden', 'true')
    overlayNode.setAttribute('data-scroll-dragging', 'true')
    overlayNode.classList.add('cursor-grabbing')
    Object.assign(overlayNode.style, {
      position: 'fixed',
      left: `${sourceRect.left}px`,
      top: `${sourceRect.top}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
      margin: '0',
      opacity: '1',
      pointerEvents: 'none',
      transform: 'translate3d(0, 0, 0)',
      transition: 'none',
      willChange: 'transform',
      zIndex: '240',
    })
    document.body.appendChild(overlayNode)
    session.sourceRect = sourceRect
    session.gridRect = gridElementRef.current?.getBoundingClientRect() ?? null
    session.containerRect = containerRef.current?.getBoundingClientRect() ?? null
    session.startScrollTop = containerRef.current?.scrollTop ?? 0
    session.overlayNode = overlayNode
    session.started = true
    session.sourceNode.style.opacity = '0'
    pointerLastCollisionAtRef.current = 0
    startItemDrag(session.activeId)
    schedulePointerOverlayUpdate()
    queuePointerCollision()
  }
  const cleanupPointerDrag = () => {
    const session = pointerDragSessionRef.current
    pointerDragSessionRef.current = null
    if (pointerOverlayFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerOverlayFrameRef.current)
      pointerOverlayFrameRef.current = null
    }
    if (pointerCollisionTimerRef.current !== null) {
      window.clearTimeout(pointerCollisionTimerRef.current)
      pointerCollisionTimerRef.current = null
    }
    stopEdgeScroll()
    session?.overlayNode?.remove()
    if (session?.sourceNode) session.sourceNode.style.opacity = ''
    if (session) releaseDragPointerCapture(gridElementRef.current, session.pointerId)
  }
  const completePointerDrag = (session: PointerDragSession) => {
    const { activeId, latestPoint: point } = session
    const dragRect = getPointerDragRect(session)
    const logicalDrop = resolveGridEntryAtPoint(
      getPointerGridHitPoint(session, dragRect),
      dragRect,
      activeId,
      getPointerGridRect(session)
    )
    const logicalDropItem = logicalDrop ? activeItemById.get(logicalDrop.entry.id) : null
    const mergePoint = dragRect
      ? { x: dragRect.left + dragRect.width / 2, y: dragRect.top + dragRect.height / 2 }
      : point
    const logicalDropMergeAllowed =
      logicalDrop !== null &&
      activeItemById.get(activeId)?.kind === 'icon' &&
      Boolean(
        logicalDropItem && (logicalDropItem.kind === 'icon' || logicalDropItem.kind === 'folder')
      )
    const logicalDropPosition = logicalDrop
      ? resolveScrollDropPosition(
          mergePoint,
          getVisibleGridHitRect(logicalDrop),
          logicalDropMergeAllowed
        )
      : null
    const target = document.elementFromPoint(point.x, point.y) as HTMLElement | null
    const targetGroupId =
      target?.closest<HTMLElement>('[data-scroll-group-id]')?.dataset.scrollGroupId
    const dockSlot = target?.closest<HTMLElement>('[data-dock-slot]')
    const droppedOnGrid = Boolean(target?.closest('[data-scroll-grid-inner]'))
    const mergeTarget = logicalDropPosition === 'middle' ? (logicalDrop?.entry.id ?? null) : null
    const shouldMerge = mergeTarget !== null && mergeTarget !== activeId
    let finalPreviewOrder = previewOrderRef.current
    if (
      droppedOnGrid &&
      !shouldMerge &&
      logicalDrop &&
      logicalDrop.entry.id !== activeId &&
      logicalDropPosition !== null &&
      logicalDropPosition !== 'middle' &&
      (lastOverIdRef.current !== logicalDrop.entry.id ||
        lastDropPositionRef.current !== logicalDropPosition) &&
      finalPreviewOrder
    ) {
      finalPreviewOrder = moveScrollItemRelative(
        finalPreviewOrder,
        activeId,
        logicalDrop.entry.id,
        logicalDropPosition
      )
      previewOrderRef.current = finalPreviewOrder
    }
    captureGridItemPositions()
    cleanupPointerDrag()
    finishItemDrag()
    if (targetGroupId) {
      if (targetGroupId !== activeSection?.groupId) onMoveItemToGroup(activeId, targetGroupId)
      return
    }
    if (dockSlot) {
      const dockSlots = Array.from(document.querySelectorAll<HTMLElement>('[data-dock-slot]'))
      onMoveItemToDock(activeId, Math.max(0, dockSlots.indexOf(dockSlot)))
      return
    }
    if (shouldMerge && mergeTarget) {
      onMergeItems(activeId, mergeTarget)
      return
    }
    if (droppedOnGrid && activeSection && finalPreviewOrder) {
      onCommitItemOrder(activeSection.groupId, finalPreviewOrder)
    }
  }

  const handleGridPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (selectionMode || event.button !== 0 || !event.isPrimary || pointerDragSessionRef.current) {
      return
    }
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable="true"], [data-no-drag]')) return
    const sourceNode = target.closest<HTMLDivElement>('[data-scroll-sortable-id]')
    if (!sourceNode || !event.currentTarget.contains(sourceNode)) return
    const activeId = sourceNode.dataset.scrollSortableId
    if (!activeId || !activeItemById.has(activeId)) return
    pointerDragSessionRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      activeId,
      sourceNode,
      sourceRect: null,
      overlayNode: null,
      started: false,
      startPoint: { x: event.clientX, y: event.clientY },
      latestPoint: { x: event.clientX, y: event.clientY },
      activationTime: performance.now() + (event.pointerType === 'touch' ? TOUCH_DRAG_DELAY_MS : 0),
      gridRect: null,
      containerRect: null,
      startScrollTop: containerRef.current?.scrollTop ?? 0,
    }
  }
  const handleGridPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerDragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    session.latestPoint = { x: event.clientX, y: event.clientY }
    if (!session.started) {
      const distance = Math.max(
        Math.abs(session.latestPoint.x - session.startPoint.x),
        Math.abs(session.latestPoint.y - session.startPoint.y)
      )
      if (distance <= POINTER_DRAG_DISTANCE) return
      if (session.pointerType === 'touch' && performance.now() < session.activationTime) {
        cleanupPointerDrag()
        return
      }
      activatePointerDrag(session)
    }
    event.preventDefault()
    schedulePointerOverlayUpdate()
    updateEdgeScroll(session)
    queuePointerCollision()
  }
  const handleGridPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerDragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    session.latestPoint = { x: event.clientX, y: event.clientY }
    if (session.started) {
      event.preventDefault()
      completePointerDrag(session)
    } else cleanupPointerDrag()
  }
  const cancelPointerDrag = () => {
    const session = pointerDragSessionRef.current
    if (!session) return
    if (session.started) {
      captureGridItemPositions()
      cleanupPointerDrag()
      finishItemDrag()
    } else cleanupPointerDrag()
  }
  const handleGridPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerDragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    cancelPointerDrag()
  }
  const handleKeyboardItemDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id)
    setKeyboardDraggedItemId(activeId)
    startItemDrag(activeId)
  }
  const handleKeyboardItemDragMove = (event: DragMoveEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId || overId === activeId) return
    const currentOrder = previewOrderRef.current
    if (!currentOrder) return
    const sourceIndex = currentOrder.indexOf(activeId)
    const targetIndex = currentOrder.indexOf(overId)
    if (sourceIndex < 0 || targetIndex < 0) return
    commitPreviewOrder(activeId, overId, sourceIndex < targetIndex ? 'after' : 'before', 0)
  }
  const handleKeyboardItemDragEnd = (_event: DragEndEvent) => {
    const finalPreviewOrder = previewOrderRef.current
    captureGridItemPositions()
    setKeyboardDraggedItemId(null)
    finishItemDrag()
    if (activeSection && finalPreviewOrder) {
      onCommitItemOrder(activeSection.groupId, finalPreviewOrder)
    }
  }
  const handleKeyboardItemDragCancel = (_event: DragCancelEvent) => {
    captureGridItemPositions()
    setKeyboardDraggedItemId(null)
    finishItemDrag()
  }
  const handleGridClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (itemDragDidMoveRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onTileClickCapture(event)
  }

  useLayoutEffect(() => {
    cancelPointerDragRef.current = cancelPointerDrag
  })
  useEffect(() => {
    const cancelActivePointerDrag = () => cancelPointerDragRef.current()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelActivePointerDrag()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelActivePointerDrag()
    }
    window.addEventListener('blur', cancelActivePointerDrag)
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('blur', cancelActivePointerDrag)
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])
  useEffect(
    () => () => {
      if (mergeTimerRef.current !== null) window.clearTimeout(mergeTimerRef.current)
      if (layoutSettleTimerRef.current !== null) window.clearTimeout(layoutSettleTimerRef.current)
      if (previewShiftTimerRef.current !== null) window.clearTimeout(previewShiftTimerRef.current)
      if (pointerOverlayFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerOverlayFrameRef.current)
      }
      if (pointerCollisionTimerRef.current !== null) {
        window.clearTimeout(pointerCollisionTimerRef.current)
      }
      if (edgeScrollFrameRef.current !== null)
        window.cancelAnimationFrame(edgeScrollFrameRef.current)
      const pointerSession = pointerDragSessionRef.current
      pointerSession?.overlayNode?.remove()
      if (pointerSession?.sourceNode) pointerSession.sourceNode.style.opacity = ''
      pointerDragSessionRef.current = null
      gridFlipAnimationsRef.current.forEach(animation => animation.cancel())
      gridFlipAnimationsRef.current.clear()
    },
    []
  )

  return {
    activeDraggedItemId,
    entries,
    gridElementRef,
    gridItemRefs,
    handleGridClickCapture,
    handleGridPointerCancel,
    handleGridPointerDown,
    handleGridPointerMove,
    handleGridPointerUp,
    handleKeyboardItemDragCancel,
    handleKeyboardItemDragEnd,
    handleKeyboardItemDragMove,
    handleKeyboardItemDragStart,
    hoveredGroupId,
    itemSensors,
    keyboardDraggedItem,
    keyboardDraggedSpan,
    layoutMotionActive,
    mergeTargetId,
  }
}
