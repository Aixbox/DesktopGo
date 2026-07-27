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
import {
  buildFolderAutoOpenOrder,
  canExitFolderThroughMask,
  FOLDER_AUTO_OPEN_DWELL_MS,
  FOLDER_EXIT_DWELL_MS,
  isFolderAutoOpenIntentValid,
  isPointOutsideFolderContent,
} from '../domain/folderPolicy'
import { usePointerDragController } from './usePointerDragController'
import { useEdgeAutoPaging } from './useEdgeAutoPaging'
import { useDragDropCommit } from './useDragDropCommit'
import { activateDragPointerCapture, releaseDragPointerCapture } from './dragPointerCapture'
import { usePagedDragGeometryController } from './usePagedDragGeometryController'
import { usePagedDragMoveProcessor } from './usePagedDragMoveProcessor'
import { useTopLevelDwellEvasion } from './useTopLevelDwellEvasion'
import { usePagedDragStarter } from './usePagedDragStarter'
import { resetOuterInteraction } from '../state/dragMachine'
import {
  collectElementCenters as collectCenters,
  hasRenderableDragStateChanged,
} from '../domain/dragWorkflowShared'
import type { DragState, FolderDropFlight, MultiDropFlightItem, PendingDrag } from '../state/types'

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

  const {
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
    tryApplyTopLevelEvasion,
  } = usePagedDragGeometryController({
    gridGap: config.gridGap,
    evasionCooldownMs: config.evasionCooldownMs,
    columns,
    rows,
    itemWidth,
    itemHeight,
    folderColumns,
    folderItemWidth,
    folderItemHeight,
    folderOrderLength,
    iconImageSize: iconConfig.imgSize,
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
  })

  const triggerTopLevelDwellEvasion = useTopLevelDwellEvasion({
    dragRef,
    itemsRef,
    isDraggingFromDock,
    findTopLevelMaxOverlapHit,
    resolveCandidateAnchorIndexByContext,
    resolveNearestSlotIndexByContext,
    resolveTopLevelOverlapPreviewIndex,
    tryApplyTopLevelEvasion,
    publishMoveDragState,
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

  const beginDrag = usePagedDragStarter({
    columns,
    iconImageSize: iconConfig.imgSize,
    selectionMode,
    selectedIconKeys: selectedIconKeySet,
    openFolderId,
    itemById,
    itemsRef,
    outerSlotsRef,
    pageSizeRef,
    tileRefs,
    folderTileRefs,
    dockItemRefs,
    pendingPointerCaptureTargetRef,
    dragPointerCaptureTargetRef,
    dragStartedInFolderRef,
    enteredFolderContentRef,
    setOuterSlots,
    setOpenFolderId,
    clearTimer,
    clearOuterDwellTimer,
    clearFolderAutoOpenTimer,
    clearFolderExitTimer,
    clearPending,
    resetDropVisuals,
    resolveDockItemOrder,
    resolveOuterItemsForLayout,
    resolveTopLevelOrder,
    seedMissingOuterDragCenters,
    moveDragToTopLevelContext,
    commitDragState,
  })

  const processDragMove = usePagedDragMoveProcessor({
    evasionRearmDistance: config.evasionRearmDistance,
    evasionCooldownMs: config.evasionCooldownMs,
    evasionDwellMs: config.evasionDwellMs,
    dragRef,
    folderPanelRef,
    enteredFolderContentRef,
    itemsRef,
    outerDwellIntentRef,
    outerDwellTimerRef,
    scheduleFolderExit,
    clearFolderExitTimer,
    clearOuterDwellTimer,
    resolveTopLevelContextAtPoint,
    moveDragToTopLevelContext,
    maybeHandleOuterEdgeSwitch,
    clearEdgeSwitchTimer,
    resolveNearestSlotIndexByContext,
    resolveCandidateAnchorIndexByContext,
    findTopLevelMaxOverlapHit,
    isDraggingFromDock,
    resolveTopLevelOverlapPreviewIndex,
    scheduleFolderAutoOpen,
    triggerTopLevelDwellEvasion,
    findHitByContext,
    publishMoveDragState,
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
