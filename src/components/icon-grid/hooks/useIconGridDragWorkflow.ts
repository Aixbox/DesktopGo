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
import { getGridItemSpan, getId } from '../model'
import { DRAG_HOLE_ID, areSlotsEqual } from '../domain/slots'
import { moveDragHoleToIndex } from '../domain/evasionPolicy'
import { getFolderChildrenById } from '../domain/folderPolicy'
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
import { OUTER_DRAG_RULES } from '../constants'
import { usePointerDragController } from './usePointerDragController'
import { useEdgeAutoPaging } from './useEdgeAutoPaging'
import { useDragDropCommit } from './useDragDropCommit'
import { resetOuterInteraction } from '../state/dragMachine'
import type {
  DragHit,
  DragState,
  FolderDropFlight,
  MultiDropFlightItem,
  OuterOverlapHit,
  PendingDrag,
} from '../state/types'

interface DragWorkflowConfig {
  gridGap: number
  dragEdgeSwitchZone: number
  dragEdgeSwitchMs: number
  dragLongPressMs: number
  dragPendingMoveTolerance: number
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
  selectedIconKeys: string[]
  unselectIcons: (keys: string[]) => void
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
  openFolderId: string | null
  setOpenFolderId: Dispatch<SetStateAction<string | null>>
}

interface UseIconGridDragWorkflowResult {
  dragState: DragState | null
  dragRef: MutableRefObject<DragState | null>
  dragPointerRef: MutableRefObject<{ pointerX: number; pointerY: number } | null>
  folderDropFlight: FolderDropFlight | null
  multiDropFlight: MultiDropFlightItem[] | null
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
  syncDockDragPreview: () => void
}

