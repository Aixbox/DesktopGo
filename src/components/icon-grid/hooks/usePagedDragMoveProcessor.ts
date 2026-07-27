import type { MutableRefObject } from 'react'
import type { GridItem, HoverZone } from '../model'
import {
  getEvasionIntentSignature,
  getEvasionReadyDelay,
  moveDragHoleToIndex,
} from '../domain/evasionPolicy'
import { isPointOutsideFolderContent } from '../domain/folderPolicy'
import { buildDockLinearPreviewOrder } from '../domain/dockDragPolicy'
import { buildDragItemMap } from '../domain/dragWorkflowShared'
import { OUTER_DRAG_RULES } from '../constants'
import { resetOuterInteraction } from '../state/dragMachine'
import type { DragHit, DragState, OuterOverlapHit } from '../state/types'

interface PagedDragMoveProcessorParams {
  evasionRearmDistance: number
  evasionCooldownMs: number
  evasionDwellMs: number
  dragRef: MutableRefObject<DragState | null>
  folderPanelRef: MutableRefObject<HTMLDivElement | null>
  enteredFolderContentRef: MutableRefObject<boolean>
  itemsRef: MutableRefObject<GridItem[]>
  outerDwellIntentRef: MutableRefObject<{ targetId: string; zone: HoverZone } | null>
  outerDwellTimerRef: MutableRefObject<number | null>
  scheduleFolderExit: () => void
  clearFolderExitTimer: () => void
  clearOuterDwellTimer: () => void
  resolveTopLevelContextAtPoint: (x: number, y: number) => 'outer' | 'dock'
  moveDragToTopLevelContext: (
    state: DragState,
    context: 'outer' | 'dock',
    x: number,
    y: number
  ) => DragState
  maybeHandleOuterEdgeSwitch: (state: DragState, x: number, y: number) => void
  clearEdgeSwitchTimer: () => void
  resolveNearestSlotIndexByContext: (
    state: DragState,
    options?: { allowOutside?: boolean }
  ) => number | null
  resolveCandidateAnchorIndexByContext: (
    state: DragState,
    options?: { allowOutside?: boolean }
  ) => number | null
  findTopLevelMaxOverlapHit: (state: DragState) => OuterOverlapHit | null
  isDraggingFromDock: (draggingId: string) => boolean
  resolveTopLevelOverlapPreviewIndex: (
    state: DragState,
    target: GridItem,
    hit: OuterOverlapHit,
    nearestSlotIndex: number | null,
    candidateAnchorIndex: number | null
  ) => number | null
  scheduleFolderAutoOpen: (targetFolderId: string) => void
  triggerTopLevelDwellEvasion: (intent: { targetId: string; zone: HoverZone }) => void
  findHitByContext: (state: DragState, x: number, y: number) => DragHit | null
  publishMoveDragState: (state: DragState | null) => void
}

interface TopLevelMoveContext {
  runtime: PagedDragMoveProcessorParams
  state: DragState
  source: GridItem
  target: GridItem
  overlapHit: OuterOverlapHit
  nearestSlotIndex: number | null
  candidateAnchorIndex: number | null
}

export function usePagedDragMoveProcessor(runtime: PagedDragMoveProcessorParams) {
  return (pointerId: number, x: number, y: number) => {
    const current = runtime.dragRef.current
    if (!current || current.pointerId !== pointerId) return

    let baseState: DragState = { ...current, pointerX: x, pointerY: y }
    if (current.context === 'folder') {
      trackFolderBoundary(runtime, x, y)
    }
    if (baseState.context === 'folder') {
      processFolderMove(runtime, baseState, x, y)
      return
    }

    const topLevelContext = runtime.resolveTopLevelContextAtPoint(x, y)
    if (baseState.context !== topLevelContext) {
      baseState = runtime.moveDragToTopLevelContext(baseState, topLevelContext, x, y)
    }
    processTopLevelMove(runtime, baseState, x, y)
  }
}

