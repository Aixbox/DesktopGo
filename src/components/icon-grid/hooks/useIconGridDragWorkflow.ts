import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import type { EvasionDirection, GridItem, IconItem } from '../model'
import { getId } from '../model'
import { DRAG_HOLE_ID, areSlotsEqual, normalizeOuterSlots } from '../domain/slots'
import { moveDragHoleToIndex } from '../domain/evasionPolicy'
import { getFolderChildrenById } from '../domain/folderPolicy'
import { classifyZone } from '../domain/geometry'
import {
  applyOuterEvasionPolicy,
  findHitByMetrics,
  findOuterMaxOverlapHitByMetrics,
  resolveNearestSlotIndexByMetrics,
} from '../domain/dragMovePolicy'
import {
  createDockSlots,
  DOCK_SLOT_SIZE,
  getDockOccupiedCount,
  resolveOuterItemIds,
} from '../domain/dock'
import { OUTER_DRAG_RULES } from '../constants'
import { usePointerDragController } from './usePointerDragController'
import { useEdgeAutoPaging } from './useEdgeAutoPaging'
import { useDragDropCommit } from './useDragDropCommit'
import { resetOuterInteraction } from '../state/dragMachine'
import type {
  DragHit,
  DragState,
  FolderDropFlight,
  OuterOverlapHit,
  PendingDrag,
} from '../state/types'

interface DragWorkflowConfig {
  gridGap: number
  dragEdgeSwitchZone: number
  dragEdgeSwitchMs: number
  dragLongPressMs: number
  dragMoveThreshold: number
  evasionRearmDistance: number
  evasionCooldownMs: number
  reorderAnimationMs: number
}

interface IconConfigLike {
  imgSize: number
}

interface UseIconGridDragWorkflowParams {
  config: DragWorkflowConfig
  selectionMode: boolean
  iconConfig: IconConfigLike
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  folderColumns: number
  folderItemWidth: number
  folderItemHeight: number
  folderOrderLength: number
  itemById: Map<string, GridItem>
  containerRef: MutableRefObject<HTMLDivElement | null>
  gridRef: MutableRefObject<HTMLDivElement | null>
  folderPanelRef: MutableRefObject<HTMLDivElement | null>
  folderGridRef: MutableRefObject<HTMLDivElement | null>
  dockContainerRef: MutableRefObject<HTMLDivElement | null>
  dockGridRef: MutableRefObject<HTMLDivElement | null>
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  folderTileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  dockSlotRefs: MutableRefObject<Map<number, HTMLDivElement>>
  dockItemRefs: MutableRefObject<Map<string, HTMLDivElement>>
  itemsRef: MutableRefObject<GridItem[]>
  setItems: Dispatch<SetStateAction<GridItem[]>>
  outerSlotsRef: MutableRefObject<Array<string | null>>
  dockKeysRef: MutableRefObject<Array<string | null>>
  setOuterSlots: Dispatch<SetStateAction<Array<string | null>>>
  setDockKeys: Dispatch<SetStateAction<Array<string | null>>>
  currentPageRef: MutableRefObject<number>
  setCurrentPage: Dispatch<SetStateAction<number>>
  pageSizeRef: MutableRefObject<number>
  dockCapacity: number
  setOpenFolderId: Dispatch<SetStateAction<string | null>>
}

