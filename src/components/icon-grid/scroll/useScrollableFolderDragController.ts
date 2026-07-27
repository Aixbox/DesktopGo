import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { GridItem, HoverZone, IconItem } from '../model'
import { getId } from '../model'
import { areSlotsEqual } from '../domain/slots'
import { getFolderChildrenById } from '../domain/folderPolicy'
import {
  buildDragItemMap,
  collectElementCenters as collectCenters,
} from '../domain/dragWorkflowShared'
import { OUTER_DRAG_RULES } from '../constants'
import type { DragState, OuterOverlapHit } from '../state/types'
import { activateDragPointerCapture, releaseDragPointerCapture } from '../hooks/dragPointerCapture'
import {
  buildScrollFolderAutoOpenOrder,
  canExitScrollFolderThroughMask,
  hasScrollEvasionRearmed,
  isPointOutsideScrollFolderContent,
  SCROLL_FOLDER_AUTO_OPEN_DWELL_MS,
  SCROLL_FOLDER_EXIT_DWELL_MS,
  SCROLL_PREVIEW_REORDER_LOCK_MS,
} from './scrollGroupLayout'

interface ScrollableFolderDragControllerParams {
  isCompactOuterDrop: boolean
  evasionRearmDistance: number
  dragRef: MutableRefObject<DragState | null>
  itemsRef: MutableRefObject<GridItem[]>
  dragPointerRef: MutableRefObject<{ pointerX: number; pointerY: number } | null>
  folderAutoOpenTimerRef: MutableRefObject<number | null>
  folderAutoOpenTargetIdRef: MutableRefObject<string | null>
  folderExitTimerRef: MutableRefObject<number | null>
  dragStartedInFolderRef: MutableRefObject<boolean>
  enteredFolderContentRef: MutableRefObject<boolean>
  dragPointerCaptureTargetRef: MutableRefObject<HTMLElement | null>
  containerRef: MutableRefObject<HTMLDivElement | null>
  folderPanelRef: MutableRefObject<HTMLDivElement | null>
  folderTileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  dockItemRefs: MutableRefObject<Map<string, HTMLDivElement>>
  compactOuterDragBaseOrderRef: MutableRefObject<Array<string | null> | null>
  compactOuterDragBaseWithoutDraggingRef: MutableRefObject<Array<string | null> | null>
  compactOuterPreviewItemsRef: MutableRefObject<GridItem[] | null>
  compactOuterPreviewResultRef: MutableRefObject<{
    signature: string
    order: Array<string | null>
    previewSlotIndex: number | null
  } | null>
  findCompactScrollGroupOverlapHit: (state: DragState) => OuterOverlapHit | null
  findTopLevelMaxOverlapHit: (state: DragState) => OuterOverlapHit | null
  resolveCompactScrollHoverZone: (
    state: DragState,
    target: GridItem,
    hit: OuterOverlapHit
  ) => HoverZone
  isDraggingFromDock: (draggingId: string) => boolean
  buildCompactOuterPreviewOrder: (
    state: DragState,
    hit: OuterOverlapHit
  ) => { order: Array<string | null>; previewSlotIndex: number | null }
  resolveScrollGroupOrderFromWorkingOrder: (
    state: DragState,
    workingOrder: Array<string | null>
  ) => string[] | null
  syncDragRuntime: (state: DragState | null) => void
  publishMoveDragState: (state: DragState | null) => void
  resolveCandidateAnchorIndexByContext: (
    state: DragState,
    options?: { allowOutside?: boolean }
  ) => number | null
  resolveTopLevelOverlapPreviewIndex: (
    state: DragState,
    target: GridItem,
    hit: OuterOverlapHit,
    nearestSlotIndex: number | null,
    candidateAnchorIndex: number | null
  ) => number | null
  resolveNearestSlotIndexByContext: (
    state: DragState,
    options?: { allowOutside?: boolean }
  ) => number | null
  tryApplyTopLevelEvasion: (state: DragState, hit: OuterOverlapHit, now: number) => DragState
  commitIntoExistingFolderForAutoOpen: (
    session: DragState,
    targetFolderId: string
  ) => IconItem[] | null
  onOuterDragFinished?: (
    session: DragState,
    folderCreateTargetId: string | null,
    sourceFolderReplacementId: string | null
  ) => void
  onOpenFolder?: (folderId: string) => void
  onCloseFolder?: () => void
  setOpenFolderId: Dispatch<SetStateAction<string | null>>
  commitDragState: Dispatch<SetStateAction<DragState | null>>
  clearOuterDwellTimer: () => void
  clearFolderAutoOpenTimer: () => void
  clearFolderExitTimer: () => void
  resolveTopLevelOrder: (context: 'outer' | 'dock') => Array<string | null>
  resolveActiveScrollGroupOrder: (state: DragState) => string[] | null
  compactOuterPreviewOrderWithoutDragging: (state: DragState) => Array<string | null>
  seedMissingOuterDragCenters: (params: {
    initialCenters: Record<string, { x: number; y: number }>
    draggingIds: string[]
    sourceOrder: Array<string | null>
    leadId: string
    fallbackX: number
    fallbackY: number
  }) => void
  resolveTopLevelContextAtPoint: (x: number, y: number) => 'outer' | 'dock'
}

