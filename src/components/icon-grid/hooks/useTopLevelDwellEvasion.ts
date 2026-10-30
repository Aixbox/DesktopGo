import type { MutableRefObject } from 'react'
import type { GridItem, HoverZone } from '../model'
import { resolveItemById } from '../domain/dragWorkflowShared'
import { OUTER_DRAG_RULES } from '../constants'
import type { DragState, OuterOverlapHit } from '../state/types'

interface UseTopLevelDwellEvasionParams {
  dragRef: MutableRefObject<DragState | null>
  itemsRef: MutableRefObject<GridItem[]>
  itemById: ReadonlyMap<string, GridItem>
  isDraggingFromDock: (draggingId: string) => boolean
  findTopLevelMaxOverlapHit: (state: DragState) => OuterOverlapHit | null
  resolveCandidateAnchorIndexByContext: (
    state: DragState,
    options?: { allowOutside?: boolean }
  ) => number | null
  resolveNearestSlotIndexByContext: (
    state: DragState,
    options?: { allowOutside?: boolean }
  ) => number | null
  resolveRawOuterCellIndex: (
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
  tryApplyTopLevelEvasion: (state: DragState, hit: OuterOverlapHit | null, now: number) => DragState
  publishMoveDragState: (state: DragState | null) => void
}

export function useTopLevelDwellEvasion({
  dragRef,
  itemsRef,
  itemById,
  isDraggingFromDock,
  findTopLevelMaxOverlapHit,
  resolveCandidateAnchorIndexByContext,
  resolveNearestSlotIndexByContext,
  resolveRawOuterCellIndex,
  resolveTopLevelOverlapPreviewIndex,
  tryApplyTopLevelEvasion,
  publishMoveDragState,
}: UseTopLevelDwellEvasionParams) {
  return (expectedIntent: { targetId: string; targetIndex: number | null; zone: HoverZone }) => {
    const current = dragRef.current
    if (!current || current.context === 'folder') return
    const cellBasedAlarm = expectedIntent.targetIndex !== null
    let latest = current
    if (cellBasedAlarm) {
      if (current.context !== 'outer') return
      const visibleHit = findTopLevelMaxOverlapHit(current)
      latest = {
        ...current,
        lastReorderCellIndex:
          visibleHit && !current.draggingIds.includes(visibleHit.targetId)
            ? visibleHit.targetIndex
            : resolveRawOuterCellIndex(current, { allowOutside: true }),
      }
    } else {
      if (current.context === 'dock' && !isDraggingFromDock(current.draggingId)) return
      if (
        current.hoverTargetId !== expectedIntent.targetId ||
        current.hoverZone !== expectedIntent.zone
      ) {
        return
      }
    }
    if (latest.folderPreviewTargetId) return

    const overlapHit = findTopLevelMaxOverlapHit(latest)
    if (!overlapHit) {
      if (cellBasedAlarm) {
        publishMoveDragState(tryApplyTopLevelEvasion(latest, null, performance.now()))
      }
      return
    }
    if (
      !cellBasedAlarm &&
      (overlapHit.targetId !== expectedIntent.targetId || overlapHit.zone !== expectedIntent.zone)
    ) {
      return
    }
    const target = resolveItemById(itemById, itemsRef.current, overlapHit.targetId)
    if (!target) return

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
      latest.draggingItem.kind === 'icon' &&
      target.kind === 'folder' &&
      overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold
    const canCreateFolder =
      latest.draggingIds.length === 1 &&
      latest.draggingItem.kind === 'icon' &&
      target.kind === 'icon' &&
      overlapHit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold
    if (canAddToExistingFolder || canCreateFolder) {
      publishMoveDragState({
        ...latest,
        previewSlotIndex,
        dockPreviewIndex: null,
        hoverTargetId: overlapHit.targetId,
        hoverTargetIndex: overlapHit.targetIndex,
        hoverZone: overlapHit.zone,
        hoverIou: overlapHit.iou,
        folderPreviewTargetId: overlapHit.targetId,
        dwellStartedAt: null,
        lastEvasionSignature: null,
      })
      return
    }

    const base: DragState = {
      ...latest,
      previewSlotIndex,
      dockPreviewIndex: null,
      hoverTargetId: overlapHit.targetId,
      hoverTargetIndex: overlapHit.targetIndex,
      hoverZone: overlapHit.zone,
      hoverIou: overlapHit.iou,
      folderPreviewTargetId: null,
    }
    publishMoveDragState(tryApplyTopLevelEvasion(base, overlapHit, performance.now()))
  }
}