interface UseIconGridDragWorkflowResult {
  dragState: DragState | null
  dragRef: MutableRefObject<DragState | null>
  folderDropFlight: FolderDropFlight | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  hiddenOuterItemIds: string[]
  frozenOuterOrder: Array<string | null> | null
  handleTilePointerDown: (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => void
  handleFolderTilePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    folderId: string,
    itemId: string
  ) => void
  handleDockItemPointerDown: (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => void
  handleTileClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void
  clearEdgeSwitchTimer: () => void
  clearOuterDragInteractionForPageSwitch: () => void
}

export function useIconGridDragWorkflow({
  config,
  selectionMode,
  iconConfig,
  columns,
  rows,
  itemWidth,
  itemHeight,
  folderColumns,
  folderItemWidth,
  folderItemHeight,
  folderOrderLength,
  itemById,
  containerRef,
  gridRef,
  folderPanelRef,
  folderGridRef,
  dockContainerRef,
  dockGridRef,
  tileRefs,
  folderTileRefs,
  dockSlotRefs,
  dockItemRefs,
  itemsRef,
  setItems,
  outerSlotsRef,
  dockKeysRef,
  setOuterSlots,
  setDockKeys,
  currentPageRef,
  setCurrentPage,
  pageSizeRef,
  dockCapacity,
  setOpenFolderId,
}: UseIconGridDragWorkflowParams): UseIconGridDragWorkflowResult {
  const pendingRef = useRef<PendingDrag | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const beginDragFnRef = useRef<(pending: PendingDrag, x: number, y: number) => void>(
    () => undefined
  )
  const onDragMoveFnRef = useRef<(pointerId: number, x: number, y: number) => void>(() => undefined)
  const finishDragFnRef = useRef<(pointerId: number) => void>(() => undefined)
  const clearPendingFnRef = useRef<() => void>(() => undefined)
  const cancelDragFnRef = useRef<(pointerId: number) => void>(() => undefined)
  const timerRef = useRef<number | null>(null)
  const outerDwellTimerRef = useRef<number | null>(null)
  const outerDwellTargetIdRef = useRef<string | null>(null)
  const suppressClickUntilRef = useRef(0)

  const [dragState, setDragState] = useState<DragState | null>(null)

  useEffect(() => {
    dragRef.current = dragState
  }, [dragState])

  const { clearEdgeSwitchTimer, maybeHandleOuterEdgeSwitch } = useEdgeAutoPaging({
    dragEdgeSwitchZone: config.dragEdgeSwitchZone,
    dragEdgeSwitchMs: config.dragEdgeSwitchMs,
    containerRef,
    dragRef,
    setDragState,
    currentPageRef,
    setCurrentPage,
    pageSizeRef,
  })

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const clearPending = () => {
    pendingRef.current = null
    clearTimer()
    clearOuterDwellTimer()
    clearEdgeSwitchTimer()
  }

  const clearOuterDwellTimer = () => {
    if (outerDwellTimerRef.current !== null) {
      window.clearTimeout(outerDwellTimerRef.current)
      outerDwellTimerRef.current = null
    }
    outerDwellTargetIdRef.current = null
  }

  const collectCenters = (refs: Map<string, HTMLDivElement>) => {
    const centers: Record<string, { x: number; y: number }> = {}
    refs.forEach((node, id) => {
      const rect = node.getBoundingClientRect()
      centers[id] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })
    return centers
  }

  const getFolderMapById = (folderId: string | null, baseItems: GridItem[]) => {
    const map = new Map<string, IconItem>()
    if (!folderId) return map
    getFolderChildrenById(baseItems, folderId).forEach(child => {
      map.set(child.key, child)
    })
    return map
  }

  const resolveAllItemIds = () => itemsRef.current.map(getId)

  const resolveOuterItemIdsForLayout = (dockOrder: Array<string | null> = dockKeysRef.current) =>
    resolveOuterItemIds(resolveAllItemIds(), dockOrder)

  const resolveTopLevelOrder = (context: 'outer' | 'dock'): Array<string | null> =>
    context === 'dock'
      ? createDockSlots(dockKeysRef.current, dockCapacity)
      : normalizeOuterSlots(
          outerSlotsRef.current,
          resolveOuterItemIdsForLayout(),
          pageSizeRef.current
        )

  const resolveTopLevelContextAtPoint = (x: number, y: number): 'outer' | 'dock' => {
    const dockElement = dockContainerRef.current
    if (!dockElement) return 'outer'
    const rect = dockElement.getBoundingClientRect()
    const dockBuffer = 16
    const withinHorizontal = x >= rect.left - dockBuffer && x <= rect.right + dockBuffer
    const withinVertical = y >= rect.top - dockBuffer && y <= rect.bottom + dockBuffer
    return withinHorizontal && withinVertical ? 'dock' : 'outer'
  }

  const resolveDragItemMap = (state: DragState): Map<string, GridItem> => {
    if (state.context === 'folder') {
      const folderMap = getFolderMapById(state.sourceFolderId, itemsRef.current)
      const gridMap = new Map<string, GridItem>()
      folderMap.forEach((item, id) => gridMap.set(id, item))
      return gridMap
    }
    const outerMap = new Map<string, GridItem>()
    itemsRef.current.forEach(item => {
      outerMap.set(getId(item), item)
    })
    return outerMap
  }

  const resolveGridMetrics = (context: 'outer' | 'folder' | 'dock') => {
    if (context === 'folder') {
      return {
        gridElement: folderGridRef.current,
        columns: Math.max(1, folderColumns),
        rows: Math.max(1, Math.ceil(Math.max(1, folderOrderLength) / Math.max(1, folderColumns))),
        itemWidth: folderItemWidth,
        itemHeight: folderItemHeight,
        pageOffset: 0,
      }
    }

    if (context === 'dock') {
      return {
        gridElement: dockGridRef.current,
        columns: Math.max(1, dockCapacity),
        rows: 1,
        itemWidth: DOCK_SLOT_SIZE,
        itemHeight: DOCK_SLOT_SIZE,
        pageOffset: 0,
      }
    }

    return {
      gridElement: gridRef.current,
      columns: Math.max(1, columns),
      rows: Math.max(1, rows),
      itemWidth,
      itemHeight,
      pageOffset: currentPageRef.current * pageSizeRef.current,
    }
  }

  const findHitByContext = (state: DragState, x: number, y: number): DragHit | null => {
    if (state.context === 'dock') {
      const slotEntries = Array.from(dockSlotRefs.current.entries()).sort(([a], [b]) => a - b)
      for (const [index, node] of slotEntries) {
        const rect = node.getBoundingClientRect()
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
        const rawTargetId = state.workingOrder[index]
        const targetId =
          !rawTargetId || rawTargetId === DRAG_HOLE_ID || rawTargetId === state.draggingId
            ? null
            : rawTargetId
        return {
          targetId,
          zone: classifyZone(rect, x, y),
          globalSlotIndex: index,
        }
      }
      return null
    }

    return findHitByMetrics(state, x, y, resolveGridMetrics(state.context), config.gridGap)
  }

  const resolveNearestSlotIndexByContext = (
    state: DragState,
    options?: { allowOutside?: boolean }
  ): number | null => {
    if (state.context === 'dock') {
      const container = dockContainerRef.current
      const slotEntries = Array.from(dockSlotRefs.current.entries()).sort(([a], [b]) => a - b)
      if (slotEntries.length === 0) return null
      if (!options?.allowOutside && container) {
        const rect = container.getBoundingClientRect()
        const dockBuffer = 16
        const withinHorizontal =
          state.pointerX >= rect.left - dockBuffer && state.pointerX <= rect.right + dockBuffer
        const withinVertical =
          state.pointerY >= rect.top - dockBuffer && state.pointerY <= rect.bottom + dockBuffer
        if (!withinHorizontal || !withinVertical) return null
      }

      let nearestIndex = 0
      let nearestDistance = Number.POSITIVE_INFINITY
      slotEntries.forEach(([index, node]) => {
        const rect = node.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const distance =
          Math.abs(state.pointerX - centerX) + Math.abs(state.pointerY - centerY)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = index
        }
      })
      return nearestIndex
    }

    return resolveNearestSlotIndexByMetrics(
      state,
      resolveGridMetrics(state.context),
      config.gridGap,
      options
    )
  }