function trackFolderBoundary(runtime: PagedDragMoveProcessorParams, x: number, y: number) {
  const panel = runtime.folderPanelRef.current
  if (!panel) return
  if (isPointOutsideFolderContent({ x, y }, panel.getBoundingClientRect())) {
    runtime.scheduleFolderExit()
    return
  }
  runtime.enteredFolderContentRef.current = true
  runtime.clearFolderExitTimer()
}

function processTopLevelMove(
  runtime: PagedDragMoveProcessorParams,
  state: DragState,
  x: number,
  y: number
) {
  if (state.context === 'outer') runtime.maybeHandleOuterEdgeSwitch(state, x, y)
  else runtime.clearEdgeSwitchTimer()

  const nearestSlotIndex = runtime.resolveNearestSlotIndexByContext(state, { allowOutside: true })
  const candidateAnchorIndex = runtime.resolveCandidateAnchorIndexByContext(state, {
    allowOutside: true,
  })
  let overlapHit = runtime.findTopLevelMaxOverlapHit(state)
  if (overlapHit && state.draggingIds.includes(overlapHit.targetId)) overlapHit = null
  if (!overlapHit) {
    publishTopLevelReset(runtime, state, nearestSlotIndex)
    return
  }

  const itemMap = buildDragItemMap(state, runtime.itemsRef.current)
  const target = itemMap.get(overlapHit.targetId)
  if (!target) {
    publishTopLevelReset(runtime, state, nearestSlotIndex)
    return
  }

  const context: TopLevelMoveContext = {
    runtime,
    state,
    source: state.draggingItem,
    target,
    overlapHit,
    nearestSlotIndex,
    candidateAnchorIndex,
  }
  if (state.context === 'dock') {
    if (runtime.isDraggingFromDock(state.draggingId)) processDockReorderMove(context)
    else processDockExternalMove(context)
    return
  }
  processOuterOverlapMove(context)
}

function publishTopLevelReset(
  runtime: PagedDragMoveProcessorParams,
  state: DragState,
  nearestSlotIndex: number | null
) {
  runtime.clearOuterDwellTimer()
  runtime.publishMoveDragState({
    ...resetOuterInteraction(state, nearestSlotIndex),
    dockPreviewIndex: state.context === 'dock' ? nearestSlotIndex : null,
  })
}

function canPreviewFolder(
  source: GridItem,
  target: GridItem,
  overlapHit: OuterOverlapHit,
  multiDrag: boolean
) {
  const canCreate = !multiDrag && source.kind === 'icon' && target.kind === 'icon'
  const canAdd = source.kind === 'icon' && target.kind === 'folder'
  return (canCreate || canAdd) && overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold
}

function processDockExternalMove({
  runtime,
  state,
  source,
  target,
  overlapHit,
  nearestSlotIndex,
}: TopLevelMoveContext) {
  runtime.clearOuterDwellTimer()
  const stableDockPreviewIndex =
    state.dockPreviewIndex ?? nearestSlotIndex ?? overlapHit.targetIndex
  if (canPreviewFolder(source, target, overlapHit, state.draggingIds.length > 1)) {
    runtime.publishMoveDragState({
      ...state,
      previewSlotIndex: overlapHit.targetIndex,
      dockPreviewIndex: stableDockPreviewIndex,
      hoverTargetId: overlapHit.targetId,
      hoverZone: overlapHit.zone,
      hoverIou: overlapHit.iou,
      centerStartedAt: null,
      dwellStartedAt: null,
      folderPreviewTargetId: overlapHit.targetId,
      lastEvasionSignature: null,
    })
    return
  }
  runtime.publishMoveDragState({
    ...resetOuterInteraction(state, nearestSlotIndex),
    dockPreviewIndex: nearestSlotIndex,
    hoverTargetId: overlapHit.targetId,
    hoverZone: overlapHit.zone,
    hoverIou: overlapHit.iou,
  })
}

