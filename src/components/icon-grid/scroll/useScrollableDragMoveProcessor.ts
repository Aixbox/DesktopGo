import type { MutableRefObject } from 'react'
import type { GridItem, HoverZone } from '../model'
import { getId } from '../model'
import { areSlotsEqual } from '../domain/slots'
import { moveDragHoleToIndex } from '../domain/evasionPolicy'
import { buildDockLinearPreviewOrder } from '../domain/dockDragPolicy'
import { buildDragItemMap } from '../domain/dragWorkflowShared'
import { OUTER_DRAG_RULES } from '../constants'
import { resetOuterInteraction } from '../state/dragMachine'
import type { DragHit, DragState, OuterOverlapHit } from '../state/types'
import {
  buildCompactOuterDropPreview,
  isCompactSlotVacantForDrag,
  resolveCompactStableTargetId,
} from './scrollTopLevelLayout'
import {
  hasScrollEvasionRearmed,
  isPointOutsideScrollFolderContent,
  SCROLL_FOLDER_PREVIEW_DWELL_MS,
  SCROLL_PREVIEW_REORDER_DWELL_MS,
  SCROLL_PREVIEW_REORDER_LOCK_MS,
} from './scrollGroupLayout'

interface ScrollableDragMoveProcessorParams {
  isCompactOuterDrop: boolean
  columns: number
  evasionRearmDistance: number
  evasionCooldownMs: number
  dragRef: MutableRefObject<DragState | null>
  folderPanelRef: MutableRefObject<HTMLDivElement | null>
  enteredFolderContentRef: MutableRefObject<boolean>
  itemsRef: MutableRefObject<GridItem[]>
  pageSizeRef: MutableRefObject<number>
  compactOuterDragBaseOrderRef: MutableRefObject<Array<string | null> | null>
  outerDwellTargetIdRef: MutableRefObject<string | null>
  outerDwellZoneRef: MutableRefObject<HoverZone | null>
  outerDwellTimerRef: MutableRefObject<number | null>
  scheduleFolderExit: () => void
  clearFolderExitTimer: () => void
  clearOuterDwellTimer: () => void
  maybeHandleOuterEdgeSwitch: (state: DragState, x: number, y: number) => void
  clearEdgeSwitchTimer: () => void
  resolveTopLevelContextAtPoint: (x: number, y: number) => 'outer' | 'dock'
  moveDragToTopLevelContext: (
    state: DragState,
    context: 'outer' | 'dock',
    x: number,
    y: number
  ) => DragState
  resolveNearestSlotIndexByContext: (
    state: DragState,
    options?: { allowOutside?: boolean }
  ) => number | null
  resolveCandidateAnchorIndexByContext: (
    state: DragState,
    options?: { allowOutside?: boolean }
  ) => number | null
  getOuterGridElementAtPoint?: (
    x: number,
    y: number
  ) => { element: HTMLDivElement; pageIndex: number } | null
  findHitByContext: (state: DragState, x: number, y: number) => DragHit | null
  compactOuterPreviewOrderWithoutDragging: (state: DragState) => Array<string | null>
  findTopLevelMaxOverlapHit: (state: DragState) => OuterOverlapHit | null
  resolveCompactOuterPreviewItems: (state: DragState) => GridItem[]
  resolveCompactOuterTopLevelOrder: () => Array<string | null>
  getOuterMinPageCount?: () => number
  resolveScrollGroupOrderFromWorkingOrder: (
    state: DragState,
    workingOrder: Array<string | null>
  ) => string[] | null
  publishMoveDragState: (state: DragState | null) => void
  isDraggingFromDock: (draggingId: string) => boolean
  resolveCompactScrollHoverZone: (
    state: DragState,
    target: GridItem,
    hit: OuterOverlapHit
  ) => HoverZone
  resolveTopLevelOverlapPreviewIndex: (
    state: DragState,
    target: GridItem,
    hit: OuterOverlapHit,
    nearestSlotIndex: number | null,
    candidateAnchorIndex: number | null
  ) => number | null
  scheduleFolderAutoOpen: (targetFolderId: string) => void
  triggerCompactFolderPreview: (expectedTargetId: string) => void
  triggerTopLevelDwellEvasion: (expectedTargetId: string, expectedZone?: HoverZone | null) => void
}

