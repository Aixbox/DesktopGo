import type { MutableRefObject } from 'react'
import type { EvasionDirection, GridItem, HoverZone } from '../model'
import { getGridItemSpan, getId } from '../model'
import { DRAG_HOLE_ID, areSlotsEqual } from '../domain/slots'
import { moveDragHoleToIndex } from '../domain/evasionPolicy'
import { clampNumber, classifyZone, getRectArea, getRectIntersection } from '../domain/geometry'
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
import { OUTER_DRAG_RULES } from '../constants'
import type { DragHit, DragState, OuterOverlapHit } from '../state/types'
import {
  findDockMaxOverlapHit,
  resolveDockNearestSlotIndex,
  resolveDockTopLevelContextAtPoint,
} from '../hooks/dockDragHitTesting'
import {
  buildCompactOuterBaseOrder,
  buildCompactOuterPreviewItems as createCompactOuterPreviewItems,
  resolveCompactOuterPreview,
} from './scrollCompactPreviewPolicy'
import {
  buildScrollGroupDragPreviewOrder,
  buildScrollGroupEntries,
  isPointInsideScrollDropTarget,
  resolveScrollDropPosition,
} from './scrollGroupLayout'
import { compactOuterSlotsWithinPages, maskDraggingIdsInCompactOrder } from './scrollTopLevelLayout'

interface ScrollableDragGeometryControllerParams {
  gridGap: number
  evasionRearmDistance: number
  evasionCooldownMs: number
  iconImageSize: number
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  folderColumns: number
  folderItemWidth: number
  folderItemHeight: number
  folderOrderLength: number
  isCompactOuterDrop: boolean
  getOuterMinPageCount?: () => number
  itemById: Map<string, GridItem>
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
  dragPointerRef: MutableRefObject<{ pointerX: number; pointerY: number } | null>
  compactOuterDragBaseOrderRef: MutableRefObject<Array<string | null> | null>
  compactOuterDragBaseWithoutDraggingRef: MutableRefObject<Array<string | null> | null>
  compactOuterPreviewItemsRef: MutableRefObject<GridItem[] | null>
  compactOuterPreviewResultRef: MutableRefObject<{
    signature: string
    order: Array<string | null>
    previewSlotIndex: number | null
  } | null>
  compactScrollLastHitPointRef: MutableRefObject<{ x: number; y: number } | null>
  compactScrollLastHitIdRef: MutableRefObject<string | null>
  getOuterGridElementAtPoint?: (
    x: number,
    y: number
  ) => { element: HTMLDivElement; pageIndex: number } | null
  getActiveScrollGroupItemIds?: () => string[]
}