function processDockReorderMove(context: TopLevelMoveContext) {
  const { runtime, state, source, target, overlapHit } = context
  runtime.clearOuterDwellTimer()
  if (canPreviewFolder(source, target, overlapHit, state.draggingIds.length > 1)) {
    runtime.publishMoveDragState({
      ...state,
      previewSlotIndex: overlapHit.targetIndex,
      dockPreviewIndex: overlapHit.targetIndex,
      hoverTargetId: overlapHit.targetId,
      hoverZone: overlapHit.zone,
      hoverIou: overlapHit.iou,
      centerStartedAt: null,
      dwellStartedAt: null,
      folderPreviewTargetId: overlapHit.targetId,
      lastEvasionSignature: null,
    })
    return
  }

  const currentHoleIndex = state.workingOrder.indexOf(null)
  const currentTargetIndex = state.workingOrder.indexOf(overlapHit.targetId)
  const placeAfter =
    overlapHit.zone === 'right'
      ? true
      : overlapHit.zone === 'left'
        ? false
        : currentHoleIndex > currentTargetIndex
  const workingOrder = buildDockLinearPreviewOrder(
    state.workingOrder,
    overlapHit.targetId,
    placeAfter
  )
  const previewIndex = workingOrder.indexOf(null)
  runtime.publishMoveDragState({
    ...resetOuterInteraction(state, previewIndex),
    workingOrder,
    previewSlotIndex: previewIndex,
    dockPreviewIndex: previewIndex,
    hoverTargetId: overlapHit.targetId,
    hoverZone: overlapHit.zone,
    hoverIou: overlapHit.iou,
  })
}

function processOuterOverlapMove(context: TopLevelMoveContext) {
  const { runtime, state, source, target, overlapHit, nearestSlotIndex, candidateAnchorIndex } =
    context
  const now = performance.now()
  const next: DragState = {
    ...state,
    previewSlotIndex: runtime.resolveTopLevelOverlapPreviewIndex(
      state,
      target,
      overlapHit,
      nearestSlotIndex,
      candidateAnchorIndex
    ),
    dockPreviewIndex: null,
    hoverTargetId: overlapHit.targetId,
    hoverZone: overlapHit.zone,
    hoverIou: overlapHit.iou,
    centerStartedAt: null,
  }

  if (canPreviewFolder(source, target, overlapHit, state.draggingIds.length > 1)) {
    runtime.clearOuterDwellTimer()
    next.folderPreviewTargetId = overlapHit.targetId
    next.dwellStartedAt = null
    next.lastEvasionSignature = null
    runtime.publishMoveDragState(next)
    if (target.kind === 'folder' && overlapHit.zone === 'center') {
      runtime.scheduleFolderAutoOpen(overlapHit.targetId)
    }
    return
  }

  next.folderPreviewTargetId = null
  scheduleOuterEvasion(runtime, state, next, overlapHit, now)
}

function scheduleOuterEvasion(
  runtime: PagedDragMoveProcessorParams,
  previous: DragState,
  next: DragState,
  overlapHit: OuterOverlapHit,
  now: number
) {
  const intentSignature = getEvasionIntentSignature(overlapHit.targetId, overlapHit.zone)
  const sameIntent =
    previous.hoverTargetId === overlapHit.targetId && previous.hoverZone === overlapHit.zone
  next.dwellStartedAt =
    sameIntent && previous.dwellStartedAt !== null ? previous.dwellStartedAt : now
  if (!sameIntent) next.lastEvasionSignature = null
  if (next.lastEvasionSignature === intentSignature) {
    runtime.clearOuterDwellTimer()
    runtime.publishMoveDragState(next)
    return
  }

  const remainingMs = getEvasionReadyDelay({
    now,
    dwellStartedAt: next.dwellStartedAt ?? now,
    dwellMs: runtime.evasionDwellMs,
    lastEvasionAt: next.lastEvasionAt,
    cooldownMs: runtime.evasionCooldownMs,
  })
  const pendingIntent = runtime.outerDwellIntentRef.current
  if (pendingIntent?.targetId !== overlapHit.targetId || pendingIntent?.zone !== overlapHit.zone) {
    runtime.clearOuterDwellTimer()
  }
  if (runtime.outerDwellTimerRef.current === null) {
    runtime.outerDwellIntentRef.current = {
      targetId: overlapHit.targetId,
      zone: overlapHit.zone,
    }
    runtime.outerDwellTimerRef.current = window.setTimeout(() => {
      const intent = runtime.outerDwellIntentRef.current
      runtime.outerDwellTimerRef.current = null
      runtime.outerDwellIntentRef.current = null
      if (intent) runtime.triggerTopLevelDwellEvasion(intent)
    }, remainingMs)
  }
  runtime.publishMoveDragState(next)
}