  const resolveNearestDropOrderByContext = (state: DragState): Array<string | null> => {
    const globalSlotIndex = resolveNearestSlotIndexByContext(state, { allowOutside: true })
    if (globalSlotIndex === null) return state.workingOrder
    return moveDragHoleToIndex(state.workingOrder, globalSlotIndex)
  }

  const findTopLevelMaxOverlapHit = (state: DragState): OuterOverlapHit | null => {
    if (state.context === 'folder') return null

    if (state.context === 'dock') {
      const metrics = resolveGridMetrics('dock')
      return findOuterMaxOverlapHitByMetrics({
        state,
        gridElement: metrics.gridElement,
        columns: metrics.columns,
        rows: metrics.rows,
        iconImageSize: iconConfig.imgSize,
        pageSize: dockCapacity,
        currentPage: 0,
        tileRefs: dockItemRefs.current,
      })
    }

    const metrics = resolveGridMetrics('outer')
    return findOuterMaxOverlapHitByMetrics({
      state,
      gridElement: metrics.gridElement,
      columns: metrics.columns,
      rows: metrics.rows,
      iconImageSize: iconConfig.imgSize,
      pageSize: pageSizeRef.current,
      currentPage: currentPageRef.current,
      tileRefs: tileRefs.current,
    })
  }