export function useIconGridDragWorkflow({
  config,
  selectionMode,
  selectedIconKeys,
  unselectIcons,
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
  openFolderId,
  setOpenFolderId,
}: UseIconGridDragWorkflowParams): UseIconGridDragWorkflowResult {
  const selectedIconKeySet = new Set(selectedIconKeys)
  const pendingRef = useRef<PendingDrag | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const beginDragFnRef = useRef<(pending: PendingDrag, x: number, y: number) => void>(
    () => undefined
  )
  const onDragMoveFnRef = useRef<(pointerId: number, x: number, y: number) => void>(() => undefined)
  const flushDragMoveFnRef = useRef<(pointerId: number, x: number, y: number) => void>(
    () => undefined
  )
  const finishDragFnRef = useRef<(pointerId: number) => void>(() => undefined)
  const clearPendingFnRef = useRef<() => void>(() => undefined)
  const abortPendingFnRef = useRef<(pointerId: number) => void>(() => undefined)
  const cancelDragFnRef = useRef<(pointerId: number) => void>(() => undefined)
  const timerRef = useRef<number | null>(null)
  const outerDwellTimerRef = useRef<number | null>(null)
  const outerDwellTargetIdRef = useRef<string | null>(null)
  const suppressClickUntilRef = useRef(0)
  const dragMoveRafRef = useRef<number | null>(null)
  const queuedDragMoveRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const dragPointerRef = useRef<{ pointerX: number; pointerY: number } | null>(null)
  const renderedDragStateRef = useRef<DragState | null>(null)

  const [dragState, setDragState] = useState<DragState | null>(null)

  useEffect(() => {
    renderedDragStateRef.current = dragState
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

  const cancelQueuedDragMove = () => {
    queuedDragMoveRef.current = null
    if (dragMoveRafRef.current !== null) {
      cancelAnimationFrame(dragMoveRafRef.current)
      dragMoveRafRef.current = null
    }
  }

  const syncRawDragPointer = (pointerId: number, x: number, y: number) => {
    if (dragRef.current?.pointerId !== pointerId) return
    if (dragPointerRef.current) {
      dragPointerRef.current.pointerX = x
      dragPointerRef.current.pointerY = y
      return
    }
    dragPointerRef.current = { pointerX: x, pointerY: y }
  }

  const syncDragRuntime = (next: DragState | null) => {
    dragRef.current = next
    if (!next) {
      dragPointerRef.current = null
      return
    }

    if (dragPointerRef.current) {
      dragPointerRef.current.pointerX = next.pointerX
      dragPointerRef.current.pointerY = next.pointerY
      return
    }

    dragPointerRef.current = { pointerX: next.pointerX, pointerY: next.pointerY }
  }

  const areDraggingIdsEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((id, index) => id === right[index])

  const hasRenderableDragStateChanged = (previous: DragState | null, next: DragState | null) => {
    if (previous === next) return false
    if (!previous || !next) return previous !== next
    if (previous.context !== next.context) return true
    if (previous.sourceFolderId !== next.sourceFolderId) return true
    if (previous.pointerId !== next.pointerId) return true
    if (previous.dragStartedAt !== next.dragStartedAt) return true
    if (previous.draggingId !== next.draggingId) return true
    if (previous.draggingItem !== next.draggingItem) return true
    if (!areDraggingIdsEqual(previous.draggingIds, next.draggingIds)) return true
    if (!areSlotsEqual(previous.workingOrder, next.workingOrder)) return true
    if (previous.sourceSlotIndex !== next.sourceSlotIndex) return true
    if (previous.previewSlotIndex !== next.previewSlotIndex) return true
    if (previous.dockPreviewIndex !== next.dockPreviewIndex) return true
    if (previous.hoverTargetId !== next.hoverTargetId) return true
    if (previous.hoverZone !== next.hoverZone) return true
    if (previous.folderPreviewTargetId !== next.folderPreviewTargetId) return true
    return previous.initialCenters !== next.initialCenters
  }

  const commitDragState: Dispatch<SetStateAction<DragState | null>> = update => {
    const previous = dragRef.current
    const next = typeof update === 'function' ? update(previous) : update
    syncDragRuntime(next)
    renderedDragStateRef.current = next
    setDragState(next)
  }

  const publishMoveDragState = (next: DragState | null) => {
    syncDragRuntime(next)
    if (!hasRenderableDragStateChanged(renderedDragStateRef.current, next)) return
    renderedDragStateRef.current = next
    setDragState(next)
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

  const resolveOuterItemsForLayout = (dockOrder: Array<string | null> = dockKeysRef.current) => {
    const outerItemIds = resolveOuterItemIds(resolveAllItemIds(), dockOrder)
    const outerItemIdSet = new Set(outerItemIds)
    return itemsRef.current.filter(item => outerItemIdSet.has(getId(item)))
  }

  const resolveDockItemOrder = (draggingId: string | null = null): string[] =>
    getDockItemKeys(dockKeysRef.current, draggingId)
  const isDraggingFromDock = (draggingId: string): boolean =>
    dockKeysRef.current.includes(draggingId)

  const resolveSelectedOuterDragIds = (sourceOrder: Array<string | null>, leadId: string) =>
    sourceOrder.filter((slot): slot is string => {
      if (!slot || slot === DRAG_HOLE_ID || slot === leadId) return false
      const candidate = itemById.get(slot)
      return Boolean(
        candidate && candidate.kind === 'icon' && selectedIconKeySet.has(candidate.key)
      )
    })

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
    const stepX = itemWidth + config.gridGap
    const stepY = itemHeight + config.gridGap
    const leadIndex = sourceOrder.indexOf(leadId)
    const leadPage = leadIndex >= 0 ? Math.floor(leadIndex / safePageSize) : currentPageRef.current
    const gridRect = gridRef.current?.getBoundingClientRect() ?? null
    const sideOffset = Math.min(28, Math.max(12, Math.round(iconConfig.imgSize * 0.24)))
    const stackOffset = Math.min(14, Math.max(6, Math.round(iconConfig.imgSize * 0.12)))
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

  const resolveOuterDragIds = (sourceOrder: Array<string | null>, leadId: string): string[] => {
    const leadItem = itemById.get(leadId)
    if (!selectionMode || !leadItem || leadItem.kind !== 'icon') {
      return [leadId]
    }
    const orderedSelectedIds = resolveSelectedOuterDragIds(sourceOrder, leadId)

    return [leadId, ...orderedSelectedIds]
  }

  const resolveSelectedFolderDragIds = ({
    preferredFolderId,
    leadId,
  }: {
    preferredFolderId: string | null
    leadId: string
  }): { folderId: string | null; ids: string[] } => {
    const folderIds: string[] = []
    if (preferredFolderId) {
      folderIds.push(preferredFolderId)
    }
    itemsRef.current.forEach(item => {
      if (item.kind !== 'folder') return
      if (item.id === preferredFolderId) return
      folderIds.push(item.id)
    })

    for (const folderId of folderIds) {
      const ids = getFolderChildrenById(itemsRef.current, folderId)
        .map(child => child.key)
        .filter(key => key !== leadId && selectedIconKeySet.has(key))
      if (ids.length > 0) {
        return { folderId, ids }
      }
    }

    return { folderId: null, ids: [] }
  }

  const resolveMixedSelectionDragIds = ({
    context,
    leadId,
    leadItem,
    sourceOrder,
    sourceFolderId,
  }: {
    context: 'outer' | 'folder' | 'dock'
    leadId: string
    leadItem: GridItem
    sourceOrder: Array<string | null>
    sourceFolderId: string | null
  }) => {
    if (!selectionMode || leadItem.kind !== 'icon') {
      return [leadId]
    }

    if (context === 'dock') {
      return [leadId]
    }

    const ordered: string[] = [leadId]
    const seen = new Set<string>(ordered)
    const pushIds = (ids: string[]) => {
      ids.forEach(id => {
        if (seen.has(id)) return
        seen.add(id)
        ordered.push(id)
      })
    }

    const outerSelectedIds =
      context === 'outer'
        ? resolveOuterDragIds(sourceOrder, leadId).slice(1)
        : resolveSelectedOuterDragIds(resolveTopLevelOrder('outer'), leadId)
    const folderSelection = resolveSelectedFolderDragIds({
      preferredFolderId: sourceFolderId ?? openFolderId,
      leadId,
    })
    const folderSelectedIds = folderSelection.ids

    if (context === 'folder') {
      pushIds(folderSelectedIds)
      pushIds(outerSelectedIds)
      return ordered
    }

    pushIds(outerSelectedIds)
    pushIds(folderSelectedIds)
    return ordered
  }

  const resolveSelectionSourceFolderId = (
    draggingIds: string[],
    fallbackFolderId: string | null
  ) => {
    if (fallbackFolderId) return fallbackFolderId
    for (const item of itemsRef.current) {
      if (item.kind !== 'folder') continue
      const childIds = new Set(item.children.map(child => child.key))
      if (draggingIds.some(id => childIds.has(id))) {
        return item.id
      }
    }
    return null
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
      const dockItemCount = Math.max(1, resolveDockItemOrder().length)
      return {
        gridElement: dockGridRef.current,
        columns: dockItemCount,
        rows: 1,
        itemWidth: iconConfig.imgSize,
        itemHeight: iconConfig.imgSize,
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

    return findHitByMetrics(state, x, y, resolveGridMetrics(state.context), config.gridGap)
  }

  const resolveNearestSlotIndexByContext = (
    state: DragState,
    options?: { allowOutside?: boolean }
  ): number | null => {
    if (state.context === 'outer') {
      const metrics = resolveGridMetrics('outer')
      const gridElement = metrics.gridElement
      if (!gridElement) return null
      const outerItems = resolveOuterItemsForLayout()

      const draggingSpan = getGridItemSpan(state.draggingItem)
      if (draggingSpan.cols === 1 && draggingSpan.rows === 1) {
        const rawIndex = resolveNearestSlotIndexByMetrics(state, metrics, config.gridGap, options)
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
          gridGap: config.gridGap,
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
        gridGap: config.gridGap,
        allowOutside: options?.allowOutside,
      })
    }

    if (state.context === 'dock') {
      const container = dockContainerRef.current
      const slotEntries = Array.from(dockSlotRefs.current.entries()).sort(([a], [b]) => a - b)
      if (!options?.allowOutside && container) {
        const rect = container.getBoundingClientRect()
        const dockBuffer = 16
        const withinHorizontal =
          state.pointerX >= rect.left - dockBuffer && state.pointerX <= rect.right + dockBuffer
        const withinVertical =
          state.pointerY >= rect.top - dockBuffer && state.pointerY <= rect.bottom + dockBuffer
        if (!withinHorizontal || !withinVertical) return null
      }

      const itemRects = resolveDockItemOrder(state.draggingId)
        .map((id, index) => ({
          index,
          rect: dockItemRefs.current.get(id)?.getBoundingClientRect() ?? null,
        }))
        .filter((entry): entry is { index: number; rect: DOMRect } => entry.rect !== null)

      if (itemRects.length === 0) {
        return slotEntries.length > 0 ? 0 : null
      }

      const pointerX = state.pointerX
      const firstCenter = itemRects[0].rect.left + itemRects[0].rect.width / 2
      if (pointerX <= firstCenter) return 0

      for (let index = 0; index < itemRects.length - 1; index += 1) {
        const currentCenter = itemRects[index].rect.left + itemRects[index].rect.width / 2
        const nextCenter = itemRects[index + 1].rect.left + itemRects[index + 1].rect.width / 2
        if (pointerX < (currentCenter + nextCenter) / 2) {
          return index + 1
        }
      }

      return itemRects.length
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

  const resolveCandidateAnchorIndexByContext = (
    state: DragState,
    options?: { allowOutside?: boolean }
  ): number | null => {
    if (state.context !== 'outer') {
      return resolveNearestSlotIndexByContext(state, options)
    }

    const metrics = resolveGridMetrics('outer')
    const draggingSpan = getGridItemSpan(state.draggingItem)
    if (draggingSpan.cols === 1 && draggingSpan.rows === 1) {
      return resolveNearestSlotIndexByContext(state, options)
    }

    return resolveNearestAnchorIndexByMetrics(state, metrics, config.gridGap, draggingSpan, options)
  }

  const findTopLevelMaxOverlapHit = (state: DragState): OuterOverlapHit | null => {
    if (state.context === 'folder') return null

    if (state.context === 'dock') {
      const metrics = resolveGridMetrics('dock')
      const dockPageSize = Math.max(1, state.workingOrder.length)
      return findOuterMaxOverlapHitByMetrics({
        state,
        gridElement: metrics.gridElement,
        columns: metrics.columns,
        rows: metrics.rows,
        itemWidth: metrics.itemWidth,
        itemHeight: metrics.itemHeight,
        gridGap: config.gridGap,
        dragWidth: iconConfig.imgSize,
        dragHeight: iconConfig.imgSize,
        pageSize: dockPageSize,
        currentPage: 0,
        tileRefs: dockItemRefs.current,
      })
    }

    const metrics = resolveGridMetrics('outer')
    const draggingSpan = getGridItemSpan(state.draggingItem)
    const dragWidth =
      state.draggingItem.kind === 'folder'
        ? draggingSpan.cols * metrics.itemWidth +
          Math.max(0, draggingSpan.cols - 1) * config.gridGap
        : iconConfig.imgSize
    const dragHeight =
      state.draggingItem.kind === 'folder'
        ? draggingSpan.rows * metrics.itemHeight +
          Math.max(0, draggingSpan.rows - 1) * config.gridGap
        : iconConfig.imgSize
    return findOuterMaxOverlapHitByMetrics({
      state,
      gridElement: metrics.gridElement,
      columns: metrics.columns,
      rows: metrics.rows,
      itemWidth: metrics.itemWidth,
      itemHeight: metrics.itemHeight,
      gridGap: config.gridGap,
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
      ) >= config.evasionRearmDistance
    const cooledDownSinceLastEvasion =
      state.lastEvasionAt === null || now - state.lastEvasionAt >= config.evasionCooldownMs
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

  const triggerTopLevelDwellEvasion = (expectedTargetId: string) => {
    const latest = dragRef.current
    if (!latest || latest.context === 'folder') return
    if (latest.context === 'dock' && !isDraggingFromDock(latest.draggingId)) return
    if (latest.hoverTargetId !== expectedTargetId) return
    if (latest.folderPreviewTargetId) return
    const isMultiOuterDrag = latest.context === 'outer' && latest.draggingIds.length > 1

    const overlapHit = findTopLevelMaxOverlapHit(latest)
    if (!overlapHit || overlapHit.targetId !== expectedTargetId) return

    const itemMap = resolveDragItemMap(latest)
    const source = latest.draggingItem
    const target = itemMap.get(overlapHit.targetId)
    if (!target) return

    const now = performance.now()
    const candidateAnchorIndex = resolveCandidateAnchorIndexByContext(latest, {
      allowOutside: true,
    })
    const previewSlotIndex = resolveTopLevelOverlapPreviewIndex(
      latest,
      target,
      overlapHit,
      resolveNearestSlotIndexByContext(latest, { allowOutside: true }),
      candidateAnchorIndex
    )
    const canAddToExistingFolder =
      source.kind === 'icon' &&
      target.kind === 'folder' &&
      overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold
    if (canAddToExistingFolder) {
      const nextState: DragState = {
        ...latest,
        previewSlotIndex,
        dockPreviewIndex: null,
        hoverTargetId: overlapHit.targetId,
        hoverZone: overlapHit.zone,
        hoverIou: overlapHit.iou,
        folderPreviewTargetId: overlapHit.targetId,
        dwellStartedAt: null,
        lastEvasionSignature: null,
      }
      publishMoveDragState(nextState)
      return
    }

    const canFolderPreview = !isMultiOuterDrag && source.kind === 'icon' && target.kind === 'icon'
    if (canFolderPreview && overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold) {
      const previewState: DragState = {
        ...latest,
        previewSlotIndex,
        dockPreviewIndex: null,
        hoverTargetId: overlapHit.targetId,
        hoverZone: overlapHit.zone,
        hoverIou: overlapHit.iou,
        folderPreviewTargetId: overlapHit.targetId,
        dwellStartedAt: null,
        lastEvasionSignature: null,
      }
      publishMoveDragState(previewState)
      return
    }

    const base: DragState = {
      ...latest,
      previewSlotIndex,
      dockPreviewIndex: null,
      hoverTargetId: overlapHit.targetId,
      hoverZone: overlapHit.zone,
      hoverIou: overlapHit.iou,
      folderPreviewTargetId: null,
    }
    const next = tryApplyTopLevelEvasion(base, overlapHit, now)
    publishMoveDragState(next)
  }

  const {
    folderDropFlight,
    multiDropFlight,
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
    dragRef,
    setDragState: commitDragState,
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
    const initialCenters = collectCenters(
      context === 'dock' ? dockItemRefs.current : tileRefs.current
    )
    state.draggingIds.forEach(id => {
      if (!initialCenters[id] && state.initialCenters[id]) {
        initialCenters[id] = state.initialCenters[id]
      }
    })
    initialCenters[state.draggingId] = { x, y }
    if (context === 'outer' && state.draggingIds.length > 1) {
      seedMissingOuterDragCenters({
        initialCenters,
        draggingIds: state.draggingIds,
        sourceOrder: nextOrder,
        leadId: state.draggingId,
        fallbackX: x,
        fallbackY: y,
      })
    }

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
          ? resolveDockItemOrder()
          : normalizeOuterSlots(
              outerSlotsRef.current,
              resolveOuterItemsForLayout(),
              pageSizeRef.current,
              Math.max(1, columns)
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

    const draggingIds = resolveMixedSelectionDragIds({
      context: pending.context,
      leadId: pending.itemId,
      leadItem: draggingItem,
      sourceOrder,
      sourceFolderId: pending.sourceFolderId,
    })
    const effectiveSourceFolderId = resolveSelectionSourceFolderId(
      draggingIds,
      pending.sourceFolderId
    )
    const selectedFolderDragIds = effectiveSourceFolderId
      ? getFolderChildrenById(itemsRef.current, effectiveSourceFolderId)
          .map(child => child.key)
          .filter(id => draggingIds.includes(id))
      : []

    const workingOrder: Array<string | null> = [...sourceOrder]
    if (pending.context === 'folder') {
      workingOrder[sourceIndex] = DRAG_HOLE_ID
    } else {
      workingOrder[sourceIndex] = null
    }
    const nextState: DragState = {
      context: pending.context,
      sourceFolderId: effectiveSourceFolderId,
      pointerId: pending.pointerId,
      dragStartedAt: performance.now(),
      draggingId: pending.itemId,
      draggingItem,
      draggingIds,
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
    if (pending.context !== 'folder' && selectedFolderDragIds.length > 0) {
      const folderCenters = collectCenters(folderTileRefs.current)
      const folderTileNode =
        effectiveSourceFolderId !== null
          ? tileRefs.current.get(`folder:${effectiveSourceFolderId}`)
          : null
      const folderTileRect = folderTileNode?.getBoundingClientRect() ?? null
      const collapsedFolderCenter = folderTileRect
        ? {
            x: folderTileRect.left + folderTileRect.width / 2,
            y: folderTileRect.top + folderTileRect.height / 2,
          }
        : null
      selectedFolderDragIds.forEach(id => {
        if (folderCenters[id]) {
          nextState.initialCenters[id] = folderCenters[id]
          return
        }
        if (!collapsedFolderCenter) return

        const stackOffset = Math.min(10, Math.max(4, Math.round(iconConfig.imgSize * 0.14)))
        const index = selectedFolderDragIds.indexOf(id)
        const columnOffset = (index % 2) - 0.5
        const rowOffset = Math.floor(index / 2)
        nextState.initialCenters[id] = {
          x: collapsedFolderCenter.x + columnOffset * stackOffset * 2,
          y: collapsedFolderCenter.y + rowOffset * stackOffset - stackOffset / 2,
        }
      })
      setOpenFolderId(null)
    }
    if (pending.context === 'outer' && draggingIds.length > 1) {
      seedMissingOuterDragCenters({
        initialCenters: nextState.initialCenters,
        draggingIds,
        sourceOrder,
        leadId: pending.itemId,
        fallbackX: x,
        fallbackY: y,
      })
    }

    if (pending.context === 'folder' && draggingIds.length > 1 && draggingItem.kind === 'icon') {
      commitDragState(moveDragToTopLevelContext(nextState, 'outer', x, y))
      clearPending()
      return
    }

    commitDragState(nextState)
    clearPending()
  }

  const processDragMove = (pointerId: number, x: number, y: number) => {
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
      const isMultiOuterDrag = baseState.context === 'outer' && baseState.draggingIds.length > 1
      const topLevelContext = isMultiOuterDrag ? 'outer' : resolveTopLevelContextAtPoint(x, y)
      if (!isMultiOuterDrag && baseState.context !== topLevelContext) {
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
      const candidateAnchorIndex = resolveCandidateAnchorIndexByContext(baseState, {
        allowOutside: true,
      })
      let overlapHit = findTopLevelMaxOverlapHit(baseState)
      if (overlapHit && baseState.draggingIds.includes(overlapHit.targetId)) {
        overlapHit = null
      }
      const draggingFromDock = isDraggingFromDock(baseState.draggingId)

      if (!overlapHit) {
        clearOuterDwellTimer()
        const resetState: DragState = {
          ...resetOuterInteraction(baseState, nearestSlotIndex),
          dockPreviewIndex: baseState.context === 'dock' ? nearestSlotIndex : null,
        }
        publishMoveDragState(resetState)
        return
      }

      const itemMap = resolveDragItemMap(baseState)
      const source = baseState.draggingItem
      const target = itemMap.get(overlapHit.targetId)
      if (!target) {
        clearOuterDwellTimer()
        const resetState: DragState = {
          ...resetOuterInteraction(baseState, nearestSlotIndex),
          dockPreviewIndex: baseState.context === 'dock' ? nearestSlotIndex : null,
        }
        publishMoveDragState(resetState)
        return
      }

      if (baseState.context === 'dock' && !draggingFromDock) {
        clearOuterDwellTimer()
        const stableDockPreviewIndex =
          baseState.dockPreviewIndex ?? nearestSlotIndex ?? overlapHit.targetIndex

        const canCreateFolder =
          source.kind === 'icon' &&
          target.kind === 'icon' &&
          overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold
        const canAddToExistingFolder =
          source.kind === 'icon' &&
          target.kind === 'folder' &&
          overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold

        if (canCreateFolder || canAddToExistingFolder) {
          const previewState: DragState = {
            ...baseState,
            previewSlotIndex: overlapHit.targetIndex,
            dockPreviewIndex: stableDockPreviewIndex,
            hoverTargetId: overlapHit.targetId,
            hoverZone: overlapHit.zone,
            hoverIou: overlapHit.iou,
            centerStartedAt: null,
            dwellStartedAt: null,
            folderPreviewTargetId: overlapHit.targetId,
            lastEvasionSignature: null,
          }
          publishMoveDragState(previewState)
          return
        }

        const insertState: DragState = {
          ...resetOuterInteraction(baseState, nearestSlotIndex),
          dockPreviewIndex: nearestSlotIndex,
          hoverTargetId: overlapHit.targetId,
          hoverZone: overlapHit.zone,
          hoverIou: overlapHit.iou,
        }
        publishMoveDragState(insertState)
        return
      }

      const now = performance.now()
      const previewSlotIndex = resolveTopLevelOverlapPreviewIndex(
        baseState,
        target,
        overlapHit,
        nearestSlotIndex,
        candidateAnchorIndex
      )
      const next: DragState = {
        ...baseState,
        previewSlotIndex,
        dockPreviewIndex: null,
        hoverTargetId: overlapHit.targetId,
        hoverZone: overlapHit.zone,
        hoverIou: overlapHit.iou,
        centerStartedAt: null,
      }

      const canFolderPreview = !isMultiOuterDrag && source.kind === 'icon' && target.kind === 'icon'
      if (canFolderPreview && overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold) {
        clearOuterDwellTimer()
        next.folderPreviewTargetId = overlapHit.targetId
        next.dwellStartedAt = null
        next.lastEvasionSignature = null
        publishMoveDragState(next)
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
        publishMoveDragState(next)
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

      publishMoveDragState(next)
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
      publishMoveDragState(resetState)
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
      publishMoveDragState(next)
      return
    }

    const itemMap = resolveDragItemMap(baseState)
    const source = baseState.draggingItem
    const target = itemMap.get(hit.targetId)
    if (!target) {
      publishMoveDragState(baseState)
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
      publishMoveDragState(next)
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
        publishMoveDragState(next)
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
    publishMoveDragState(next)
  }

  useEffect(() => {
    beginDragFnRef.current = beginDrag
  }, [beginDrag])

  const scheduleDragMove = (pointerId: number, x: number, y: number) => {
    syncRawDragPointer(pointerId, x, y)
    queuedDragMoveRef.current = { pointerId, x, y }
    if (dragMoveRafRef.current !== null) return
    dragMoveRafRef.current = window.requestAnimationFrame(() => {
      dragMoveRafRef.current = null
      const queued = queuedDragMoveRef.current
      queuedDragMoveRef.current = null
      if (!queued) return
      processDragMove(queued.pointerId, queued.x, queued.y)
    })
  }

  const flushDragMove = (pointerId: number, x: number, y: number) => {
    syncRawDragPointer(pointerId, x, y)
    queuedDragMoveRef.current = { pointerId, x, y }
    if (dragMoveRafRef.current !== null) {
      cancelAnimationFrame(dragMoveRafRef.current)
      dragMoveRafRef.current = null
    }
    const queued = queuedDragMoveRef.current
    queuedDragMoveRef.current = null
    if (!queued) return
    processDragMove(queued.pointerId, queued.x, queued.y)
  }

  useEffect(() => {
    onDragMoveFnRef.current = scheduleDragMove
    flushDragMoveFnRef.current = flushDragMove
  }, [flushDragMove, scheduleDragMove])

  useEffect(() => {
    finishDragFnRef.current = (pointerId: number) => {
      const completedDrag = dragRef.current
      if (!finishDrag(pointerId)) return
      if (completedDrag && completedDrag.draggingIds.length > 0) {
        unselectIcons(completedDrag.draggingIds)
      }
      clearOuterDwellTimer()
      suppressClickUntilRef.current = performance.now() + 300
    }
  }, [finishDrag, unselectIcons])

  useEffect(() => {
    clearPendingFnRef.current = clearPending
  }, [clearPending])

  useEffect(() => {
    abortPendingFnRef.current = (pointerId: number) => {
      if (pendingRef.current?.pointerId !== pointerId) return
      clearPending()
      suppressClickUntilRef.current = performance.now() + 300
    }
  }, [clearPending])

  useEffect(() => {
    cancelDragFnRef.current = (pointerId: number) => {
      if (dragRef.current?.pointerId !== pointerId) return
      clearOuterDwellTimer()
      clearEdgeSwitchTimer()
      cancelQueuedDragMove()
      commitDragState(null)
    }
  }, [clearEdgeSwitchTimer])

  usePointerDragController({
    pendingRef,
    dragRef,
    beginDragFnRef,
    onDragMoveFnRef,
    flushDragMoveFnRef,
    finishDragFnRef,
    clearPendingFnRef,
    abortPendingFnRef,
    cancelDragFnRef,
    pendingMoveTolerance: config.dragPendingMoveTolerance,
  })

  const handleTilePointerDown = (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => {
    if (event.button !== 0) return
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
    if (event.button !== 0) return
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
    commitDragState(next)
  }

  const syncDockDragPreview = () => {
    const current = dragRef.current
    if (!current || current.context !== 'dock') return

    const queued = queuedDragMoveRef.current
    if (queued && queued.pointerId === current.pointerId) {
      queuedDragMoveRef.current = null
      if (dragMoveRafRef.current !== null) {
        cancelAnimationFrame(dragMoveRafRef.current)
        dragMoveRafRef.current = null
      }
      processDragMove(queued.pointerId, queued.x, queued.y)
      return
    }

    const pointer = dragPointerRef.current
    processDragMove(
      current.pointerId,
      pointer?.pointerX ?? current.pointerX,
      pointer?.pointerY ?? current.pointerY
    )
  }

  useEffect(
    () => () => {
      clearTimer()
      clearOuterDwellTimer()
      clearEdgeSwitchTimer()
      cancelQueuedDragMove()
    },
    []
  )

  return {
    dragState,
    dragRef,
    dragPointerRef,
    folderDropFlight,
    multiDropFlight,
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
    syncDockDragPreview,
  }
}