function processFolderMove(
  runtime: PagedDragMoveProcessorParams,
  state: DragState,
  x: number,
  y: number
) {
  runtime.clearOuterDwellTimer()
  const hit = runtime.findHitByContext(state, x, y)
  if (!hit) {
    runtime.publishMoveDragState({
      ...state,
      hoverTargetId: null,
      hoverZone: null,
      hoverIou: 0,
      centerStartedAt: null,
      dwellStartedAt: null,
      folderPreviewTargetId: null,
      lastEvasionSignature: null,
    })
    return
  }
  if (hit.targetId === null) {
    runtime.publishMoveDragState({
      ...state,
      hoverTargetId: null,
      hoverZone: null,
      hoverIou: 0,
      centerStartedAt: null,
      dwellStartedAt: null,
      folderPreviewTargetId: null,
      lastEvasionSignature: null,
      workingOrder: moveDragHoleToIndex(state.workingOrder, hit.globalSlotIndex),
    })
    return
  }

  const target = buildDragItemMap(state, runtime.itemsRef.current).get(hit.targetId)
  if (!target) {
    runtime.publishMoveDragState(state)
    return
  }
  const next: DragState = {
    ...state,
    hoverTargetId: hit.targetId,
    hoverZone: hit.zone,
    hoverIou: 0,
    centerStartedAt: null,
    dwellStartedAt: null,
    folderPreviewTargetId: null,
  }
  const sourceCenter = state.initialCenters[state.draggingId]
  const targetCenter = state.initialCenters[hit.targetId]
  const horizontal =
    !sourceCenter || !targetCenter
      ? null
      : targetCenter.x > sourceCenter.x
        ? 'right'
        : targetCenter.x < sourceCenter.x
          ? 'left'
          : null
  const shouldEvasion =
    state.draggingItem.kind === 'icon' &&
    target.kind === 'icon' &&
    (hit.zone === 'left' || hit.zone === 'right') &&
    horizontal === hit.zone
  applyFolderEvasion(runtime, state, next, hit, shouldEvasion, x, y)
}

function applyFolderEvasion(
  runtime: PagedDragMoveProcessorParams,
  previous: DragState,
  next: DragState,
  hit: DragHit,
  shouldEvasion: boolean,
  x: number,
  y: number
) {
  const targetIndex = previous.workingOrder.indexOf(hit.targetId)
  if (targetIndex < 0) {
    runtime.publishMoveDragState(next)
    return
  }
  let desiredHoleIndex = targetIndex
  if (shouldEvasion) {
    const now = performance.now()
    const signature = `${hit.targetId}:${hit.zone}`
    const movedEnough =
      !previous.lastEvasionTriggerPointer ||
      Math.hypot(
        x - previous.lastEvasionTriggerPointer.x,
        y - previous.lastEvasionTriggerPointer.y
      ) >= runtime.evasionRearmDistance
    const cooledDown =
      previous.lastEvasionAt === null || now - previous.lastEvasionAt >= runtime.evasionCooldownMs
    if (!movedEnough || !cooledDown || previous.lastEvasionSignature === signature) {
      next.lastEvasionSignature = previous.lastEvasionSignature
      next.lastEvasionAt = previous.lastEvasionAt
      runtime.publishMoveDragState(next)
      return
    }
    next.lastEvasionSignature = signature
    next.lastEvasionTriggerPointer = { x, y }
    next.lastEvasionAt = now
  } else {
    next.lastEvasionSignature = null
    next.lastEvasionAt = previous.lastEvasionAt
    if (hit.zone === 'right' || hit.zone === 'down') {
      desiredHoleIndex = Math.min(previous.workingOrder.length - 1, targetIndex + 1)
    }
  }
  next.workingOrder = moveDragHoleToIndex(previous.workingOrder, desiredHoleIndex)
  runtime.publishMoveDragState(next)
}