  const applyTopLevelEvasion = (
    state: DragState,
    hit: OuterOverlapHit
  ): { order: Array<string | null>; direction: EvasionDirection | null } =>
    applyOuterEvasionPolicy(
      state.workingOrder,
      hit,
      state.context === 'dock' ? dockCapacity : pageSizeRef.current,
      state.context === 'dock' ? dockCapacity : columns,
      OUTER_DRAG_RULES.directionTieBreakByOverlap
    )

  const tryApplyTopLevelEvasion = (
    state: DragState,
    overlapHit: OuterOverlapHit,
    now: number
  ): DragState => {
    const movedSinceLastEvasion =
      !state.lastEvasionTriggerPointer ||
      Math.hypot(
        state.pointerX - state.lastEvasionTriggerPointer.x,
        state.pointerY - state.lastEvasionTriggerPointer.y
      ) >= config.evasionRearmDistance
    const cooledDownSinceLastEvasion =
      state.lastEvasionAt === null || now - state.lastEvasionAt >= config.evasionCooldownMs
    if (!movedSinceLastEvasion || !cooledDownSinceLastEvasion) return state

    const evasionResult = applyTopLevelEvasion(state, overlapHit)
    if (areSlotsEqual(evasionResult.order, state.workingOrder)) return state

    return {
      ...state,
      workingOrder: evasionResult.order,
      previewSlotIndex: overlapHit.targetIndex,
      dockPreviewIndex: state.context === 'dock' ? overlapHit.targetIndex : null,
      hoverTargetId: overlapHit.targetId,
      hoverZone: overlapHit.zone,
      hoverIou: overlapHit.iou,
      folderPreviewTargetId: null,
      lastEvasionSignature: `${overlapHit.targetId}:${evasionResult.direction ?? 'fallback'}`,
      lastEvasionTriggerPointer: { x: state.pointerX, y: state.pointerY },
      lastEvasionAt: now,
      dwellStartedAt: now,
    }
  }

  const triggerTopLevelDwellEvasion = (expectedTargetId: string) => {
    const latest = dragRef.current
    if (!latest || latest.context === 'folder') return
    if (latest.hoverTargetId !== expectedTargetId) return
    if (latest.folderPreviewTargetId) return

    const overlapHit = findTopLevelMaxOverlapHit(latest)
    if (!overlapHit || overlapHit.targetId !== expectedTargetId) return

    const itemMap = resolveDragItemMap(latest)
    const source = latest.draggingItem
    const target = itemMap.get(overlapHit.targetId)
    if (!target) return

    const now = performance.now()
    const canAddToExistingFolder =
      source.kind === 'icon' &&
      target.kind === 'folder' &&
      overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold
    if (canAddToExistingFolder) {
      const nextState: DragState = {
        ...latest,
        previewSlotIndex: overlapHit.targetIndex,
        dockPreviewIndex: latest.context === 'dock' ? overlapHit.targetIndex : null,
        hoverTargetId: overlapHit.targetId,
        hoverZone: overlapHit.zone,
        hoverIou: overlapHit.iou,
        folderPreviewTargetId: overlapHit.targetId,
        dwellStartedAt: null,
        lastEvasionSignature: null,
      }
      dragRef.current = nextState
      setDragState(nextState)
      return
    }

    const canFolderPreview = source.kind === 'icon' && target.kind === 'icon'
    if (canFolderPreview && overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold) {
      const previewState: DragState = {
        ...latest,
        previewSlotIndex: overlapHit.targetIndex,
        dockPreviewIndex: latest.context === 'dock' ? overlapHit.targetIndex : null,
        hoverTargetId: overlapHit.targetId,
        hoverZone: overlapHit.zone,
        hoverIou: overlapHit.iou,
        folderPreviewTargetId: overlapHit.targetId,
        dwellStartedAt: null,
        lastEvasionSignature: null,
      }
      dragRef.current = previewState
      setDragState(previewState)
      return
    }

    const base: DragState = {
      ...latest,
      previewSlotIndex: overlapHit.targetIndex,
      dockPreviewIndex: latest.context === 'dock' ? overlapHit.targetIndex : null,
      hoverTargetId: overlapHit.targetId,
      hoverZone: overlapHit.zone,
      hoverIou: overlapHit.iou,
      folderPreviewTargetId: null,
    }
    const next = tryApplyTopLevelEvasion(base, overlapHit, now)
    dragRef.current = next
    setDragState(next)
  }