export function useScrollableDragMoveProcessor(runtime: ScrollableDragMoveProcessorParams) {
  const {
    dragRef,
    folderPanelRef,
    scheduleFolderExit,
    enteredFolderContentRef,
    clearFolderExitTimer,
    resolveTopLevelContextAtPoint,
    moveDragToTopLevelContext,
    isCompactOuterDrop,
    maybeHandleOuterEdgeSwitch,
    clearEdgeSwitchTimer,
    resolveNearestSlotIndexByContext,
    resolveCandidateAnchorIndexByContext,
    getOuterGridElementAtPoint,
    findHitByContext,
    compactOuterPreviewOrderWithoutDragging,
    findTopLevelMaxOverlapHit,
    resolveCompactOuterPreviewItems,
    pageSizeRef,
    columns,
    evasionRearmDistance,
    evasionCooldownMs,
    compactOuterDragBaseOrderRef,
    resolveCompactOuterTopLevelOrder,
    getOuterMinPageCount,
    resolveScrollGroupOrderFromWorkingOrder,
    publishMoveDragState,
    clearOuterDwellTimer,
    itemsRef,
    isDraggingFromDock,
    resolveCompactScrollHoverZone,
    resolveTopLevelOverlapPreviewIndex,
    scheduleFolderAutoOpen,
    outerDwellTargetIdRef,
    outerDwellZoneRef,
    outerDwellTimerRef,
    triggerCompactFolderPreview,
    triggerTopLevelDwellEvasion,
  } = runtime

  return (pointerId: number, x: number, y: number) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointerId) return

    let baseState: DragState = { ...current, pointerX: x, pointerY: y }
    if (current.context === 'folder') {
      const panel = folderPanelRef.current
      if (panel) {
        const panelRect = panel.getBoundingClientRect()
        const outsidePanel = isPointOutsideScrollFolderContent({ x, y }, panelRect)
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

      if (baseState.context === 'outer' && !isCompactOuterDrop) {
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
      const compactGridAtPointer =
        isCompactOuterDrop &&
        baseState.context === 'outer' &&
        !baseState.scrollGroupOrder &&
        getOuterGridElementAtPoint
          ? getOuterGridElementAtPoint(x, y)
          : null
      const rawCompactGridHit =
        isCompactOuterDrop && baseState.context === 'outer' && !baseState.scrollGroupOrder
          ? findHitByContext(baseState, x, y)
          : null
      const compactGridHit = rawCompactGridHit
        ? {
            ...rawCompactGridHit,
            targetId: resolveCompactStableTargetId({
              baseOrder: compactOuterPreviewOrderWithoutDragging(baseState),
              workingOrder: baseState.workingOrder,
              draggingIds: baseState.draggingIds,
              slotIndex: rawCompactGridHit.globalSlotIndex,
            }),
          }
        : null
      let overlapHit = findTopLevelMaxOverlapHit(baseState)
      if (overlapHit && baseState.draggingIds.includes(overlapHit.targetId)) {
        overlapHit = null
      }
      const compactGapOverlapTarget = overlapHit
        ? resolveCompactOuterPreviewItems(baseState).find(
            item => getId(item) === overlapHit?.targetId
          )
        : null
      const isCompactFolderBoundaryGap = compactGapOverlapTarget?.kind === 'folder'
      if (compactGridAtPointer && !compactGridHit && !isCompactFolderBoundaryGap) {
        overlapHit = null
      }
      if (
        compactGridHit?.targetId &&
        overlapHit &&
        overlapHit.targetId !== compactGridHit.targetId
      ) {
        overlapHit = null
      }
      if (
        compactGridHit &&
        isCompactSlotVacantForDrag({
          order: baseState.workingOrder,
          items: resolveCompactOuterPreviewItems(baseState),
          draggingIds: baseState.draggingIds,
          slotIndex: compactGridHit.globalSlotIndex,
          pageSize: pageSizeRef.current,
          columns,
        })
      ) {
        overlapHit = null
      }
      const compactOverlapTargetChanged =
        isCompactOuterDrop &&
        baseState.context === 'outer' &&
        overlapHit !== null &&
        baseState.hoverTargetId !== null &&
        baseState.hoverTargetId !== overlapHit.targetId
      const compactMovedSinceLastReorder =
        !baseState.lastEvasionTriggerPointer ||
        Math.hypot(
          x - baseState.lastEvasionTriggerPointer.x,
          y - baseState.lastEvasionTriggerPointer.y
        ) >= evasionRearmDistance
      if (compactOverlapTargetChanged && !compactMovedSinceLastReorder) {
        clearOuterDwellTimer()
        publishMoveDragState(baseState)
        return
      }
      const draggingFromDock = isDraggingFromDock(baseState.draggingId)
      const isMultiDockDrag = baseState.context === 'dock' && baseState.draggingIds.length > 1

      if (!overlapHit) {
        clearOuterDwellTimer()
        if (compactGridHit) {
          const compactPreview = buildCompactOuterDropPreview({
            slots: compactOuterDragBaseOrderRef.current ?? resolveCompactOuterTopLevelOrder(),
            items: resolveCompactOuterPreviewItems(baseState),
            draggingIds: baseState.draggingIds,
            sourceIndex: baseState.sourceSlotIndex,
            targetIndex: compactGridHit.globalSlotIndex,
            targetId: compactGridHit.targetId,
            zone: compactGridHit.zone,
            pageSize: pageSizeRef.current,
            columns,
            minPageCount: getOuterMinPageCount?.(),
          })
          const compactPreviewChanged = !areSlotsEqual(compactPreview.order, baseState.workingOrder)
          publishMoveDragState({
            ...baseState,
            workingOrder: compactPreview.order,
            scrollGroupOrder: resolveScrollGroupOrderFromWorkingOrder(
              baseState,
              compactPreview.order
            ),
            previewSlotIndex: compactPreview.previewSlotIndex,
            dockPreviewIndex: null,
            hoverTargetId: compactGridHit.targetId,
            hoverZone: compactGridHit.zone,
            hoverIou: 0,
            centerStartedAt: null,
            dwellStartedAt: null,
            folderPreviewTargetId: null,
            lastEvasionSignature: compactPreviewChanged
              ? `compact-grid:${compactGridHit.targetId ?? 'empty'}:${compactGridHit.globalSlotIndex}`
              : baseState.lastEvasionSignature,
            lastEvasionTriggerPointer: compactPreviewChanged
              ? { x, y }
              : baseState.lastEvasionTriggerPointer,
            lastEvasionAt: compactPreviewChanged ? performance.now() : baseState.lastEvasionAt,
          })
          return
        }
        const resetState: DragState =
          isCompactOuterDrop && baseState.context === 'outer'
            ? {
                ...baseState,
                hoverTargetId: null,
                hoverZone: null,
                hoverIou: 0,
                centerStartedAt: null,
                dwellStartedAt: null,
                folderPreviewTargetId: null,
                lastEvasionSignature: null,
                dockPreviewIndex: null,
              }
            : {
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
        const resetState: DragState =
          isCompactOuterDrop && baseState.context === 'outer'
            ? {
                ...baseState,
                hoverTargetId: null,
                hoverZone: null,
                hoverIou: 0,
                centerStartedAt: null,
                dwellStartedAt: null,
                folderPreviewTargetId: null,
                lastEvasionSignature: null,
                dockPreviewIndex: null,
              }
            : {
                ...resetOuterInteraction(baseState, nearestSlotIndex),
                dockPreviewIndex: baseState.context === 'dock' ? nearestSlotIndex : null,
              }
        publishMoveDragState(resetState)
        return
      }

      if (isCompactOuterDrop && baseState.context === 'outer') {
        overlapHit = {
          ...overlapHit,
          zone: resolveCompactScrollHoverZone(baseState, target, overlapHit),
        }
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
      const canAddToExistingFolder = source.kind === 'icon' && target.kind === 'folder'
      const canPreviewFolderAtCenter =
        overlapHit.zone === 'center' &&
        (canFolderPreview || canAddToExistingFolder) &&
        (isCompactOuterDrop || overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold)
      if (canPreviewFolderAtCenter) {
        if (isCompactOuterDrop && baseState.context === 'outer') {
          if (baseState.folderPreviewTargetId === overlapHit.targetId) {
            clearOuterDwellTimer()
            next.folderPreviewTargetId = overlapHit.targetId
            next.dwellStartedAt = null
            next.lastEvasionSignature = null
            publishMoveDragState(next)
            if (target.kind === 'folder') {
              scheduleFolderAutoOpen(overlapHit.targetId)
            }
            return
          }

          const now = performance.now()
          const sameTargetAndZone =
            baseState.hoverTargetId === overlapHit.targetId && baseState.hoverZone === 'center'
          next.folderPreviewTargetId = null
          next.dwellStartedAt =
            sameTargetAndZone && baseState.dwellStartedAt !== null ? baseState.dwellStartedAt : now
          next.lastEvasionSignature = null
          const dwellElapsed = now - (next.dwellStartedAt ?? now)
          const targetChanged =
            outerDwellTargetIdRef.current !== overlapHit.targetId ||
            outerDwellZoneRef.current !== 'center'
          if (targetChanged) clearOuterDwellTimer()
          if (outerDwellTimerRef.current === null) {
            outerDwellTargetIdRef.current = overlapHit.targetId
            outerDwellZoneRef.current = 'center'
            outerDwellTimerRef.current = window.setTimeout(
              () => {
                const targetId = outerDwellTargetIdRef.current
                outerDwellTimerRef.current = null
                if (targetId) triggerCompactFolderPreview(targetId)
              },
              Math.max(0, SCROLL_FOLDER_PREVIEW_DWELL_MS - dwellElapsed)
            )
          }
          publishMoveDragState(next)
          return
        }

        clearOuterDwellTimer()
        next.folderPreviewTargetId = overlapHit.targetId
        next.dwellStartedAt = null
        next.lastEvasionSignature = null
        publishMoveDragState(next)
        if (baseState.context === 'outer' && target.kind === 'folder') {
          scheduleFolderAutoOpen(overlapHit.targetId)
        }
        return
      }

      if (isCompactOuterDrop && baseState.context === 'outer') {
        next.folderPreviewTargetId = null
        const signature = `compact-overlap:${overlapHit.targetId}:${overlapHit.zone}`
        const rearmed = hasScrollEvasionRearmed(
          { x, y },
          baseState.lastEvasionTriggerPointer,
          evasionRearmDistance
        )
        if (baseState.lastEvasionSignature === signature && !rearmed) {
          clearOuterDwellTimer()
          next.dwellStartedAt = null
          publishMoveDragState(next)
          return
        }

        const now = performance.now()
        const sameTargetAndZone =
          baseState.hoverTargetId === overlapHit.targetId && baseState.hoverZone === overlapHit.zone
        next.dwellStartedAt =
          sameTargetAndZone && baseState.dwellStartedAt !== null ? baseState.dwellStartedAt : now
        const dwellElapsed = now - (next.dwellStartedAt ?? now)
        const lockRemaining =
          baseState.lastEvasionAt === null
            ? 0
            : Math.max(0, SCROLL_PREVIEW_REORDER_LOCK_MS - (now - baseState.lastEvasionAt))
        const remainingMs = Math.max(
          0,
          SCROLL_PREVIEW_REORDER_DWELL_MS - dwellElapsed,
          lockRemaining
        )
        const targetChanged =
          outerDwellTargetIdRef.current !== overlapHit.targetId ||
          outerDwellZoneRef.current !== overlapHit.zone
        if (targetChanged) clearOuterDwellTimer()
        if (outerDwellTimerRef.current === null) {
          outerDwellTargetIdRef.current = overlapHit.targetId
          outerDwellZoneRef.current = overlapHit.zone
          outerDwellTimerRef.current = window.setTimeout(() => {
            const targetId = outerDwellTargetIdRef.current
            const zone = outerDwellZoneRef.current
            outerDwellTimerRef.current = null
            if (!targetId || !zone) return
            triggerTopLevelDwellEvasion(targetId, zone)
          }, remainingMs)
        }
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
        outerDwellZoneRef.current = null
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
        ) >= evasionRearmDistance
      const cooledDownSinceLastEvasion =
        baseState.lastEvasionAt === null || now - baseState.lastEvasionAt >= evasionCooldownMs

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
}
