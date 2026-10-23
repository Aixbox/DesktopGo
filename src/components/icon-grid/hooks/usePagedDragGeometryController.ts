import type { MutableRefObject } from 'react'
import type { EvasionDirection, GridItem } from '../model'
import { getGridItemSpan, getId } from '../model'
import { DRAG_HOLE_ID, areSlotsEqual } from '../domain/slots'
import {
  getEvasionIntentSignature,
  hasPointerExitedEvasionHold,
  moveDragHoleToIndex,
} from '../domain/evasionPolicy'
import { clampNumber, classifyZone } from '../domain/geometry'
import {
  applyOuterEvasionPolicy,
  findHitByMetrics,
  findOuterMaxOverlapHitByMetrics,
  resolveNearestAnchorIndexByMetrics,
  resolveNearestSlotIndexByMetrics,
} from '../domain/dragMovePolicy'
import {
  canPlaceItemAtAnchorIndex,
  findNearestValidAnchorIndex,
  normalizeOuterSlots,
} from '../domain/topLevelLayout'
import { getDockItemKeys, resolveOuterItemIds } from '../domain/dock'
import { EVASION_HOLD_EXIT_MARGIN, OUTER_DRAG_RULES } from '../constants'
import type { DragHit, DragState, OuterOverlapHit } from '../state/types'
import {
  findDockMaxOverlapHit,
  resolveDockNearestSlotIndex,
  resolveDockTopLevelContextAtPoint,
} from './dockDragHitTesting'

interface PagedDragGeometryControllerParams {
  gridGap: number
  evasionCooldownMs: number
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  folderColumns: number
  folderItemWidth: number
  folderItemHeight: number
  folderOrderLength: number
  iconImageSize: number
  gridRef: MutableRefObject<HTMLDivElement | null>
  folderGridRef: MutableRefObject<HTMLDivElement | null>
  dockContainerRef: MutableRefObject<HTMLDivElement | null>
  dockGridRef: MutableRefObject<HTMLDivElement | null>
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  dockSlotRefs: MutableRefObject<Map<number, HTMLDivElement>>
  dockItemRefs: MutableRefObject<Map<string, HTMLDivElement>>
  itemsRef: MutableRefObject<GridItem[]>
  outerSlotsRef: MutableRefObject<Array<string | null>>
  dockKeysRef: MutableRefObject<Array<string | null>>
  currentPageRef: MutableRefObject<number>
  pageSizeRef: MutableRefObject<number>
}