  const {
    folderDropFlight,
    folderPreviewFreezeTargetId,
    folderCreateTransitionTargetId,
    hiddenOuterItemIds,
    frozenOuterOrder,
    resetDropVisuals,
    finishDrag,
  } = useDragDropCommit({
    reorderAnimationMs: config.reorderAnimationMs,
    iconConfig,
    columns,
    pageSizeRef,
    tileRefs,
    itemsRef,
    outerSlotsRef,
    dockKeysRef,
    setItems,
    setOuterSlots,
    setDockKeys,
    dockCapacity,
    dragRef,
    setDragState,
    clearEdgeSwitchTimer,
    resolveNearestDropOrderByContext,
    resolveNearestSlotIndexByContext,
  })

  const moveDragToTopLevelContext = (
    state: DragState,
    context: 'outer' | 'dock',
    x: number,
    y: number
  ): DragState => {
    if (state.context === 'folder' && state.draggingItem.kind !== 'icon') {
      return { ...state, pointerX: x, pointerY: y }
    }
    if (state.context === 'folder') {
      setOpenFolderId(null)
    }

    const nextOrder = resolveTopLevelOrder(context)
    const sourceIndex = nextOrder.indexOf(state.draggingId)
    const workingOrder = [...nextOrder]
    if (sourceIndex >= 0) {
      workingOrder[sourceIndex] = null
    }
    const initialCenters = collectCenters(context === 'dock' ? dockItemRefs.current : tileRefs.current)
    initialCenters[state.draggingId] = { x, y }

    const nextState: DragState = {
      ...state,
      context,
      pointerX: x,
      pointerY: y,
      workingOrder,
      sourceSlotIndex: sourceIndex >= 0 ? sourceIndex : null,
      previewSlotIndex: null,
      dockPreviewIndex: null,
      hoverTargetId: null,
      hoverZone: null,
      hoverIou: 0,
      centerStartedAt: null,
      dwellStartedAt: null,
      folderPreviewTargetId: null,
      lastEvasionSignature: null,
      lastEvasionTriggerPointer: null,
      lastEvasionAt: null,
      initialCenters,
    }
    const previewSlotIndex = resolveNearestSlotIndexByContext(nextState, { allowOutside: true })
    return {
      ...nextState,
      previewSlotIndex,
      dockPreviewIndex: context === 'dock' ? previewSlotIndex : null,
    }
  }

  const beginDrag = (pending: PendingDrag, x: number, y: number) => {
    clearTimer()
    clearOuterDwellTimer()
    resetDropVisuals()
    const sourceOrder =
      pending.context === 'folder' && pending.sourceFolderId
        ? getFolderChildrenById(itemsRef.current, pending.sourceFolderId).map(child => child.key)
        : pending.context === 'dock'
          ? createDockSlots(dockKeysRef.current, dockCapacity)
          : normalizeOuterSlots(
              outerSlotsRef.current,
              resolveOuterItemIdsForLayout(),
              pageSizeRef.current
            )
    if (pending.context === 'outer' && !areSlotsEqual(sourceOrder, outerSlotsRef.current)) {
      outerSlotsRef.current = sourceOrder
      setOuterSlots(sourceOrder)
    }
    const sourceIndex = sourceOrder.indexOf(pending.itemId)
    if (sourceIndex < 0) {
      clearPending()
      return
    }

    const draggingItem =
      pending.context === 'folder' && pending.sourceFolderId
        ? getFolderMapById(pending.sourceFolderId, itemsRef.current).get(pending.itemId)
        : itemById.get(pending.itemId)
    if (!draggingItem) {
      clearPending()
      return
    }

    const workingOrder: Array<string | null> = [...sourceOrder]
    if (pending.context === 'folder') {
      workingOrder[sourceIndex] = DRAG_HOLE_ID
    } else {
      workingOrder[sourceIndex] = null
    }
    const nextState: DragState = {
      context: pending.context,
      sourceFolderId: pending.sourceFolderId,
      pointerId: pending.pointerId,
      draggingId: pending.itemId,
      draggingItem,
      pointerX: x,
      pointerY: y,
      offsetX: pending.offsetX,
      offsetY: pending.offsetY,
      workingOrder,
      sourceSlotIndex: pending.context === 'folder' ? null : sourceIndex,
      previewSlotIndex: pending.context === 'folder' ? null : sourceIndex,
      dockPreviewIndex: pending.context === 'dock' ? sourceIndex : null,
      hoverTargetId: null,
      hoverZone: null,
      hoverIou: 0,
      centerStartedAt: null,
      dwellStartedAt: null,
      folderPreviewTargetId: null,
      lastEvasionSignature: null,
      lastEvasionTriggerPointer: null,
      lastEvasionAt: null,
      initialCenters:
        pending.context === 'folder'
          ? collectCenters(folderTileRefs.current)
          : pending.context === 'dock'
            ? collectCenters(dockItemRefs.current)
            : collectCenters(tileRefs.current),
    }
    dragRef.current = nextState
    setDragState(nextState)
    clearPending()
  }

