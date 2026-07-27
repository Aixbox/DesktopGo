import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import type { EvasionDirection, GridItem, HoverZone } from '../model'
import { getGridItemSpan, getId } from '../model'
import { DRAG_HOLE_ID, areSlotsEqual } from '../domain/slots'
import {
  getEvasionIntentSignature,
  getEvasionReadyDelay,
  moveDragHoleToIndex,
} from '../domain/evasionPolicy'
import {
  buildFolderAutoOpenOrder,
  canExitFolderThroughMask,
  FOLDER_AUTO_OPEN_DWELL_MS,
  FOLDER_EXIT_DWELL_MS,
  getFolderChildSelectionsByIds,
  getFolderChildrenById,
  isFolderAutoOpenIntentValid,
  isPointOutsideFolderContent,
} from '../domain/folderPolicy'
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
import { buildDockLinearPreviewOrder } from '../domain/dockDragPolicy'
import { resolveMixedSelectionDragIds } from '../domain/multiSelectionPolicy'
import { OUTER_DRAG_RULES } from '../constants'
import { usePointerDragController } from './usePointerDragController'
import { useEdgeAutoPaging } from './useEdgeAutoPaging'
import { useDragDropCommit } from './useDragDropCommit'
import { activateDragPointerCapture, releaseDragPointerCapture } from './dragPointerCapture'
import {
  findDockMaxOverlapHit,
  resolveDockNearestSlotIndex,
  resolveDockTopLevelContextAtPoint,
} from './dockDragHitTesting'
import { resetOuterInteraction } from '../state/dragMachine'
import {
  collectElementCenters as collectCenters,
  buildDragItemMap,
  getFolderIconMapById as getFolderMapById,
  hasRenderableDragStateChanged,
  seedMissingInitialCenters,
} from '../domain/dragWorkflowShared'
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
  evasionDwellMs: number
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
  onBeforeOuterPreviewChange?: () => void
  onOpenFolder?: (folderId: string) => void
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
  handleTileClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  clearEdgeSwitchTimer: () => void
  clearOuterDragInteractionForPageSwitch: () => void
  syncDockDragPreview: () => void
  dragEdgeDirection: import('./useEdgeAutoPaging').DragEdgeDirection
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
  onBeforeOuterPreviewChange,
  onOpenFolder,
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
  const outerDwellIntentRef = useRef<{ targetId: string; zone: HoverZone } | null>(null)
  const folderAutoOpenTimerRef = useRef<number | null>(null)
  const folderAutoOpenTargetIdRef = useRef<string | null>(null)
  const folderExitTimerRef = useRef<number | null>(null)
  const dragStartedInFolderRef = useRef(false)
  const enteredFolderContentRef = useRef(false)
  const suppressClickUntilRef = useRef(0)
  const dragMoveRafRef = useRef<number | null>(null)
  const queuedDragMoveRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const dragPointerRef = useRef<{ pointerX: number; pointerY: number } | null>(null)
  const renderedDragStateRef = useRef<DragState | null>(null)
  const pendingPointerCaptureTargetRef = useRef<HTMLElement | null>(null)
  const dragPointerCaptureTargetRef = useRef<HTMLElement | null>(null)

  const [dragState, setDragState] = useState<DragState | null>(null)

  useEffect(() => {
    renderedDragStateRef.current = dragState
  }, [dragState])

  const { clearEdgeSwitchTimer, maybeHandleOuterEdgeSwitch, dragEdgeDirection } = useEdgeAutoPaging(
    {
      dragEdgeSwitchZone: config.dragEdgeSwitchZone,
      dragEdgeSwitchMs: config.dragEdgeSwitchMs,
      containerRef,
      dragRef,
      setDragState,
      currentPageRef,
      setCurrentPage,
      pageSizeRef,
    }
  )

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const clearPending = () => {
    const pendingPointerId = pendingRef.current?.pointerId
    pendingRef.current = null
    pendingPointerCaptureTargetRef.current = releaseDragPointerCapture(
      pendingPointerCaptureTargetRef.current,
      pendingPointerId
    )
    clearTimer()
    clearOuterDwellTimer()
    clearEdgeSwitchTimer()
  }

  const clearOuterDwellTimer = () => {
    if (outerDwellTimerRef.current !== null) {
      window.clearTimeout(outerDwellTimerRef.current)
      outerDwellTimerRef.current = null
    }
    outerDwellIntentRef.current = null
  }

  const clearFolderAutoOpenTimer = () => {
    if (folderAutoOpenTimerRef.current !== null) {
      window.clearTimeout(folderAutoOpenTimerRef.current)
      folderAutoOpenTimerRef.current = null
    }
    folderAutoOpenTargetIdRef.current = null
  }

  const clearFolderExitTimer = () => {
    if (folderExitTimerRef.current !== null) {
      window.clearTimeout(folderExitTimerRef.current)
      folderExitTimerRef.current = null
    }
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
    if (
      folderAutoOpenTargetIdRef.current &&
      (next?.context !== 'outer' ||
        next.folderPreviewTargetId !== folderAutoOpenTargetIdRef.current)
    ) {
      clearFolderAutoOpenTimer()
    }
    if (next?.context !== 'folder') {
      clearFolderExitTimer()
    }
    dragRef.current = next
    if (!next) {
      dragStartedInFolderRef.current = false
      enteredFolderContentRef.current = false
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

  const captureOuterPreviewBeforeChange = (previous: DragState | null, next: DragState | null) => {
    if (!onBeforeOuterPreviewChange) return
    const previousIsOuter = previous?.context === 'outer'
    const nextIsOuter = next?.context === 'outer'
    if (!previousIsOuter && !nextIsOuter) return
    if (
      previousIsOuter &&
      nextIsOuter &&
      previous &&
      next &&
      areSlotsEqual(previous.workingOrder, next.workingOrder)
    ) {
      return
    }
    onBeforeOuterPreviewChange()
  }

  const commitDragState: Dispatch<SetStateAction<DragState | null>> = update => {
    const previous = dragRef.current
    const next = typeof update === 'function' ? update(previous) : update
    captureOuterPreviewBeforeChange(previous, next)
    syncDragRuntime(next)
    renderedDragStateRef.current = next
    setDragState(next)
  }

  const publishMoveDragState = (next: DragState | null) => {
    syncDragRuntime(next)
    if (!hasRenderableDragStateChanged(renderedDragStateRef.current, next, 'paged')) return
    captureOuterPreviewBeforeChange(renderedDragStateRef.current, next)
    renderedDragStateRef.current = next
    setDragState(next)
  }

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
      return findDockMaxOverlapHit({
        state,
        iconSize: iconConfig.imgSize,
        slotNodes: dockSlotRefs.current,
        itemNodes: dockItemRefs.current,
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
    const cooledDownSinceLastEvasion =
      state.lastEvasionAt === null || now - state.lastEvasionAt >= config.evasionCooldownMs
    if (!cooledDownSinceLastEvasion) return state

    const evasionResult = applyTopLevelEvasion(state, overlapHit)
    const nextEvasionSignature = getEvasionIntentSignature(overlapHit.targetId, overlapHit.zone)
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

  const triggerTopLevelDwellEvasion = (expectedIntent: { targetId: string; zone: HoverZone }) => {
    const latest = dragRef.current
    if (!latest || latest.context === 'folder') return
    if (latest.context === 'dock' && !isDraggingFromDock(latest.draggingId)) return
    if (
      latest.hoverTargetId !== expectedIntent.targetId ||
      latest.hoverZone !== expectedIntent.zone
    ) {
      return
    }
    if (latest.folderPreviewTargetId) return
    const isMultiOuterDrag = latest.context === 'outer' && latest.draggingIds.length > 1

    const overlapHit = findTopLevelMaxOverlapHit(latest)
    if (
      !overlapHit ||
      overlapHit.targetId !== expectedIntent.targetId ||
      overlapHit.zone !== expectedIntent.zone
    ) {
      return
    }

    const itemMap = buildDragItemMap(latest, itemsRef.current)
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
    commitIntoExistingFolderForAutoOpen,
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

  const openExistingFolderDuringDrag = (expectedTargetId: string) => {
    const latest = dragRef.current
    if (
      !latest ||
      !isFolderAutoOpenIntentValid({
        context: latest.context,
        draggingCount: latest.draggingIds.length,
        draggingKind: latest.draggingItem.kind,
        folderPreviewTargetId: latest.folderPreviewTargetId,
        hoverTargetId: latest.hoverTargetId,
        hoverZone: latest.hoverZone,
        expectedTargetId,
      })
    ) {
      return
    }

    const target = itemsRef.current.find(
      item => item.kind === 'folder' && getId(item) === expectedTargetId
    )
    if (!target || target.kind !== 'folder') return

    const pointer = dragPointerRef.current
    const validationState = pointer
      ? { ...latest, pointerX: pointer.pointerX, pointerY: pointer.pointerY }
      : latest
    const currentOverlap = findTopLevelMaxOverlapHit(validationState)
    if (
      !currentOverlap ||
      currentOverlap.targetId !== expectedTargetId ||
      currentOverlap.zone !== 'center'
    ) {
      return
    }

    const nextChildren = commitIntoExistingFolderForAutoOpen(latest, expectedTargetId)
    if (!nextChildren) return
    const nextWorkingOrder = buildFolderAutoOpenOrder(
      nextChildren.map(child => child.key),
      latest.draggingId
    )
    if (!nextWorkingOrder) return

    clearOuterDwellTimer()
    clearFolderAutoOpenTimer()
    clearEdgeSwitchTimer()
    dragPointerCaptureTargetRef.current = releaseDragPointerCapture(
      dragPointerCaptureTargetRef.current,
      latest.pointerId
    )
    dragPointerCaptureTargetRef.current = activateDragPointerCapture(
      containerRef.current,
      latest.pointerId
    )
    if (onOpenFolder) onOpenFolder(target.id)
    else setOpenFolderId(target.id)
    dragStartedInFolderRef.current = false
    enteredFolderContentRef.current = false

    commitDragState({
      ...latest,
      context: 'folder',
      sourceFolderId: target.id,
      workingOrder: nextWorkingOrder,
      sourceSlotIndex: null,
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
      initialCenters: {
        ...collectCenters(folderTileRefs.current),
        [latest.draggingId]: { x: latest.pointerX, y: latest.pointerY },
      },
    })
  }

  const scheduleFolderAutoOpen = (targetFolderId: string) => {
    const current = dragRef.current
    const target = itemsRef.current.find(
      item => item.kind === 'folder' && getId(item) === targetFolderId
    )
    if (
      !current ||
      current.context !== 'outer' ||
      current.draggingIds.length !== 1 ||
      current.draggingItem.kind !== 'icon' ||
      !target ||
      target.kind !== 'folder'
    ) {
      clearFolderAutoOpenTimer()
      return
    }
    if (
      folderAutoOpenTimerRef.current !== null &&
      folderAutoOpenTargetIdRef.current === targetFolderId
    ) {
      return
    }

    clearFolderAutoOpenTimer()
    folderAutoOpenTargetIdRef.current = targetFolderId
    folderAutoOpenTimerRef.current = window.setTimeout(() => {
      const expectedTargetId = folderAutoOpenTargetIdRef.current
      folderAutoOpenTimerRef.current = null
      folderAutoOpenTargetIdRef.current = null
      if (expectedTargetId) openExistingFolderDuringDrag(expectedTargetId)
    }, FOLDER_AUTO_OPEN_DWELL_MS)
  }

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
      clearFolderExitTimer()
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

  const scheduleFolderExit = () => {
    if (
      !canExitFolderThroughMask({
        dragStartedInFolder: dragStartedInFolderRef.current,
        enteredFolderContent: enteredFolderContentRef.current,
      })
    ) {
      clearFolderExitTimer()
      return
    }
    if (folderExitTimerRef.current !== null) return

    folderExitTimerRef.current = window.setTimeout(() => {
      folderExitTimerRef.current = null
      const latest = dragRef.current
      const pointer = dragPointerRef.current
      const panel = folderPanelRef.current
      if (!latest || latest.context !== 'folder' || !pointer || !panel) return

      const panelRect = panel.getBoundingClientRect()
      if (
        !canExitFolderThroughMask({
          dragStartedInFolder: dragStartedInFolderRef.current,
          enteredFolderContent: enteredFolderContentRef.current,
        }) ||
        !isPointOutsideFolderContent({ x: pointer.pointerX, y: pointer.pointerY }, panelRect)
      ) {
        return
      }

      commitDragState(
        moveDragToTopLevelContext(
          { ...latest, pointerX: pointer.pointerX, pointerY: pointer.pointerY },
          resolveTopLevelContextAtPoint(pointer.pointerX, pointer.pointerY),
          pointer.pointerX,
          pointer.pointerY
        )
      )
    }, FOLDER_EXIT_DWELL_MS)
  }

  const beginDrag = (pending: PendingDrag, x: number, y: number) => {
    clearTimer()
    clearOuterDwellTimer()
    clearFolderAutoOpenTimer()
    clearFolderExitTimer()
    dragStartedInFolderRef.current = pending.context === 'folder'
    enteredFolderContentRef.current = false
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
      openFolderId,
      selectionMode,
      selectedIconKeys: selectedIconKeySet,
      items: itemsRef.current,
      itemById,
      getTopLevelOrder: resolveTopLevelOrder,
    })
    const selectedFolderChildrenByFolderId = getFolderChildSelectionsByIds(
      itemsRef.current,
      draggingIds
    )
    const selectedFolderDragIds = Array.from(selectedFolderChildrenByFolderId.values()).flatMap(
      children => children.map(child => child.key)
    )

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
    seedMissingInitialCenters(
      nextState.initialCenters,
      draggingIds,
      tileRefs.current,
      dockItemRefs.current
    )
    if (pending.context !== 'folder' && selectedFolderDragIds.length > 0) {
      const folderCenters = collectCenters(folderTileRefs.current)
      selectedFolderChildrenByFolderId.forEach((children, folderId) => {
        const folderTileNode =
          tileRefs.current.get(`folder:${folderId}`) ??
          dockItemRefs.current.get(`folder:${folderId}`)
        const folderTileRect = folderTileNode?.getBoundingClientRect() ?? null
        const collapsedFolderCenter = folderTileRect
          ? {
              x: folderTileRect.left + folderTileRect.width / 2,
              y: folderTileRect.top + folderTileRect.height / 2,
            }
          : null
        const stackOffset = Math.min(10, Math.max(4, Math.round(iconConfig.imgSize * 0.14)))

        children.forEach((child, index) => {
          if (folderCenters[child.key]) {
            nextState.initialCenters[child.key] = folderCenters[child.key]
            return
          }
          if (!collapsedFolderCenter) return

          const columnOffset = (index % 2) - 0.5
          const rowOffset = Math.floor(index / 2)
          nextState.initialCenters[child.key] = {
            x: collapsedFolderCenter.x + columnOffset * stackOffset * 2,
            y: collapsedFolderCenter.y + rowOffset * stackOffset - stackOffset / 2,
          }
        })
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

    // 只有真正进入拖拽后才抢占 pointer capture，避免普通点击的 click 被外层 tile 吞掉。
    dragPointerCaptureTargetRef.current = activateDragPointerCapture(
      pendingPointerCaptureTargetRef.current,
      pending.pointerId
    )
    pendingPointerCaptureTargetRef.current = null
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
        const outsidePanel = isPointOutsideFolderContent({ x, y }, panelRect)
        if (outsidePanel) {
          scheduleFolderExit()
        } else {
          enteredFolderContentRef.current = true
          clearFolderExitTimer()
        }
      }
    }

    if (baseState.context !== 'folder') {
      const topLevelContext = resolveTopLevelContextAtPoint(x, y)
      if (baseState.context !== topLevelContext) {
        baseState = moveDragToTopLevelContext(baseState, topLevelContext, x, y)
      }
      const isMultiOuterDrag = baseState.context === 'outer' && baseState.draggingIds.length > 1

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
      const isMultiDockDrag = baseState.context === 'dock' && baseState.draggingIds.length > 1

      if (!overlapHit) {
        clearOuterDwellTimer()
        const resetState: DragState = {
          ...resetOuterInteraction(baseState, nearestSlotIndex),
          dockPreviewIndex: baseState.context === 'dock' ? nearestSlotIndex : null,
        }
        publishMoveDragState(resetState)
        return
      }

      const itemMap = buildDragItemMap(baseState, itemsRef.current)
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
          !isMultiDockDrag &&
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

      if (baseState.context === 'dock' && draggingFromDock) {
        clearOuterDwellTimer()
        const canFolderPreview =
          !isMultiDockDrag &&
          source.kind === 'icon' &&
          target.kind === 'icon' &&
          overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold
        const canAddToExistingFolder =
          source.kind === 'icon' &&
          target.kind === 'folder' &&
          overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold

        if (canFolderPreview || canAddToExistingFolder) {
          const previewState: DragState = {
            ...baseState,
            previewSlotIndex: overlapHit.targetIndex,
            dockPreviewIndex: overlapHit.targetIndex,
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

        const currentHoleIndex = baseState.workingOrder.indexOf(null)
        const currentTargetIndex = baseState.workingOrder.indexOf(overlapHit.targetId)
        const placeAfter =
          overlapHit.zone === 'right'
            ? true
            : overlapHit.zone === 'left'
              ? false
              : currentHoleIndex > currentTargetIndex
        const nextWorkingOrder = buildDockLinearPreviewOrder(
          baseState.workingOrder,
          overlapHit.targetId,
          placeAfter
        )
        const nextPreviewIndex = nextWorkingOrder.indexOf(null)
        const insertState: DragState = {
          ...resetOuterInteraction(baseState, nextPreviewIndex),
          workingOrder: nextWorkingOrder,
          previewSlotIndex: nextPreviewIndex,
          dockPreviewIndex: nextPreviewIndex,
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
        if (baseState.context === 'outer' && overlapHit.zone === 'center') {
          scheduleFolderAutoOpen(overlapHit.targetId)
        }
        return
      }

      next.folderPreviewTargetId = null
      const intentSignature = getEvasionIntentSignature(overlapHit.targetId, overlapHit.zone)
      const sameIntent =
        baseState.hoverTargetId === overlapHit.targetId && baseState.hoverZone === overlapHit.zone
      next.dwellStartedAt =
        sameIntent && baseState.dwellStartedAt !== null ? baseState.dwellStartedAt : now
      if (!sameIntent) {
        next.lastEvasionSignature = null
      }

      if (next.lastEvasionSignature === intentSignature) {
        clearOuterDwellTimer()
        publishMoveDragState(next)
        return
      }

      const dwellSince = next.dwellStartedAt ?? now
      const remainingMs = getEvasionReadyDelay({
        now,
        dwellStartedAt: dwellSince,
        dwellMs: config.evasionDwellMs,
        lastEvasionAt: next.lastEvasionAt,
        cooldownMs: config.evasionCooldownMs,
      })
      const pendingIntent = outerDwellIntentRef.current
      const intentChanged =
        pendingIntent?.targetId !== overlapHit.targetId || pendingIntent?.zone !== overlapHit.zone
      if (intentChanged) {
        clearOuterDwellTimer()
      }
      if (outerDwellTimerRef.current === null) {
        outerDwellIntentRef.current = {
          targetId: overlapHit.targetId,
          zone: overlapHit.zone,
        }
        outerDwellTimerRef.current = window.setTimeout(() => {
          const intent = outerDwellIntentRef.current
          outerDwellTimerRef.current = null
          outerDwellIntentRef.current = null
          if (!intent) return
          triggerTopLevelDwellEvasion(intent)
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

    const itemMap = buildDragItemMap(baseState, itemsRef.current)
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

  const finishActiveDrag = (pointerId: number) => {
    let completedDrag = dragRef.current
    if (completedDrag?.context === 'folder') {
      const pointer = dragPointerRef.current
      const panel = folderPanelRef.current
      if (pointer && panel) {
        const panelRect = panel.getBoundingClientRect()
        const releasedOnFolderMask = isPointOutsideFolderContent(
          { x: pointer.pointerX, y: pointer.pointerY },
          panelRect
        )
        const canExitThroughMask = canExitFolderThroughMask({
          dragStartedInFolder: dragStartedInFolderRef.current,
          enteredFolderContent: enteredFolderContentRef.current,
        })
        if (releasedOnFolderMask && canExitThroughMask) {
          clearFolderExitTimer()
          completedDrag = moveDragToTopLevelContext(
            {
              ...completedDrag,
              pointerX: pointer.pointerX,
              pointerY: pointer.pointerY,
            },
            resolveTopLevelContextAtPoint(pointer.pointerX, pointer.pointerY),
            pointer.pointerX,
            pointer.pointerY
          )
          commitDragState(completedDrag)
        }
      }
    }
    if (!finishDrag(pointerId)) return
    dragPointerCaptureTargetRef.current = releaseDragPointerCapture(
      dragPointerCaptureTargetRef.current,
      pointerId
    )
    if (completedDrag && completedDrag.draggingIds.length > 0) {
      unselectIcons(completedDrag.draggingIds)
    }
    clearOuterDwellTimer()
    clearFolderAutoOpenTimer()
    clearFolderExitTimer()
    suppressClickUntilRef.current = performance.now() + 300
  }

  const abortPendingDrag = (pointerId: number) => {
    if (pendingRef.current?.pointerId !== pointerId) return
    clearPending()
    suppressClickUntilRef.current = performance.now() + 300
  }

  const cancelActiveDrag = (pointerId: number) => {
    if (dragRef.current?.pointerId !== pointerId) return
    clearOuterDwellTimer()
    clearFolderAutoOpenTimer()
    clearFolderExitTimer()
    clearEdgeSwitchTimer()
    cancelQueuedDragMove()
    dragPointerCaptureTargetRef.current = releaseDragPointerCapture(
      dragPointerCaptureTargetRef.current,
      pointerId
    )
    commitDragState(null)
  }

  const armPointerControllerSession = () => {
    beginDragFnRef.current = beginDrag
    onDragMoveFnRef.current = scheduleDragMove
    flushDragMoveFnRef.current = flushDragMove
    finishDragFnRef.current = finishActiveDrag
    clearPendingFnRef.current = clearPending
    abortPendingFnRef.current = abortPendingDrag
    cancelDragFnRef.current = cancelActiveDrag
  }

  useEffect(() => {
    const cancelActiveInteractions = () => {
      const activeDrag = dragRef.current
      if (activeDrag) {
        cancelDragFnRef.current(activeDrag.pointerId)
        return
      }
      if (pendingRef.current) {
        clearPendingFnRef.current()
      }
    }

    const handleWindowBlur = () => {
      cancelActiveInteractions()
    }

    const handleDocumentVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cancelActiveInteractions()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (!dragRef.current && !pendingRef.current) return
      event.preventDefault()
      event.stopPropagation()
      cancelActiveInteractions()
    }

    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('visibilitychange', handleDocumentVisibilityChange)
    window.addEventListener('keydown', handleEscape, true)
    return () => {
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('visibilitychange', handleDocumentVisibilityChange)
      window.removeEventListener('keydown', handleEscape, true)
    }
  }, [])

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
    armPointerControllerSession()
    const rect = event.currentTarget.getBoundingClientRect()
    pendingPointerCaptureTargetRef.current = event.currentTarget
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
    armPointerControllerSession()
    const rect = event.currentTarget.getBoundingClientRect()
    pendingPointerCaptureTargetRef.current = event.currentTarget
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
    if (event.button !== 0) return
    armPointerControllerSession()
    const rect = event.currentTarget.getBoundingClientRect()
    pendingPointerCaptureTargetRef.current = event.currentTarget
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

  const handleTileClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
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

    const pointer = dragPointerRef.current
    scheduleDragMove(
      current.pointerId,
      pointer?.pointerX ?? current.pointerX,
      pointer?.pointerY ?? current.pointerY
    )
  }

  useEffect(
    () => () => {
      const activePointerId = dragRef.current?.pointerId ?? pendingRef.current?.pointerId
      dragPointerCaptureTargetRef.current = releaseDragPointerCapture(
        dragPointerCaptureTargetRef.current,
        activePointerId
      )
      pendingPointerCaptureTargetRef.current = releaseDragPointerCapture(
        pendingPointerCaptureTargetRef.current,
        activePointerId
      )
      clearTimer()
      clearOuterDwellTimer()
      clearFolderAutoOpenTimer()
      clearFolderExitTimer()
      clearEdgeSwitchTimer()
      cancelQueuedDragMove()
    },
    [clearEdgeSwitchTimer]
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
    dragEdgeDirection,
  }
}
