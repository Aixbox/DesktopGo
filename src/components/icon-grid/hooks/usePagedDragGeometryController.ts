import type { MutableRefObject } from 'react'
import type { EvasionDirection, GridItem } from '../model'
import { getGridItemSpan, getId } from '../model'
import { DRAG_HOLE_ID } from '../domain/slots'
import {
  applyEvasionPreview,
  applyRebasedEvasionPreview,
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
  buildTopLevelOccupancy,
  canPlaceItemAtAnchorIndex,
  findNearestValidAnchorIndex,
  normalizeOuterSlots,
} from '../domain/topLevelLayout'
import { getDockItemKeys, resolveOuterItemIds } from '../domain/dock'
import { OUTER_DRAG_RULES } from '../constants'
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
  iconImageSize: number
  gridRef: MutableRefObject<HTMLDivElement | null>
  folderGridRef: MutableRefObject<HTMLDivElement | null>
  dockContainerRef: MutableRefObject<HTMLDivElement | null>
  dockGridRef: MutableRefObject<HTMLDivElement | null>
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  dockSlotRefs: MutableRefObject<Map<number, HTMLDivElement>>
  dockItemRefs: MutableRefObject<Map<string, HTMLDivElement>>
  itemById: Map<string, GridItem>
  itemsRef: MutableRefObject<GridItem[]>
  outerSlotsRef: MutableRefObject<Array<string | null>>
  dockKeysRef: MutableRefObject<Array<string | null>>
  currentPageRef: MutableRefObject<number>
  pageSizeRef: MutableRefObject<number>
}