export function useScrollableFolderDragController(params: ScrollableFolderDragControllerParams) {
  const {
    isCompactOuterDrop,
    evasionRearmDistance,
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
  } = params

  const triggerCompactFolderPreview = (expectedTargetId: string) => {
    const latest = dragRef.current
    if (!latest || latest.context !== 'outer' || !isCompactOuterDrop) return
    if (latest.hoverTargetId !== expectedTargetId || latest.hoverZone !== 'center') return

    const overlapHit = findCompactScrollGroupOverlapHit(latest)
    if (!overlapHit || overlapHit.targetId !== expectedTargetId) return
    const target = buildDragItemMap(latest, itemsRef.current).get(expectedTargetId)
    if (!target) return
    const zone = resolveCompactScrollHoverZone(latest, target, overlapHit)
    if (zone !== 'center') return

    const canCreateFolder =
      latest.draggingIds.length === 1 &&
      latest.draggingItem.kind === 'icon' &&
      target.kind === 'icon'
    const canAddToFolder = latest.draggingItem.kind === 'icon' && target.kind === 'folder'
    if (!canCreateFolder && !canAddToFolder) return

    publishMoveDragState({
      ...latest,
      hoverIou: overlapHit.iou,
      folderPreviewTargetId: expectedTargetId,
      dwellStartedAt: null,
      lastEvasionSignature: null,
    })
    if (target.kind === 'folder') {
      scheduleFolderAutoOpen(expectedTargetId)
    }
  }

  const triggerTopLevelDwellEvasion = (
    expectedTargetId: string,
    expectedZone: HoverZone | null = null
  ) => {
    const latest = dragRef.current
    if (!latest || latest.context === 'folder') return
    if (latest.context === 'dock' && !isDraggingFromDock(latest.draggingId)) return
    if (latest.hoverTargetId !== expectedTargetId) return
    if (expectedZone !== null && latest.hoverZone !== expectedZone) return
    if (latest.folderPreviewTargetId) return
    const isMultiOuterDrag = latest.context === 'outer' && latest.draggingIds.length > 1

    let overlapHit = findTopLevelMaxOverlapHit(latest)
    if (!overlapHit || overlapHit.targetId !== expectedTargetId) return

    const itemMap = buildDragItemMap(latest, itemsRef.current)
    const source = latest.draggingItem
    const target = itemMap.get(overlapHit.targetId)
    if (!target) return

    if (isCompactOuterDrop && latest.context === 'outer') {
      overlapHit = {
        ...overlapHit,
        zone: resolveCompactScrollHoverZone(latest, target, overlapHit),
      }
      if (expectedZone !== null && overlapHit.zone !== expectedZone) return
      if (overlapHit.zone === 'center') return

      const signature = `compact-overlap:${overlapHit.targetId}:${overlapHit.zone}`
      const rearmed = hasScrollEvasionRearmed(
        { x: latest.pointerX, y: latest.pointerY },
        latest.lastEvasionTriggerPointer,
        evasionRearmDistance
      )
      if (latest.lastEvasionSignature === signature && !rearmed) return
      const now = performance.now()
      if (
        latest.lastEvasionAt !== null &&
        now - latest.lastEvasionAt < SCROLL_PREVIEW_REORDER_LOCK_MS
      ) {
        return
      }

      const compactPreview = buildCompactOuterPreviewOrder(latest, overlapHit)
      const nextScrollGroupOrder = resolveScrollGroupOrderFromWorkingOrder(
        latest,
        compactPreview.order
      )
      if (
        areSlotsEqual(compactPreview.order, latest.workingOrder) &&
        areSlotsEqual(nextScrollGroupOrder ?? [], latest.scrollGroupOrder ?? [])
      ) {
        syncDragRuntime({
          ...latest,
          dwellStartedAt: null,
          lastEvasionSignature: signature,
        })
        return
      }
      publishMoveDragState({
        ...latest,
        workingOrder: compactPreview.order,
        scrollGroupOrder: nextScrollGroupOrder ?? latest.scrollGroupOrder,
        previewSlotIndex: compactPreview.previewSlotIndex,
        hoverTargetId: overlapHit.targetId,
        hoverZone: overlapHit.zone,
        hoverIou: overlapHit.iou,
        folderPreviewTargetId: null,
        dwellStartedAt: null,
        lastEvasionSignature: signature,
        lastEvasionTriggerPointer: { x: latest.pointerX, y: latest.pointerY },
        lastEvasionAt: now,
      })
      return
    }

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
      overlapHit.zone === 'center' &&
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
    if (
      canFolderPreview &&
      overlapHit.zone === 'center' &&
      overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold
    ) {
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

  const openExistingFolderDuringDrag = (expectedTargetId: string) => {
    const latest = dragRef.current
    if (
      !latest ||
      latest.context !== 'outer' ||
      latest.draggingIds.length !== 1 ||
      latest.draggingItem.kind !== 'icon' ||
      latest.folderPreviewTargetId !== expectedTargetId ||
      latest.hoverTargetId !== expectedTargetId ||
      latest.hoverZone !== 'center'
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
    const currentOverlap = isCompactOuterDrop
      ? findCompactScrollGroupOverlapHit(validationState)
      : findTopLevelMaxOverlapHit(validationState)
    if (!currentOverlap || currentOverlap.targetId !== expectedTargetId) return
    const currentZone = isCompactOuterDrop
      ? resolveCompactScrollHoverZone(validationState, target, currentOverlap)
      : currentOverlap.zone
    if (currentZone !== 'center') return

    const sourceFolderReplacementId = latest.sourceFolderId
      ? (() => {
          const draggingIdSet = new Set(latest.draggingIds)
          const remainingChildren = getFolderChildrenById(
            itemsRef.current,
            latest.sourceFolderId
          ).filter(child => !draggingIdSet.has(child.key))
          return remainingChildren.length === 1 ? remainingChildren[0].key : null
        })()
      : null
    const nextChildren = commitIntoExistingFolderForAutoOpen(latest, expectedTargetId)
    if (!nextChildren) return
    const nextWorkingOrder = buildScrollFolderAutoOpenOrder(
      nextChildren.map(child => child.key),
      latest.draggingId
    )
    if (!nextWorkingOrder) return

    clearOuterDwellTimer()
    clearFolderAutoOpenTimer()
    onOuterDragFinished?.(latest, null, sourceFolderReplacementId)
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

    commitDragState({
      ...latest,
      context: 'folder',
      sourceFolderId: target.id,
      workingOrder: nextWorkingOrder,
      scrollGroupOrder: null,
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
    }, SCROLL_FOLDER_AUTO_OPEN_DWELL_MS)
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
      if (onCloseFolder) onCloseFolder()
      else setOpenFolderId(null)
    }

    const nextOrder = resolveTopLevelOrder(context)
    const sourceIndex = nextOrder.indexOf(state.draggingId)
    let workingOrder = [...nextOrder]
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
    nextState.scrollGroupOrder =
      context === 'outer' ? resolveActiveScrollGroupOrder(nextState) : null
    if (context === 'outer' && isCompactOuterDrop) {
      compactOuterDragBaseOrderRef.current = nextOrder
      compactOuterDragBaseWithoutDraggingRef.current = null
      compactOuterPreviewItemsRef.current = null
      compactOuterPreviewResultRef.current = null
      nextState.workingOrder = compactOuterPreviewOrderWithoutDragging(nextState)
      return {
        ...nextState,
        previewSlotIndex: null,
        dockPreviewIndex: null,
      }
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
      !canExitScrollFolderThroughMask({
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
        !canExitScrollFolderThroughMask({
          dragStartedInFolder: dragStartedInFolderRef.current,
          enteredFolderContent: enteredFolderContentRef.current,
        })
      ) {
        return
      }
      if (
        !isPointOutsideScrollFolderContent({ x: pointer.pointerX, y: pointer.pointerY }, panelRect)
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
    }, SCROLL_FOLDER_EXIT_DWELL_MS)
  }

  return {
    triggerCompactFolderPreview,
    triggerTopLevelDwellEvasion,
    scheduleFolderAutoOpen,
    moveDragToTopLevelContext,
    scheduleFolderExit,
  }
}
