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
import type { GridItem, HoverZone } from '../model'
import { getId } from '../model'
import { areSlotsEqual } from '../domain/slots'
import { getFolderChildrenById } from '../domain/folderPolicy'
import { usePointerDragController } from '../hooks/usePointerDragController'
import { useEdgeAutoPaging } from '../hooks/useEdgeAutoPaging'
import { useScrollableDragDropCommit } from './useScrollableDragDropCommit'
import { useScrollableDragGeometryController } from './useScrollableDragGeometryController'
import { useScrollableDragMoveProcessor } from './useScrollableDragMoveProcessor'
import { useScrollableDragStarter } from './useScrollableDragStarter'
import { useScrollableFolderDragController } from './useScrollableFolderDragController'
import {
  buildScrollGroupDragPreviewOrder,
  canExitScrollFolderThroughMask,
  isPointOutsideScrollFolderContent,
} from './scrollGroupLayout'
import { releaseDragPointerCapture } from '../hooks/dragPointerCapture'
import { resetOuterInteraction } from '../state/dragMachine'
import { hasRenderableDragStateChanged } from '../domain/dragWorkflowShared'
import type { DragState, FolderDropFlight, MultiDropFlightItem, PendingDrag } from '../state/types'

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
  outerDropMode?: 'paged' | 'compact-page'
  getOuterMinPageCount?: () => number
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
  getOuterGridElementAtPoint?: (
    x: number,
    y: number
  ) => {
    element: HTMLDivElement
    pageIndex: number
  } | null
  getActiveScrollGroupItemIds?: () => string[]
  onBeforeOuterPreviewChange?: () => void
  onOuterDragFinished?: (
    session: DragState,
    folderCreateTargetId: string | null,
    sourceFolderReplacementId: string | null
  ) => void
  onFolderCreateCommitted?: (session: DragState, createdFolderId: string, targetId: string) => void
  onOpenFolder?: (folderId: string) => void
  onCloseFolder?: () => void
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
  retargetOuterDragToScrollGroup: (targetItemIds: string[]) => void
  syncOuterDragPreview: () => void
  syncDockDragPreview: () => void
  dragEdgeDirection: import('../hooks/useEdgeAutoPaging').DragEdgeDirection
}