  const onDragMove = (pointerId: number, x: number, y: number) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointerId) return

    let baseState: DragState = { ...current, pointerX: x, pointerY: y }
    if (current.context === 'folder') {
      const panel = folderPanelRef.current
      if (panel) {
        const panelRect = panel.getBoundingClientRect()
        const outsidePanel =
          x < panelRect.left || x > panelRect.right || y < panelRect.top || y > panelRect.bottom
        if (outsidePanel) {
          baseState = moveDragToTopLevelContext(
            baseState,
            resolveTopLevelContextAtPoint(x, y),
            x,
            y
          )
        }
      }
    }

    if (baseState.context !== 'folder') {
      const topLevelContext = resolveTopLevelContextAtPoint(x, y)
      if (baseState.context !== topLevelContext) {
        baseState = moveDragToTopLevelContext(baseState, topLevelContext, x, y)
      }

      if (baseState.context === 'outer') {
        maybeHandleOuterEdgeSwitch(baseState, x, y)
      } else {
        clearEdgeSwitchTimer()
      }

      const nearestSlotIndex = resolveNearestSlotIndexByContext(baseState, {
        allowOutside: true,
      })
      const overlapHit = findTopLevelMaxOverlapHit(baseState)
      const dockCanInsertTopLevelItem =
        baseState.context !== 'dock' ||
        dockKeysRef.current.includes(baseState.draggingId) ||
        getDockOccupiedCount(dockKeysRef.current) < dockCapacity

      if (!overlapHit) {
        clearOuterDwellTimer()
        const previewSlotIndex =
          baseState.context === 'dock' && !dockCanInsertTopLevelItem ? null : nearestSlotIndex
        const resetState: DragState = {
          ...resetOuterInteraction(baseState, previewSlotIndex),
          dockPreviewIndex: baseState.context === 'dock' ? previewSlotIndex : null,
        }
        dragRef.current = resetState
        setDragState(resetState)
        return
      }

      const itemMap = resolveDragItemMap(baseState)
      const source = baseState.draggingItem
      const target = itemMap.get(overlapHit.targetId)
      if (!target) {
        clearOuterDwellTimer()
        const resetState = resetOuterInteraction(baseState, nearestSlotIndex)
        dragRef.current = resetState
        setDragState(resetState)
        return
      }

      const now = performance.now()
      const next: DragState = {
        ...baseState,
        previewSlotIndex: overlapHit.targetIndex,
        dockPreviewIndex: baseState.context === 'dock' ? overlapHit.targetIndex : null,
        hoverTargetId: overlapHit.targetId,
        hoverZone: overlapHit.zone,
        hoverIou: overlapHit.iou,
        centerStartedAt: null,
      }

      const canFolderPreview = source.kind === 'icon' && target.kind === 'icon'
      if (canFolderPreview && overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold) {
        clearOuterDwellTimer()
        next.folderPreviewTargetId = overlapHit.targetId
        next.dwellStartedAt = null
        next.lastEvasionSignature = null
        dragRef.current = next
        setDragState(next)
        return
      }

      const canAddToExistingFolder =
        source.kind === 'icon' &&
        target.kind === 'folder' &&
        overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold
      if (canAddToExistingFolder) {
        clearOuterDwellTimer()
        next.folderPreviewTargetId = overlapHit.targetId
        next.dwellStartedAt = null
        next.lastEvasionSignature = null
        dragRef.current = next
        setDragState(next)
        return
      }

      if (baseState.context === 'dock' && !dockCanInsertTopLevelItem) {
        clearOuterDwellTimer()
        const blockedState: DragState = {
          ...baseState,
          previewSlotIndex: null,
          dockPreviewIndex: null,
          hoverTargetId: null,
          hoverZone: null,
          hoverIou: 0,
          centerStartedAt: null,
          dwellStartedAt: null,
          folderPreviewTargetId: null,
          lastEvasionSignature: null,
        }
        dragRef.current = blockedState
        setDragState(blockedState)
        return
      }

      next.folderPreviewTargetId = null
      const sameTarget = baseState.hoverTargetId === overlapHit.targetId
      next.dwellStartedAt =
        sameTarget && baseState.dwellStartedAt !== null ? baseState.dwellStartedAt : now
      if (!sameTarget) {
        next.lastEvasionSignature = null
      }

      const dwellSince = next.dwellStartedAt ?? now
      const remainingMs = Math.max(0, OUTER_DRAG_RULES.evasionDwellMs - (now - dwellSince))
      const targetChanged = outerDwellTargetIdRef.current !== overlapHit.targetId
      if (targetChanged) {
        clearOuterDwellTimer()
      }
      if (outerDwellTimerRef.current === null) {
        outerDwellTargetIdRef.current = overlapHit.targetId
        outerDwellTimerRef.current = window.setTimeout(() => {
          const targetId = outerDwellTargetIdRef.current
          outerDwellTimerRef.current = null
          if (!targetId) return
          triggerTopLevelDwellEvasion(targetId)
        }, remainingMs)
      }

      dragRef.current = next
      setDragState(next)
      return
    }

    clearOuterDwellTimer()

    const hit = findHitByContext(baseState, x, y)
    if (!hit) {
      const resetState: DragState = {
        ...baseState,
        hoverTargetId: null,
        hoverZone: null,
        hoverIou: 0,
        centerStartedAt: null,
        dwellStartedAt: null,
        folderPreviewTargetId: null,
        lastEvasionSignature: null,
      }
      dragRef.current = resetState
      setDragState(resetState)
      return
    }

    if (hit.targetId === null) {
      const next: DragState = {
        ...baseState,
        hoverTargetId: null,
        hoverZone: null,
        hoverIou: 0,
        centerStartedAt: null,
        dwellStartedAt: null,
        folderPreviewTargetId: null,
        lastEvasionSignature: null,
        workingOrder: moveDragHoleToIndex(baseState.workingOrder, hit.globalSlotIndex),
      }
      dragRef.current = next
      setDragState(next)
      return
    }

    const itemMap = resolveDragItemMap(baseState)
    const source = baseState.draggingItem
    const target = itemMap.get(hit.targetId)
    if (!target) {
      dragRef.current = baseState
      setDragState(baseState)
      return
    }

    const next: DragState = {
      ...baseState,
      hoverTargetId: hit.targetId,
      hoverZone: hit.zone,
      hoverIou: 0,
      dwellStartedAt: null,
    }

    const canFolder = source.kind === 'icon' && target.kind === 'icon'
    next.centerStartedAt = null
    next.folderPreviewTargetId = null

    const sourceCenter = baseState.initialCenters[baseState.draggingId]
    const targetCenter = baseState.initialCenters[hit.targetId]
    const horizontal =
      !sourceCenter || !targetCenter
        ? null
        : targetCenter.x > sourceCenter.x
          ? 'right'
          : targetCenter.x < sourceCenter.x
            ? 'left'
            : null

    const sideZone = hit.zone === 'left' || hit.zone === 'right'
    const shouldEvasion = canFolder && sideZone && horizontal === hit.zone
    const targetIndex = baseState.workingOrder.indexOf(hit.targetId)
    if (targetIndex < 0) {
      dragRef.current = next
      setDragState(next)
      return
    }

    let desiredHoleIndex = targetIndex
    if (shouldEvasion) {
      const now = performance.now()
      const signature = `${hit.targetId}:${hit.zone}`
      const movedSinceLastEvasion =
        !baseState.lastEvasionTriggerPointer ||
        Math.hypot(
          x - baseState.lastEvasionTriggerPointer.x,
          y - baseState.lastEvasionTriggerPointer.y
        ) >= config.evasionRearmDistance
      const cooledDownSinceLastEvasion =
        baseState.lastEvasionAt === null ||
        now - baseState.lastEvasionAt >= config.evasionCooldownMs

      const shouldTriggerThisFrame =
        movedSinceLastEvasion &&
        cooledDownSinceLastEvasion &&
        baseState.lastEvasionSignature !== signature

      if (!shouldTriggerThisFrame) {
        next.lastEvasionSignature = baseState.lastEvasionSignature
        next.lastEvasionAt = baseState.lastEvasionAt
        dragRef.current = next
        setDragState(next)
        return
      }

      next.lastEvasionSignature = signature
      next.lastEvasionTriggerPointer = { x, y }
      next.lastEvasionAt = now
    } else {
      next.lastEvasionSignature = null
      next.lastEvasionAt = baseState.lastEvasionAt
      if (hit.zone === 'right' || hit.zone === 'down') {
        desiredHoleIndex = Math.min(baseState.workingOrder.length - 1, targetIndex + 1)
      }
    }

    next.workingOrder = moveDragHoleToIndex(baseState.workingOrder, desiredHoleIndex)
    dragRef.current = next
    setDragState(next)
  }

  useEffect(() => {
    beginDragFnRef.current = beginDrag
  }, [beginDrag])

  useEffect(() => {
    onDragMoveFnRef.current = onDragMove
  }, [onDragMove])

  useEffect(() => {
    finishDragFnRef.current = (pointerId: number) => {
      if (!finishDrag(pointerId)) return
      clearOuterDwellTimer()
      suppressClickUntilRef.current = performance.now() + 300
    }
  }, [finishDrag])

  useEffect(() => {
    clearPendingFnRef.current = clearPending
  }, [clearPending])

  useEffect(() => {
    cancelDragFnRef.current = (pointerId: number) => {
      if (dragRef.current?.pointerId !== pointerId) return
      clearOuterDwellTimer()
      clearEdgeSwitchTimer()
      dragRef.current = null
      setDragState(null)
    }
  }, [clearEdgeSwitchTimer])

  usePointerDragController({
    pendingRef,
    dragRef,
    beginDragFnRef,
    onDragMoveFnRef,
    finishDragFnRef,
    clearPendingFnRef,
    cancelDragFnRef,
    dragMoveThreshold: config.dragMoveThreshold,
  })

  const handleTilePointerDown = (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => {
    if (selectionMode || event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    pendingRef.current = {
      context: 'outer',
      sourceFolderId: null,
      pointerId: event.pointerId,
      itemId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== event.pointerId) return
      beginDrag(pending, pending.startX, pending.startY)
    }, config.dragLongPressMs)
  }

  const handleFolderTilePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    folderId: string,
    itemId: string
  ) => {
    if (selectionMode || event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    pendingRef.current = {
      context: 'folder',
      sourceFolderId: folderId,
      pointerId: event.pointerId,
      itemId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== event.pointerId) return
      beginDrag(pending, pending.startX, pending.startY)
    }, config.dragLongPressMs)
  }

  const handleDockItemPointerDown = (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => {
    if (selectionMode || event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    pendingRef.current = {
      context: 'dock',
      sourceFolderId: null,
      pointerId: event.pointerId,
      itemId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== event.pointerId) return
      beginDrag(pending, pending.startX, pending.startY)
    }, config.dragLongPressMs)
  }

  const handleTileClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (performance.now() < suppressClickUntilRef.current) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const clearOuterDragInteractionForPageSwitch = () => {
    const current = dragRef.current
    if (!current || current.context !== 'outer') return
    clearOuterDwellTimer()
    const next = { ...resetOuterInteraction(current, null), dockPreviewIndex: null }
    dragRef.current = next
    setDragState(next)
  }

  useEffect(
    () => () => {
      clearTimer()
      clearOuterDwellTimer()
      clearEdgeSwitchTimer()
    },
    []
  )

  return {
    dragState,
    dragRef,
    folderDropFlight,
    folderPreviewFreezeTargetId,
    folderCreateTransitionTargetId,
    hiddenOuterItemIds,
    frozenOuterOrder,
    handleTilePointerDown,
    handleFolderTilePointerDown,
    handleDockItemPointerDown,
    handleTileClickCapture,
    clearEdgeSwitchTimer,
    clearOuterDragInteractionForPageSwitch,
  }
}