export function useScrollableDragGeometryController(
  params: ScrollableDragGeometryControllerParams
) {
  const {
    gridGap,
    evasionRearmDistance,
    evasionCooldownMs,
    iconImageSize,
    columns,
    rows,
    itemWidth,
    itemHeight,
    folderColumns,
    folderItemWidth,
    folderItemHeight,
    folderOrderLength,
    isCompactOuterDrop,
    getOuterMinPageCount,
    itemById,
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
    dragPointerRef,
    compactOuterDragBaseOrderRef,
    compactOuterDragBaseWithoutDraggingRef,
    compactOuterPreviewItemsRef,
    compactOuterPreviewResultRef,
    compactScrollLastHitPointRef,
    compactScrollLastHitIdRef,
    getOuterGridElementAtPoint,
    getActiveScrollGroupItemIds,
  } = params

  const resolveAllItemIds = () => itemsRef.current.map(getId)

  const resolveOuterItemsForLayout = (dockOrder: Array<string | null> = dockKeysRef.current) => {
    const outerItemIds = resolveOuterItemIds(resolveAllItemIds(), dockOrder)
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

  const resolvePagedOuterTopLevelOrder = (): Array<string | null> => {
    const outerItems = resolveOuterItemsForLayout()
    return normalizeOuterSlots(
      outerSlotsRef.current,
      outerItems,
      pageSizeRef.current,
      Math.max(1, columns)
    )
  }

  const resolveCompactOuterTopLevelOrder = (): Array<string | null> => {
    const outerItems = resolveOuterItemsForLayout()
    const normalized = normalizeOuterSlots(
      outerSlotsRef.current,
      outerItems,
      pageSizeRef.current,
      Math.max(1, columns)
    )
    return compactOuterSlotsWithinPages(
      normalized,
      outerItems,
      pageSizeRef.current,
      Math.max(1, columns),
      getOuterMinPageCount?.()
    )
  }

  const resolveOuterTopLevelOrder = (): Array<string | null> =>
    isCompactOuterDrop ? resolveCompactOuterTopLevelOrder() : resolvePagedOuterTopLevelOrder()

  const resolveTopLevelOrder = (context: 'outer' | 'dock'): Array<string | null> =>
    context === 'dock' ? resolveDockItemOrder() : resolveOuterTopLevelOrder()

  const resolveTopLevelContextAtPoint = (x: number, y: number): 'outer' | 'dock' =>
    resolveDockTopLevelContextAtPoint({ x, y, dockContainer: dockContainerRef.current })

  const resolveActiveScrollGroupOrder = (state: DragState): string[] | null => {
    if (!isCompactOuterDrop || !getActiveScrollGroupItemIds) return null
    const availableIds = new Set(resolveCompactOuterPreviewItems(state).map(getId))
    const order: string[] = []
    const consumed = new Set<string>()
    const append = (id: string) => {
      if (consumed.has(id) || !availableIds.has(id)) return
      consumed.add(id)
      order.push(id)
    }
    getActiveScrollGroupItemIds().forEach(append)
    state.draggingIds.forEach(append)
    return order
  }

  const resolveScrollGroupOrderFromWorkingOrder = (
    state: DragState,
    workingOrder: Array<string | null>
  ): string[] | null => {
    if (!isCompactOuterDrop || !getActiveScrollGroupItemIds || !state.scrollGroupOrder) {
      return state.scrollGroupOrder ?? null
    }
    return buildScrollGroupDragPreviewOrder({
      groupItemIds: getActiveScrollGroupItemIds(),
      workingOrder,
      draggingIds: state.draggingIds,
      availableIds: new Set(resolveCompactOuterPreviewItems(state).map(getId)),
    })
  }

  const resolveCompactOuterPreviewItems = (state: DragState): GridItem[] => {
    if (compactOuterPreviewItemsRef.current) return compactOuterPreviewItemsRef.current
    const previewItems = createCompactOuterPreviewItems({
      state,
      outerItems: resolveOuterItemsForLayout(),
      allItems: itemsRef.current,
      itemById,
    })
    compactOuterPreviewItemsRef.current = previewItems
    return previewItems
  }

  const compactOuterPreviewOrderWithoutDragging = (state: DragState): Array<string | null> => {
    if (compactOuterDragBaseWithoutDraggingRef.current) {
      return compactOuterDragBaseWithoutDraggingRef.current
    }

    const sourceOrder = compactOuterDragBaseOrderRef.current ?? resolveCompactOuterTopLevelOrder()
    const compacted = buildCompactOuterBaseOrder({
      state,
      sourceOrder,
      previewItems: resolveCompactOuterPreviewItems(state),
      pageSize: pageSizeRef.current,
      columns,
      minPageCount: getOuterMinPageCount?.(),
    })
    compactOuterDragBaseWithoutDraggingRef.current = compacted
    return compacted
  }

  const buildCompactOuterPreviewOrder = (
    state: DragState,
    hit: OuterOverlapHit
  ): { order: Array<string | null>; previewSlotIndex: number | null } => {
    const currentPreviewContainsDrag = state.draggingIds.some(id => state.workingOrder.includes(id))
    const sourceOrder = currentPreviewContainsDrag
      ? state.workingOrder
      : (compactOuterDragBaseOrderRef.current ?? resolveCompactOuterTopLevelOrder())
    const resolved = resolveCompactOuterPreview({
      state,
      targetId: hit.targetId,
      zone: hit.zone,
      baseOrder: compactOuterPreviewOrderWithoutDragging(state),
      sourceOrder,
      previewItems: resolveCompactOuterPreviewItems(state),
      pageSize: pageSizeRef.current,
      columns,
      minPageCount: getOuterMinPageCount?.(),
      cached: compactOuterPreviewResultRef.current,
    })
    compactOuterPreviewResultRef.current = resolved.cache
    return resolved.preview
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

    if (!isCompactOuterDrop) {
      return {
        gridElement: gridRef.current,
        columns: Math.max(1, columns),
        rows: Math.max(1, rows),
        itemWidth,
        itemHeight,
        pageOffset: currentPageRef.current * pageSizeRef.current,
      }
    }

    const outerGridElement = getOuterGridElementAtPoint
      ? (getOuterGridElementAtPoint(
          dragPointerRef.current?.pointerX ?? 0,
          dragPointerRef.current?.pointerY ?? 0
        )?.element ?? gridRef.current)
      : gridRef.current
    const outerRows = outerGridElement
      ? Math.max(1, Math.ceil(outerGridElement.scrollHeight / Math.max(1, itemHeight + gridGap)))
      : Math.max(1, rows)

    return {
      gridElement: outerGridElement,
      columns: Math.max(1, columns),
      rows: outerRows,
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
        const rawTargetId =
          node.querySelector<HTMLElement>('[data-dock-key]')?.dataset.dockKey ??
          state.workingOrder[index]
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

    if (state.context === 'outer' && isCompactOuterDrop && getOuterGridElementAtPoint) {
      const resolved = getOuterGridElementAtPoint(x, y)
      if (resolved) {
        currentPageRef.current = resolved.pageIndex
        return findHitByMetrics(
          state,
          x,
          y,
          {
            gridElement: resolved.element,
            columns: Math.max(1, columns),
            rows:
              isCompactOuterDrop && resolved.element
                ? Math.max(
                    1,
                    Math.ceil(resolved.element.scrollHeight / Math.max(1, itemHeight + gridGap))
                  )
                : Math.max(1, rows),
            itemWidth,
            itemHeight,
            pageOffset: resolved.pageIndex * pageSizeRef.current,
          },
          gridGap
        )
      }
    }

    return findHitByMetrics(state, x, y, resolveGridMetrics(state.context), gridGap)
  }

  const resolveNearestSlotIndexByContext = (
    state: DragState,
    options?: { allowOutside?: boolean }
  ): number | null => {
    if (state.context === 'outer') {
      if (isCompactOuterDrop) {
        return null
      }
      const metrics = resolveGridMetrics('outer')
      const gridElement = metrics.gridElement
      if (!gridElement) return null
      const outerItems = resolveOuterItemsForLayout()

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
            pageSizeRef.current
          )
        ) {
          return rawIndex
        }

        return findNearestValidAnchorIndex({
          pointerX: state.pointerX,
          pointerY: state.pointerY,
          gridRect: gridElement.getBoundingClientRect(),
          slots: state.workingOrder,
          items: outerItems,
          draggingItem: state.draggingItem,
          columns: metrics.columns,
          rows: metrics.rows,
          itemWidth: metrics.itemWidth,
          itemHeight: metrics.itemHeight,
          pageOffset: metrics.pageOffset,
          pageSize: pageSizeRef.current,
          gridGap: gridGap,
          allowOutside: options?.allowOutside,
        })
      }

      return findNearestValidAnchorIndex({
        pointerX: state.pointerX,
        pointerY: state.pointerY,
        gridRect: gridElement.getBoundingClientRect(),
        slots: state.workingOrder,
        items: outerItems,
        draggingItem: state.draggingItem,
        columns: metrics.columns,
        rows: metrics.rows,
        itemWidth: metrics.itemWidth,
        itemHeight: metrics.itemHeight,
        pageOffset: metrics.pageOffset,
        pageSize: pageSizeRef.current,
        gridGap: gridGap,
        allowOutside: options?.allowOutside,
      })
    }

    if (state.context === 'dock') {
      return resolveDockNearestSlotIndex({
        state,
        dockContainer: dockContainerRef.current,
        slotNodes: dockSlotRefs.current,
        allowOutside: options?.allowOutside,
      })
    }

    return resolveNearestSlotIndexByMetrics(
      state,
      resolveGridMetrics(state.context),
      gridGap,
      options
    )
  }

  const resolveNearestDropOrderByContext = (state: DragState): Array<string | null> => {
    const globalSlotIndex = resolveNearestSlotIndexByContext(state, { allowOutside: true })
    if (globalSlotIndex === null) return state.workingOrder
    return moveDragHoleToIndex(state.workingOrder, globalSlotIndex)
  }

  const resolveCandidateAnchorIndexByContext = (
    state: DragState,
    options?: { allowOutside?: boolean }
  ): number | null => {
    if (state.context !== 'outer') {
      return resolveNearestSlotIndexByContext(state, options)
    }

    if (isCompactOuterDrop) {
      return null
    }

    const metrics = resolveGridMetrics('outer')
    const draggingSpan = getGridItemSpan(state.draggingItem)
    if (draggingSpan.cols === 1 && draggingSpan.rows === 1) {
      return resolveNearestSlotIndexByContext(state, options)
    }

    return resolveNearestAnchorIndexByMetrics(state, metrics, gridGap, draggingSpan, options)
  }

  const findCompactScrollGroupOverlapHit = (state: DragState): OuterOverlapHit | null => {
    const order = state.scrollGroupOrder
    const gridElement = resolveGridMetrics('outer').gridElement
    if (!order || order.length === 0 || !gridElement) return null

    const itemMap = new Map(resolveCompactOuterPreviewItems(state).map(item => [getId(item), item]))
    const entries = buildScrollGroupEntries(order, itemMap, Math.max(1, columns))
    const gridRect = gridElement.getBoundingClientRect()
    const strideX = itemWidth + gridGap
    const strideY = itemHeight + gridGap
    const draggingSpan = getGridItemSpan(state.draggingItem)
    const dragWidth = draggingSpan.cols * itemWidth + Math.max(0, draggingSpan.cols - 1) * gridGap
    const dragHeight = draggingSpan.rows * itemHeight + Math.max(0, draggingSpan.rows - 1) * gridGap
    const offsetX = clampNumber(state.offsetX, 0, dragWidth)
    const offsetY = clampNumber(state.offsetY, 0, dragHeight)
    const dragRect = new DOMRect(
      state.pointerX - offsetX,
      state.pointerY - offsetY,
      dragWidth,
      dragHeight
    )
    // WeTab resolves small tiles from the dragged clone's center and larger tiles from the
    // pointer itself. It does not start a target dwell merely because two rectangles overlap.
    const point =
      draggingSpan.cols === 1 && draggingSpan.rows === 1
        ? {
            x: dragRect.left + dragRect.width / 2,
            y: dragRect.top + dragRect.height / 2,
          }
        : { x: state.pointerX, y: state.pointerY }
    const getEntryRect = (entry: (typeof entries)[number]) =>
      new DOMRect(
        gridRect.left + entry.col * strideX,
        gridRect.top + entry.row * strideY,
        entry.span.cols * itemWidth + Math.max(0, entry.span.cols - 1) * gridGap,
        entry.span.rows * itemHeight + Math.max(0, entry.span.rows - 1) * gridGap
      )
    const draggedIdSet = new Set(state.draggingIds)
    const candidates = entries.filter(entry => !draggedIdSet.has(entry.id))
    const cachedPoint = compactScrollLastHitPointRef.current
    const cachedId = compactScrollLastHitIdRef.current
    let resolvedEntry =
      cachedPoint && cachedId && Math.hypot(point.x - cachedPoint.x, point.y - cachedPoint.y) < 10
        ? (candidates.find(
            entry =>
              entry.id === cachedId && isPointInsideScrollDropTarget(point, getEntryRect(entry))
          ) ?? null)
        : null

    if (!resolvedEntry) {
      resolvedEntry =
        candidates.find(entry => isPointInsideScrollDropTarget(point, getEntryRect(entry))) ?? null
    }
    if (!resolvedEntry) return null

    const targetRect = getEntryRect(resolvedEntry)
    const overlapRect = getRectIntersection(dragRect, targetRect)
    if (!overlapRect) return null
    compactScrollLastHitPointRef.current = point
    compactScrollLastHitIdRef.current = resolvedEntry.id
    return {
      targetId: resolvedEntry.id,
      targetIndex: order.indexOf(resolvedEntry.id),
      targetRect,
      overlapRect,
      iou: getRectArea(overlapRect) / Math.max(1, getRectArea(dragRect)),
      intersectionArea: getRectArea(overlapRect),
      centerManhattanDistance:
        Math.abs(point.x - (targetRect.left + targetRect.width / 2)) +
        Math.abs(point.y - (targetRect.top + targetRect.height / 2)),
      zone: classifyZone(targetRect, point.x, point.y),
    }
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

    if (!isCompactOuterDrop) {
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
        gridGap: gridGap,
        dragWidth,
        dragHeight,
        pageSize: pageSizeRef.current,
        currentPage: currentPageRef.current,
        tileRefs: tileRefs.current,
        items: resolveOuterItemsForLayout(),
      })
    }

    if (state.scrollGroupOrder) {
      return findCompactScrollGroupOverlapHit(state)
    }

    if (getOuterGridElementAtPoint) {
      const resolved = getOuterGridElementAtPoint(state.pointerX, state.pointerY)
      if (resolved) {
        currentPageRef.current = resolved.pageIndex
      }
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
    const hitState = {
      ...state,
      workingOrder: maskDraggingIdsInCompactOrder(state.workingOrder, state.draggingIds),
    }
    const hitItems = resolveCompactOuterPreviewItems(state)

    return findOuterMaxOverlapHitByMetrics({
      state: hitState,
      gridElement: metrics.gridElement,
      columns: metrics.columns,
      rows: metrics.rows,
      itemWidth: metrics.itemWidth,
      itemHeight: metrics.itemHeight,
      gridGap: gridGap,
      dragWidth,
      dragHeight,
      pageSize: pageSizeRef.current,
      currentPage: currentPageRef.current,
      tileRefs: tileRefs.current,
      items: hitItems,
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
    if (isCompactOuterDrop) return overlapHit.targetIndex
    const draggingSpan = getGridItemSpan(state.draggingItem)
    if (draggingSpan.cols > 1 || draggingSpan.rows > 1) {
      return candidateAnchorIndex
    }
    const targetSpan = getGridItemSpan(target)
    if (targetSpan.cols === 1 && targetSpan.rows === 1) return overlapHit.targetIndex
    return resolvePreviewIndexWithinTargetSpan(state, overlapHit, targetSpan)
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
      ) >= evasionRearmDistance
    const cooledDownSinceLastEvasion =
      state.lastEvasionAt === null || now - state.lastEvasionAt >= evasionCooldownMs
    if (!movedSinceLastEvasion || !cooledDownSinceLastEvasion) return state

    const evasionResult = applyTopLevelEvasion(state, overlapHit)
    const nextEvasionSignature = `${overlapHit.targetId}:${state.previewSlotIndex ?? overlapHit.targetIndex}:${evasionResult.direction ?? 'fallback'}`
    if (nextEvasionSignature === state.lastEvasionSignature) return state
    if (areSlotsEqual(evasionResult.order, state.workingOrder)) return state

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
    }
  }

  const resolveCompactScrollHoverZone = (
    state: DragState,
    target: GridItem,
    overlapHit: OuterOverlapHit
  ): HoverZone => {
    const mergeAllowed =
      state.draggingItem.kind === 'icon' && (target.kind === 'icon' || target.kind === 'folder')
    const draggingSpan = getGridItemSpan(state.draggingItem)
    const dragWidth = draggingSpan.cols * itemWidth + Math.max(0, draggingSpan.cols - 1) * gridGap
    const dragHeight = draggingSpan.rows * itemHeight + Math.max(0, draggingSpan.rows - 1) * gridGap
    const dragCenter = {
      x: state.pointerX - clampNumber(state.offsetX, 0, dragWidth) + dragWidth / 2,
      y: state.pointerY - clampNumber(state.offsetY, 0, dragHeight) + dragHeight / 2,
    }
    const position = resolveScrollDropPosition(dragCenter, overlapHit.targetRect, mergeAllowed)
    return position === 'middle' ? 'center' : position === 'before' ? 'left' : 'right'
  }

  return {
    resolveOuterItemsForLayout,
    resolveDockItemOrder,
    isDraggingFromDock,
    seedMissingOuterDragCenters,
    resolvePagedOuterTopLevelOrder,
    resolveCompactOuterTopLevelOrder,
    resolveTopLevelOrder,
    resolveTopLevelContextAtPoint,
    resolveActiveScrollGroupOrder,
    resolveScrollGroupOrderFromWorkingOrder,
    resolveCompactOuterPreviewItems,
    compactOuterPreviewOrderWithoutDragging,
    buildCompactOuterPreviewOrder,
    findHitByContext,
    resolveNearestSlotIndexByContext,
    resolveNearestDropOrderByContext,
    resolveCandidateAnchorIndexByContext,
    findCompactScrollGroupOverlapHit,
    findTopLevelMaxOverlapHit,
    resolveTopLevelOverlapPreviewIndex,
    tryApplyTopLevelEvasion,
    resolveCompactScrollHoverZone,
  }
}