export function useScrollableIconGridDragWorkflow({
  config,
  selectionMode,
  selectedIconKeys,
  unselectIcons,
  iconConfig,
  columns,
  rows,
  outerDropMode = 'paged',
  getOuterMinPageCount,
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
  getOuterGridElementAtPoint,
  getActiveScrollGroupItemIds,
  onBeforeOuterPreviewChange,
  onOuterDragFinished,
  onFolderCreateCommitted,
  onOpenFolder,
  onCloseFolder,
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
  const isCompactOuterDrop = outerDropMode === 'compact-page'
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
  const outerDwellZoneRef = useRef<HoverZone | null>(null)
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
  const compactOuterDragBaseOrderRef = useRef<Array<string | null> | null>(null)
  const compactOuterDragBaseWithoutDraggingRef = useRef<Array<string | null> | null>(null)
  const compactOuterPreviewItemsRef = useRef<GridItem[] | null>(null)
  const compactOuterPreviewResultRef = useRef<{
    signature: string
    order: Array<string | null>
    previewSlotIndex: number | null
  } | null>(null)
  const compactScrollLastHitPointRef = useRef<{ x: number; y: number } | null>(null)
  const compactScrollLastHitIdRef = useRef<string | null>(null)

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
    outerDwellTargetIdRef.current = null
    outerDwellZoneRef.current = null
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
      compactOuterDragBaseOrderRef.current = null
      compactOuterDragBaseWithoutDraggingRef.current = null
      compactOuterPreviewItemsRef.current = null
      compactOuterPreviewResultRef.current = null
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
    if (!isCompactOuterDrop || !onBeforeOuterPreviewChange) return
    const previousIsOuter = previous?.context === 'outer'
    const nextIsOuter = next?.context === 'outer'
    if (!previousIsOuter && !nextIsOuter) return
    if (
      previousIsOuter &&
      nextIsOuter &&
      previous &&
      next &&
      areSlotsEqual(previous.workingOrder, next.workingOrder) &&
      areSlotsEqual(previous.scrollGroupOrder ?? [], next.scrollGroupOrder ?? [])
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
    if (!hasRenderableDragStateChanged(renderedDragStateRef.current, next, 'scroll')) return
    captureOuterPreviewBeforeChange(renderedDragStateRef.current, next)
    renderedDragStateRef.current = next
    setDragState(next)
  }

  const {
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
  } = useScrollableDragGeometryController({
    gridGap: config.gridGap,
    evasionRearmDistance: config.evasionRearmDistance,
    evasionCooldownMs: config.evasionCooldownMs,
    iconImageSize: iconConfig.imgSize,
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
  })
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
  } = useScrollableDragDropCommit({
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
    outerDropMode,
    getOuterMinPageCount,
    onFolderCreateCommitted,
  })

  const {
    triggerCompactFolderPreview,
    triggerTopLevelDwellEvasion,
    scheduleFolderAutoOpen,
    moveDragToTopLevelContext,
    scheduleFolderExit,
  } = useScrollableFolderDragController({
    isCompactOuterDrop,
    evasionRearmDistance: config.evasionRearmDistance,
    dragRef,
    itemsRef,
    dragPointerRef,
    folderAutoOpenTimerRef,
    folderAutoOpenTargetIdRef,
    folderExitTimerRef,
    dragStartedInFolderRef,
    enteredFolderContentRef,
    dragPointerCaptureTargetRef,
    containerRef,
    folderPanelRef,
    folderTileRefs,
    tileRefs,
    dockItemRefs,
    compactOuterDragBaseOrderRef,
    compactOuterDragBaseWithoutDraggingRef,
    compactOuterPreviewItemsRef,
    compactOuterPreviewResultRef,
    findCompactScrollGroupOverlapHit,
    findTopLevelMaxOverlapHit,
    resolveCompactScrollHoverZone,
    isDraggingFromDock,
    buildCompactOuterPreviewOrder,
    resolveScrollGroupOrderFromWorkingOrder,
    syncDragRuntime,
    publishMoveDragState,
    resolveCandidateAnchorIndexByContext,
    resolveTopLevelOverlapPreviewIndex,
    resolveNearestSlotIndexByContext,
    tryApplyTopLevelEvasion,
    commitIntoExistingFolderForAutoOpen,
    onOuterDragFinished,
    onOpenFolder,
    onCloseFolder,
    setOpenFolderId,
    commitDragState,
    clearOuterDwellTimer,
    clearFolderAutoOpenTimer,
    clearFolderExitTimer,
    resolveTopLevelOrder,
    resolveActiveScrollGroupOrder,
    compactOuterPreviewOrderWithoutDragging,
    seedMissingOuterDragCenters,
    resolveTopLevelContextAtPoint,
  })
  const beginDrag = useScrollableDragStarter({
    isCompactOuterDrop,
    iconImageSize: iconConfig.imgSize,
    selectionMode,
    selectedIconKeys: selectedIconKeySet,
    openFolderId,
    itemById,
    itemsRef,
    outerSlotsRef,
    tileRefs,
    folderTileRefs,
    dockItemRefs,
    pendingPointerCaptureTargetRef,
    dragPointerCaptureTargetRef,
    dragStartedInFolderRef,
    enteredFolderContentRef,
    compactOuterDragBaseOrderRef,
    compactOuterDragBaseWithoutDraggingRef,
    compactOuterPreviewItemsRef,
    compactOuterPreviewResultRef,
    compactScrollLastHitPointRef,
    compactScrollLastHitIdRef,
    setOuterSlots,
    setOpenFolderId,
    clearTimer,
    clearOuterDwellTimer,
    clearFolderExitTimer,
    clearPending,
    resetDropVisuals,
    resolveDockItemOrder,
    resolveCompactOuterTopLevelOrder,
    resolvePagedOuterTopLevelOrder,
    resolveTopLevelOrder,
    resolveActiveScrollGroupOrder,
    compactOuterPreviewOrderWithoutDragging,
    seedMissingOuterDragCenters,
    moveDragToTopLevelContext,
    commitDragState,
  })
  const processDragMove = useScrollableDragMoveProcessor({
    isCompactOuterDrop,
    columns,
    evasionRearmDistance: config.evasionRearmDistance,
    evasionCooldownMs: config.evasionCooldownMs,
    dragRef,
    folderPanelRef,
    enteredFolderContentRef,
    itemsRef,
    pageSizeRef,
    compactOuterDragBaseOrderRef,
    outerDwellTargetIdRef,
    outerDwellZoneRef,
    outerDwellTimerRef,
    scheduleFolderExit,
    clearFolderExitTimer,
    clearOuterDwellTimer,
    maybeHandleOuterEdgeSwitch,
    clearEdgeSwitchTimer,
    resolveTopLevelContextAtPoint,
    moveDragToTopLevelContext,
    resolveNearestSlotIndexByContext,
    resolveCandidateAnchorIndexByContext,
    getOuterGridElementAtPoint,
    findHitByContext,
    compactOuterPreviewOrderWithoutDragging,
    findTopLevelMaxOverlapHit,
    resolveCompactOuterPreviewItems,
    resolveCompactOuterTopLevelOrder,
    getOuterMinPageCount,
    resolveScrollGroupOrderFromWorkingOrder,
    publishMoveDragState,
    isDraggingFromDock,
    resolveCompactScrollHoverZone,
    resolveTopLevelOverlapPreviewIndex,
    scheduleFolderAutoOpen,
    triggerCompactFolderPreview,
    triggerTopLevelDwellEvasion,
  })
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
        const releasedOnFolderMask = isPointOutsideScrollFolderContent(
          { x: pointer.pointerX, y: pointer.pointerY },
          panelRect
        )
        const canExitThroughMask = canExitScrollFolderThroughMask({
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
    const completedFolderTargetId = completedDrag?.folderPreviewTargetId ?? null
    const completedFolderTarget = completedFolderTargetId
      ? itemsRef.current.find(item => getId(item) === completedFolderTargetId)
      : null
    const folderCreateTargetId =
      completedFolderTarget?.kind === 'icon' ? completedFolderTargetId : null
    const sourceFolderReplacementId = completedDrag?.sourceFolderId
      ? (() => {
          const draggingIdSet = new Set(completedDrag.draggingIds)
          const remainingChildren = getFolderChildrenById(
            itemsRef.current,
            completedDrag.sourceFolderId
          ).filter(child => !draggingIdSet.has(child.key))
          return remainingChildren.length === 1 ? remainingChildren[0].key : null
        })()
      : null
    if (!finishDrag(pointerId)) return
    if (completedDrag?.context === 'outer' && folderCreateTargetId === null) {
      onOuterDragFinished?.(completedDrag, folderCreateTargetId, sourceFolderReplacementId)
    }
    dragPointerCaptureTargetRef.current = releaseDragPointerCapture(
      dragPointerCaptureTargetRef.current,
      pointerId
    )
    if (completedDrag && completedDrag.draggingIds.length > 0) {
      unselectIcons(completedDrag.draggingIds)
    }
    clearOuterDwellTimer()
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
      activateOnMove: isCompactOuterDrop,
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

  const retargetOuterDragToScrollGroup = (targetItemIds: string[]) => {
    const current = dragRef.current
    if (!current || current.context !== 'outer' || !isCompactOuterDrop) return

    clearOuterDwellTimer()
    compactScrollLastHitPointRef.current = null
    compactScrollLastHitIdRef.current = null
    compactOuterPreviewResultRef.current = null

    const availableIds = new Set(resolveCompactOuterPreviewItems(current).map(getId))
    const scrollGroupOrder = buildScrollGroupDragPreviewOrder({
      groupItemIds: targetItemIds,
      workingOrder: targetItemIds,
      draggingIds: current.draggingIds,
      availableIds,
    })
    const next: DragState = {
      ...current,
      scrollGroupOrder,
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
    }
    commitDragState(next)
  }

  const syncOuterDragPreview = () => {
    const current = dragRef.current
    if (!current || current.context !== 'outer') return

    const pointer = dragPointerRef.current
    scheduleDragMove(
      current.pointerId,
      pointer?.pointerX ?? current.pointerX,
      pointer?.pointerY ?? current.pointerY
    )
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
    retargetOuterDragToScrollGroup,
    syncOuterDragPreview,
    syncDockDragPreview,
    dragEdgeDirection,
  }
}