export function usePagedDragGeometryController({
  gridGap,
  evasionCooldownMs,
  columns,
  rows,
  itemWidth,
  itemHeight,
  folderColumns,
  folderItemWidth,
  folderItemHeight,
  folderOrderLength,
  iconImageSize,
  gridRef,
  folderGridRef,
  dockContainerRef,
  dockGridRef,
  tileRefs,
  dockSlotRefs,
  dockItemRefs,
  itemsRef,
  outerSlotsRef,
  dockKeysRef,
  currentPageRef,
  pageSizeRef,
}: PagedDragGeometryControllerParams) {
  const resolveOuterItemsForLayout = (
    dockOrder: Array<string | null> = dockKeysRef.current
  ): GridItem[] => {
    const outerItemIds = resolveOuterItemIds(itemsRef.current.map(getId), dockOrder)
    const outerItemIdSet = new Set(outerItemIds)
    return itemsRef.current.filter(item => outerItemIdSet.has(getId(item)))
  }

  const resolveDockItemOrder = (draggingIds: string[] = []): string[] =>
    getDockItemKeys(dockKeysRef.current, draggingIds)

  const isDraggingFromDock = (draggingId: string): boolean =>
    dockKeysRef.current.includes(draggingId)

  const seedMissingOuterDragCenters = ({
    initialCenters,
    draggingIds,
    sourceOrder,
    leadId,
    fallbackX,
    fallbackY,
  }: {
    initialCenters: Record<string, { x: number; y: number }>
    draggingIds: string[]
    sourceOrder: Array<string | null>
    leadId: string
    fallbackX: number
    fallbackY: number
  }) => {
    const missingIds = draggingIds.filter(id => !initialCenters[id])
    if (missingIds.length === 0) return

    const safePageSize = Math.max(1, pageSizeRef.current)
    const safeColumns = Math.max(1, columns)
    const stepX = itemWidth + gridGap
    const stepY = itemHeight + gridGap
    const leadIndex = sourceOrder.indexOf(leadId)
    const leadPage = leadIndex >= 0 ? Math.floor(leadIndex / safePageSize) : currentPageRef.current
    const gridRect = gridRef.current?.getBoundingClientRect() ?? null
    const sideOffset = Math.min(28, Math.max(12, Math.round(iconImageSize * 0.24)))
    const stackOffset = Math.min(14, Math.max(6, Math.round(iconImageSize * 0.12)))
    const sideCounts = { left: 0, right: 0 }

    missingIds.forEach((id, missingIndex) => {
      const sourceIndex = sourceOrder.indexOf(id)
      if (!gridRect || sourceIndex < 0) {
        initialCenters[id] = {
          x: fallbackX + ((missingIndex % 2) - 0.5) * stackOffset * 2,
          y: fallbackY + Math.floor(missingIndex / 2) * stackOffset,
        }
        return
      }

      const sourcePage = Math.floor(sourceIndex / safePageSize)
      const localIndex = sourceIndex - sourcePage * safePageSize
      const row = Math.floor(localIndex / safeColumns)
      const col = localIndex % safeColumns
      if (sourcePage === leadPage) {
        initialCenters[id] = {
          x: gridRect.left + col * stepX + itemWidth / 2,
          y: gridRect.top + row * stepY + itemHeight / 2,
        }
        return
      }

      const side = sourcePage < leadPage ? 'left' : 'right'
      const sideIndex = sideCounts[side]
      sideCounts[side] += 1
      const pageDistance = Math.max(1, Math.abs(sourcePage - leadPage))
      const verticalJitter = (sideIndex % 3) - 1
      const baseY = gridRect.top + row * stepY + itemHeight / 2 + verticalJitter * stackOffset
      initialCenters[id] = {
        x:
          side === 'left'
            ? gridRect.left - sideOffset - (pageDistance - 1) * stackOffset
            : gridRect.right + sideOffset + (pageDistance - 1) * stackOffset,
        y: clampNumber(baseY, gridRect.top + itemHeight / 2, gridRect.bottom - itemHeight / 2),
      }
    })
  }

  const resolveTopLevelOrder = (context: 'outer' | 'dock'): Array<string | null> =>
    context === 'dock'
      ? resolveDockItemOrder()
      : normalizeOuterSlots(
          outerSlotsRef.current,
          resolveOuterItemsForLayout(),
          pageSizeRef.current,
          Math.max(1, columns)
        )

  const resolveTopLevelContextAtPoint = (x: number, y: number): 'outer' | 'dock' =>
    resolveDockTopLevelContextAtPoint({ x, y, dockContainer: dockContainerRef.current })

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
      const dockItemCount = Math.max(1, resolveDockItemOrder().length)
      return {
        gridElement: dockGridRef.current,
        columns: dockItemCount,
        rows: 1,
        itemWidth: iconImageSize,
        itemHeight: iconImageSize,
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
    if (state.context !== 'dock') {
      return findHitByMetrics(state, x, y, resolveGridMetrics(state.context), gridGap)
    }
    const slotEntries = Array.from(dockSlotRefs.current.entries()).sort(([a], [b]) => a - b)
    for (const [index, node] of slotEntries) {
      const rect = node.getBoundingClientRect()
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
      const rawTargetId =
        node.querySelector<HTMLElement>('[data-dock-key]')?.dataset.dockKey ??
        state.workingOrder[index]
      const targetId =
        !rawTargetId || rawTargetId === DRAG_HOLE_ID || rawTargetId === state.draggingId
          ? null
          : rawTargetId
      return { targetId, zone: classifyZone(rect, x, y), globalSlotIndex: index }
    }
    return null
  }

  const resolveOuterEvasionGeometryState = (state: DragState): DragState =>
    state.context === 'outer' && state.evasionBaseOrder
      ? { ...state, workingOrder: state.evasionBaseOrder }
      : state

  const resolveNearestSlotIndexByContext = (
    state: DragState,
    options?: { allowOutside?: boolean }
  ): number | null => {
    if (state.context === 'dock') {
      return resolveDockNearestSlotIndex({
        state,
        dockContainer: dockContainerRef.current,
        slotNodes: dockSlotRefs.current,
        allowOutside: options?.allowOutside,
      })
    }
    if (state.context !== 'outer') {
      return resolveNearestSlotIndexByMetrics(
        state,
        resolveGridMetrics(state.context),
        gridGap,
        options
      )
    }

    const geometryState = resolveOuterEvasionGeometryState(state)
    const metrics = resolveGridMetrics('outer')
    if (!metrics.gridElement) return null
    const outerItems = resolveOuterItemsForLayout()
    const draggingSpan = getGridItemSpan(geometryState.draggingItem)
    if (draggingSpan.cols === 1 && draggingSpan.rows === 1) {
      const rawIndex = resolveNearestSlotIndexByMetrics(geometryState, metrics, gridGap, options)
      if (
        rawIndex !== null &&
        canPlaceItemAtAnchorIndex(
          geometryState.workingOrder,
          outerItems,
          rawIndex,
          draggingSpan,
          metrics.columns,
          pageSizeRef.current
        )
      ) {
        return rawIndex
      }
    }

    return findNearestValidAnchorIndex({
      pointerX: state.pointerX,
      pointerY: state.pointerY,
      gridRect: metrics.gridElement.getBoundingClientRect(),
      slots: geometryState.workingOrder,
      items: outerItems,
      draggingItem: geometryState.draggingItem,
      columns: metrics.columns,
      rows: metrics.rows,
      itemWidth: metrics.itemWidth,
      itemHeight: metrics.itemHeight,
      pageOffset: metrics.pageOffset,
      pageSize: pageSizeRef.current,
      gridGap,
      allowOutside: options?.allowOutside,
    })
  }

  const resolveNearestDropOrderByContext = (state: DragState): Array<string | null> => {
    const globalSlotIndex = resolveNearestSlotIndexByContext(state, { allowOutside: true })
    return globalSlotIndex === null
      ? state.workingOrder
      : moveDragHoleToIndex(state.workingOrder, globalSlotIndex)
  }

  const resolveCandidateAnchorIndexByContext = (
    state: DragState,
    options?: { allowOutside?: boolean }
  ): number | null => {
    if (state.context !== 'outer') return resolveNearestSlotIndexByContext(state, options)
    const geometryState = resolveOuterEvasionGeometryState(state)
    const metrics = resolveGridMetrics('outer')
    const draggingSpan = getGridItemSpan(geometryState.draggingItem)
    return draggingSpan.cols === 1 && draggingSpan.rows === 1
      ? resolveNearestSlotIndexByContext(geometryState, options)
      : resolveNearestAnchorIndexByMetrics(geometryState, metrics, gridGap, draggingSpan, options)
  }

  const findTopLevelMaxOverlapHit = (state: DragState): OuterOverlapHit | null => {
    if (state.context === 'folder') return null
    if (state.context === 'dock') {
      return findDockMaxOverlapHit({
        state,
        iconSize: iconImageSize,
        slotNodes: dockSlotRefs.current,
        itemNodes: dockItemRefs.current,
      })
    }

    const metrics = resolveGridMetrics('outer')
    const draggingSpan = getGridItemSpan(state.draggingItem)
    const dragWidth =
      state.draggingItem.kind === 'folder'
        ? draggingSpan.cols * metrics.itemWidth + Math.max(0, draggingSpan.cols - 1) * gridGap
        : iconImageSize
    const dragHeight =
      state.draggingItem.kind === 'folder'
        ? draggingSpan.rows * metrics.itemHeight + Math.max(0, draggingSpan.rows - 1) * gridGap
        : iconImageSize
    return findOuterMaxOverlapHitByMetrics({
      state: resolveOuterEvasionGeometryState(state),
      gridElement: metrics.gridElement,
      columns: metrics.columns,
      rows: metrics.rows,
      itemWidth: metrics.itemWidth,
      itemHeight: metrics.itemHeight,
      gridGap,
      dragWidth,
      dragHeight,
      pageSize: pageSizeRef.current,
      currentPage: currentPageRef.current,
      tileRefs: tileRefs.current,
      items: resolveOuterItemsForLayout(),
    })
  }

  const resolvePreviewIndexWithinTargetSpan = (
    state: DragState,
    overlapHit: OuterOverlapHit,
    targetSpan: { cols: number; rows: number }
  ) => {
    const safeColumns = Math.max(1, columns)
    const safePageSize = Math.max(1, pageSizeRef.current)
    const pageStart = Math.floor(overlapHit.targetIndex / safePageSize) * safePageSize
    const localIndex = Math.max(0, overlapHit.targetIndex - pageStart)
    const anchorRow = Math.floor(localIndex / safeColumns)
    const anchorCol = localIndex % safeColumns
    const rect = overlapHit.targetRect
    const relativeX =
      rect.width > 0 ? clampNumber((state.pointerX - rect.left) / rect.width, 0, 0.999999) : 0
    const relativeY =
      rect.height > 0 ? clampNumber((state.pointerY - rect.top) / rect.height, 0, 0.999999) : 0
    let colOffset = targetSpan.cols > 1 ? Math.floor(relativeX * targetSpan.cols) : 0
    let rowOffset = targetSpan.rows > 1 ? Math.floor(relativeY * targetSpan.rows) : 0
    if (overlapHit.zone === 'left') colOffset = 0
    if (overlapHit.zone === 'right') colOffset = Math.max(0, targetSpan.cols - 1)
    if (overlapHit.zone === 'up') rowOffset = 0
    if (overlapHit.zone === 'down') rowOffset = Math.max(0, targetSpan.rows - 1)
    colOffset = clampNumber(colOffset, 0, Math.max(0, targetSpan.cols - 1))
    rowOffset = clampNumber(rowOffset, 0, Math.max(0, targetSpan.rows - 1))
    return pageStart + (anchorRow + rowOffset) * safeColumns + (anchorCol + colOffset)
  }

  const resolveTopLevelOverlapPreviewIndex = (
    state: DragState,
    target: GridItem,
    overlapHit: OuterOverlapHit,
    _nearestSlotIndex: number | null,
    candidateAnchorIndex: number | null
  ) => {
    if (state.context !== 'outer') return overlapHit.targetIndex
    const draggingSpan = getGridItemSpan(state.draggingItem)
    if (draggingSpan.cols > 1 || draggingSpan.rows > 1) return candidateAnchorIndex
    const targetSpan = getGridItemSpan(target)
    return targetSpan.cols === 1 && targetSpan.rows === 1
      ? overlapHit.targetIndex
      : resolvePreviewIndexWithinTargetSpan(state, overlapHit, targetSpan)
  }

  const applyTopLevelEvasion = (
    state: DragState,
    hit: OuterOverlapHit
  ): { order: Array<string | null>; direction: EvasionDirection | null } => {
    const outerItems = state.context === 'outer' ? resolveOuterItemsForLayout() : null
    const draggingSpan = getGridItemSpan(state.draggingItem)
    const targetItem =
      state.context === 'outer'
        ? (outerItems?.find(item => getId(item) === hit.targetId) ?? null)
        : null
    const targetSpan = targetItem ? getGridItemSpan(targetItem) : null
    const shouldUsePreviewAnchor =
      state.context === 'outer' &&
      (state.draggingIds.length > 1 ||
        draggingSpan.cols > 1 ||
        draggingSpan.rows > 1 ||
        Boolean(targetSpan && (targetSpan.cols > 1 || targetSpan.rows > 1)))
    const targetAnchorIndex = shouldUsePreviewAnchor
      ? (state.previewSlotIndex ?? hit.targetIndex)
      : undefined
    return applyOuterEvasionPolicy(
      state.workingOrder,
      hit,
      state.context === 'dock' ? Math.max(1, state.workingOrder.length) : pageSizeRef.current,
      state.context === 'dock' ? Math.max(1, state.workingOrder.length) : columns,
      OUTER_DRAG_RULES.directionTieBreakByOverlap,
      state.context === 'outer'
        ? {
            items: outerItems ?? [],
            draggingItem: state.draggingItem,
            draggingIds: state.draggingIds,
            targetAnchorIndex,
          }
        : undefined
    )
  }

  const resolveEvasionHoldCenter = (state: DragState, anchorIndex: number) => {
    const metrics = resolveGridMetrics('outer')
    const gridElement = metrics.gridElement
    if (!gridElement) return null

    const safeColumns = Math.max(1, metrics.columns)
    const localIndex = anchorIndex - metrics.pageOffset
    if (localIndex < 0) return null

    const row = Math.floor(localIndex / safeColumns)
    const col = localIndex % safeColumns
    const span = getGridItemSpan(state.draggingItem)
    const stepX = metrics.itemWidth + gridGap
    const stepY = metrics.itemHeight + gridGap
    const footprintWidth = span.cols * metrics.itemWidth + Math.max(0, span.cols - 1) * gridGap
    const footprintHeight = span.rows * metrics.itemHeight + Math.max(0, span.rows - 1) * gridGap
    const gridRect = gridElement.getBoundingClientRect()

    return {
      centerX: gridRect.left + col * stepX + footprintWidth / 2,
      centerY: gridRect.top + row * stepY + footprintHeight / 2,
      stepX,
      stepY,
    }
  }

  /** 以拖动项完整 footprint 的几何锚点判断避让是否仍然有效。 */
  const resolveEvasionHoldIndex = (state: DragState): number | null => {
    if (state.context === 'dock') {
      return resolveNearestSlotIndexByContext(state, { allowOutside: true })
    }
    if (state.context !== 'outer') return null
    const metrics = resolveGridMetrics('outer')
    if (!metrics.gridElement) return null
    if (state.draggingIds.length > 1) {
      return resolveNearestSlotIndexByMetrics(state, metrics, gridGap, { allowOutside: true })
    }
    return resolveNearestAnchorIndexByMetrics(
      state,
      metrics,
      gridGap,
      getGridItemSpan(state.draggingItem),
      { allowOutside: true }
    )
  }

  /** 无条件把顺序退回避让之前：要切到别的交互（比如预览合并文件夹）时用。 */
  const revertTopLevelEvasion = (state: DragState): DragState => {
    const baseOrder = state.evasionBaseOrder ?? null
    if (!baseOrder) return state
    return {
      ...state,
      workingOrder: baseOrder,
      evasionBaseOrder: null,
      evasionHoldIndex: null,
      lastEvasionSignature: null,
      lastEvasionTriggerPointer: null,
    }
  }

  const reflowTopLevelEvasion = (
    state: DragState,
    baseOrder: Array<string | null>,
    nextHoldIndex: number,
    now: number
  ): DragState => {
    const metrics = resolveGridMetrics('outer')
    if (!metrics.gridElement) return revertTopLevelEvasion(state)

    const baseState: DragState = { ...state, workingOrder: baseOrder }
    const nearestSlotIndex = resolveNearestSlotIndexByMetrics(baseState, metrics, gridGap, {
      allowOutside: true,
    })
    const candidateAnchorIndex = resolveNearestAnchorIndexByMetrics(
      baseState,
      metrics,
      gridGap,
      getGridItemSpan(state.draggingItem),
      { allowOutside: true }
    )
    const overlapHit = findTopLevelMaxOverlapHit(baseState)
    if (!overlapHit || state.draggingIds.includes(overlapHit.targetId)) {
      return revertTopLevelEvasion(state)
    }

    const target = resolveOuterItemsForLayout().find(item => getId(item) === overlapHit.targetId)
    if (!target) return revertTopLevelEvasion(state)

    const previewSlotIndex = resolveTopLevelOverlapPreviewIndex(
      baseState,
      target,
      overlapHit,
      nearestSlotIndex,
      candidateAnchorIndex
    )
    const nextState: DragState = {
      ...baseState,
      previewSlotIndex,
      dockPreviewIndex: null,
      hoverTargetId: overlapHit.targetId,
      hoverZone: overlapHit.zone,
      hoverIou: overlapHit.iou,
      centerStartedAt: null,
      dwellStartedAt: null,
      folderPreviewTargetId: null,
    }
    const evasionResult = applyTopLevelEvasion(nextState, overlapHit)
    if (areSlotsEqual(evasionResult.order, baseOrder)) {
      return revertTopLevelEvasion(state)
    }

    return {
      ...nextState,
      workingOrder: evasionResult.order,
      lastEvasionSignature: getEvasionIntentSignature(overlapHit.targetId, overlapHit.zone),
      lastEvasionTriggerPointer: { x: state.pointerX, y: state.pointerY },
      lastEvasionAt: now,
      evasionBaseOrder: baseOrder,
      evasionHoldIndex: nextHoldIndex,
    }
  }

  /**
   * 避让只是预览。越过锚点边界缓冲后，从原始顺序按当前 footprint 重算，
   * 只让当前仍被覆盖的图标继续避让。
   */
  const settleTopLevelEvasion = (state: DragState): DragState => {
    const baseOrder = state.evasionBaseOrder ?? null
    if (!baseOrder) return state
    const holdIndex = state.evasionHoldIndex ?? null
    if (state.context !== 'outer' || state.draggingIds.length > 1) {
      if (holdIndex !== null && resolveEvasionHoldIndex(state) === holdIndex) return state
      return revertTopLevelEvasion(state)
    }
    if (holdIndex === null) return revertTopLevelEvasion(state)

    const nextHoldIndex = resolveEvasionHoldIndex({ ...state, workingOrder: baseOrder })
    if (nextHoldIndex === null || nextHoldIndex === holdIndex) return state

    const holdCenter = resolveEvasionHoldCenter(state, holdIndex)
    if (!holdCenter) return state
    const hasExitedHold = hasPointerExitedEvasionHold({
      pointerX: state.pointerX,
      pointerY: state.pointerY,
      ...holdCenter,
      exitMargin: EVASION_HOLD_EXIT_MARGIN,
    })
    if (!hasExitedHold) return state

    const overlapHit = findTopLevelMaxOverlapHit({ ...state, workingOrder: baseOrder })
    if (!overlapHit || state.draggingIds.includes(overlapHit.targetId)) {
      return revertTopLevelEvasion(state)
    }

    // Reset the dwell for this anchor; reflow only after the normal delay expires.
    return {
      ...state,
      evasionHoldIndex: nextHoldIndex,
      dwellStartedAt: null,
      lastEvasionSignature: null,
    }
  }

  const tryApplyTopLevelEvasion = (
    state: DragState,
    overlapHit: OuterOverlapHit,
    now: number
  ): DragState => {
    const cooledDownSinceLastEvasion =
      state.lastEvasionAt === null || now - state.lastEvasionAt >= evasionCooldownMs
    if (!cooledDownSinceLastEvasion) return state
    const baseOrder = state.evasionBaseOrder
    if (state.context === 'outer' && state.draggingIds.length === 1 && baseOrder) {
      const nextHoldIndex = resolveEvasionHoldIndex({ ...state, workingOrder: baseOrder })
      if (nextHoldIndex === null) return revertTopLevelEvasion(state)
      return reflowTopLevelEvasion({ ...state, lastEvasionAt: now }, baseOrder, nextHoldIndex, now)
    }
    const evasionResult = applyTopLevelEvasion(state, overlapHit)
    const nextEvasionSignature = getEvasionIntentSignature(overlapHit.targetId, overlapHit.zone)
    if (
      nextEvasionSignature === state.lastEvasionSignature ||
      areSlotsEqual(evasionResult.order, state.workingOrder)
    ) {
      return state
    }
    return {
      ...state,
      workingOrder: evasionResult.order,
      previewSlotIndex: state.previewSlotIndex,
      dockPreviewIndex: state.context === 'dock' ? overlapHit.targetIndex : null,
      hoverTargetId: overlapHit.targetId,
      hoverZone: overlapHit.zone,
      hoverIou: overlapHit.iou,
      folderPreviewTargetId: null,
      lastEvasionSignature: nextEvasionSignature,
      lastEvasionTriggerPointer: { x: state.pointerX, y: state.pointerY },
      lastEvasionAt: now,
      dwellStartedAt: now,
      // 连着避让时保留最早那份基线，退回才能回到拖动开始时的样子。
      evasionBaseOrder: state.evasionBaseOrder ?? state.workingOrder,
      evasionHoldIndex: resolveEvasionHoldIndex(state),
    }
  }

  return {
    resolveOuterItemsForLayout,
    resolveDockItemOrder,
    isDraggingFromDock,
    seedMissingOuterDragCenters,
    resolveTopLevelOrder,
    resolveTopLevelContextAtPoint,
    findHitByContext,
    resolveNearestSlotIndexByContext,
    resolveNearestDropOrderByContext,
    resolveCandidateAnchorIndexByContext,
    findTopLevelMaxOverlapHit,
    resolveTopLevelOverlapPreviewIndex,
    revertTopLevelEvasion,
    settleTopLevelEvasion,
    tryApplyTopLevelEvasion,
  }
}