const resolveFolderGridRows = (gridElement: HTMLElement | null, columns: number): number => {
  const safeColumns = Math.max(1, columns)
  const childCount = gridElement?.children.length ?? 0
  return Math.max(1, Math.ceil(childCount / safeColumns))
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
  iconImageSize,
  gridRef,
  folderGridRef,
  dockContainerRef,
  dockGridRef,
  tileRefs,
  dockSlotRefs,
  dockItemRefs,
  itemById,
  itemsRef,
  outerSlotsRef,
  dockKeysRef,
  currentPageRef,
  pageSizeRef,
}: PagedDragGeometryControllerParams) {
  const resolveItemById = (id: string): GridItem | undefined =>
    itemById.get(id) ?? itemsRef.current.find(item => getId(item) === id)

  const resolveOuterItemsForLayout = (
    dockOrder: Array<string | null> = dockKeysRef.current
  ): GridItem[] => {
    const outerItemIds = resolveOuterItemIds(itemsRef.current.map(getId), dockOrder)
    return outerItemIds.flatMap(id => {
      const item = resolveItemById(id)
      return item ? [item] : []
    })
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
      const gridElement = folderGridRef.current
      return {
        gridElement,
        columns: Math.max(1, folderColumns),
        rows: resolveFolderGridRows(gridElement, folderColumns),
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

    const metrics = resolveGridMetrics('outer')
    if (!metrics.gridElement) return null
    const outerItems = resolveOuterItemsForLayout()
    const occupancy = buildTopLevelOccupancy(
      state.workingOrder,
      outerItems,
      metrics.columns,
      pageSizeRef.current
    )
    const draggingSpan = getGridItemSpan(state.draggingItem)
    if (draggingSpan.cols === 1 && draggingSpan.rows === 1) {
      const rawIndex = resolveNearestSlotIndexByMetrics(state, metrics, gridGap, options)
      if (
        rawIndex !== null &&
        canPlaceItemAtAnchorIndex(
          state.workingOrder,
          outerItems,
          rawIndex,
          draggingSpan,
          metrics.columns,
          pageSizeRef.current,
          occupancy
        )
      ) {
        return rawIndex
      }
    }

    return findNearestValidAnchorIndex({
      pointerX: state.pointerX,
      pointerY: state.pointerY,
      gridRect: metrics.gridElement.getBoundingClientRect(),
      slots: state.workingOrder,
      items: outerItems,
      draggingItem: state.draggingItem,
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

  const resolveRawOuterCellIndex = (
    state: DragState,
    options?: { allowOutside?: boolean }
  ): number | null =>
    state.context === 'outer'
      ? resolveNearestSlotIndexByMetrics(state, resolveGridMetrics('outer'), gridGap, options)
      : null

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
    const metrics = resolveGridMetrics('outer')
    const draggingSpan = getGridItemSpan(state.draggingItem)
    return draggingSpan.cols === 1 && draggingSpan.rows === 1
      ? resolveNearestSlotIndexByContext(state, options)
      : resolveNearestAnchorIndexByMetrics(state, metrics, gridGap, draggingSpan, options)
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
      state,
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
    const targetItem = state.context === 'outer' ? (resolveItemById(hit.targetId) ?? null) : null
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

  const tryApplyTopLevelEvasion = (
    state: DragState,
    overlapHit: OuterOverlapHit | null,
    now: number
  ): DragState => {
    const cooledDownSinceLastEvasion =
      state.lastEvasionAt === null || now - state.lastEvasionAt >= evasionCooldownMs
    if (!cooledDownSinceLastEvasion) return state

    const draggingSpan = getGridItemSpan(state.draggingItem)
    const targetItem = overlapHit ? resolveItemById(overlapHit.targetId) : null
    const targetSpan = targetItem ? getGridItemSpan(targetItem) : null
    const isSingleCellIconDrag =
      state.context === 'outer' &&
      state.draggingIds.length === 1 &&
      state.draggingItem.kind === 'icon' &&
      draggingSpan.cols === 1 &&
      draggingSpan.rows === 1

    // CellLayout mode 1 rebuilds each new candidate from mOccupied. If a
    // new alarm fires after the pointer leaves the temporary cell, restore the
    // prior preview first, then solve the latest pointer against that base.
    const baseOrder = isSingleCellIconDrag ? state.evasionBaseOrder : null
    if (baseOrder) {
      const baseState: DragState = {
        ...state,
        workingOrder: baseOrder,
        evasionBaseOrder: null,
        centerStartedAt: null,
        dwellStartedAt: null,
        folderPreviewTargetId: null,
        hoverTargetId: null,
        hoverZone: null,
        hoverIou: 0,
        lastEvasionSignature: null,
        lastEvasionTriggerPointer: null,
        lastEvasionAt: now,
      }
      const baseHit = findTopLevelMaxOverlapHit(baseState)
      const baseTarget = baseHit ? resolveItemById(baseHit.targetId) : null
      if (!baseHit || baseTarget?.kind !== 'icon') {
        return applyRebasedEvasionPreview(state, baseOrder, null, null, now, null)
      }

      const rebasedResult = applyTopLevelEvasion(baseState, baseHit)
      return applyRebasedEvasionPreview(state, baseOrder, baseHit, rebasedResult.order, now, null)
    }

    if (!overlapHit) return state

    const usesCommittedIconLayout =
      isSingleCellIconDrag &&
      targetItem?.kind === 'icon' &&
      targetSpan?.cols === 1 &&
      targetSpan.rows === 1
    const evasionResult = applyTopLevelEvasion(state, overlapHit)
    const preview = applyEvasionPreview(
      state,
      evasionResult.order,
      overlapHit,
      now,
      state.context === 'dock' ? overlapHit.targetIndex : null
    )
    if (preview === state || !usesCommittedIconLayout) return preview

    return {
      ...preview,
      evasionBaseOrder: [...state.workingOrder],
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
    resolveRawOuterCellIndex,
    resolveNearestDropOrderByContext,
    resolveCandidateAnchorIndexByContext,
    findTopLevelMaxOverlapHit,
    resolveTopLevelOverlapPreviewIndex,
    tryApplyTopLevelEvasion,
  }
}
