import type { MutableRefObject } from 'react'
import type { GridItem, HoverZone } from '../model'
import { buildDragItemMap } from '../domain/dragWorkflowShared'
import { OUTER_DRAG_RULES } from '../constants'
import type { DragState, OuterOverlapHit } from '../state/types'

interface UseTopLevelDwellEvasionParams {
  dragRef: MutableRefObject<DragState | null>
  itemsRef: MutableRefObject<GridItem[]>
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
  resolveTopLevelOverlapPreviewIndex: (
    state: DragState,
    target: GridItem,
    hit: OuterOverlapHit,
    nearestSlotIndex: number | null,
    candidateAnchorIndex: number | null
  ) => number | null
  tryApplyTopLevelEvasion: (state: DragState, hit: OuterOverlapHit, now: number) => DragState
  publishMoveDragState: (state: DragState | null) => void
}

export function useTopLevelDwellEvasion({
  dragRef,
  itemsRef,
  isDraggingFromDock,
  findTopLevelMaxOverlapHit,
  resolveCandidateAnchorIndexByContext,
  resolveNearestSlotIndexByContext,
  resolveTopLevelOverlapPreviewIndex,
  tryApplyTopLevelEvasion,
  publishMoveDragState,
}: UseTopLevelDwellEvasionParams) {
  return (expectedIntent: { targetId: string; zone: HoverZone }) => {
    const latest = dragRef.current
    if (!latest || latest.context === 'folder') return
    if (latest.context === 'dock' && !isDraggingFromDock(latest.draggingId)) return
    if (
      latest.hoverTargetId !== expectedIntent.targetId ||
      latest.hoverZone !== expectedIntent.zone ||
      latest.folderPreviewTargetId
    ) {
      return
    }

    const overlapHit = findTopLevelMaxOverlapHit(latest)
    if (
      !overlapHit ||
      overlapHit.targetId !== expectedIntent.targetId ||
      overlapHit.zone !== expectedIntent.zone
    ) {
      return
    }
    const target = buildDragItemMap(latest, itemsRef.current).get(overlapHit.targetId)
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
      hoverZone: overlapHit.zone,
      hoverIou: overlapHit.iou,
      folderPreviewTargetId: null,
    }
    publishMoveDragState(tryApplyTopLevelEvasion(base, overlapHit, performance.now()))
  }
}
