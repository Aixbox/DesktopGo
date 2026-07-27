import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { GridItem } from '../model'
import { DRAG_HOLE_ID, areSlotsEqual } from '../domain/slots'
import { getFolderChildrenById } from '../domain/folderPolicy'
import { normalizeOuterSlots } from '../domain/topLevelLayout'
import { resolveMixedSelectionDragIds } from '../domain/multiSelectionPolicy'
import {
  collectElementCenters as collectCenters,
  getFolderIconMapById,
  seedMissingInitialCenters,
} from '../domain/dragWorkflowShared'
import { seedSelectedFolderChildCenters } from './seedSelectedFolderChildCenters'
import type { DragState, PendingDrag } from '../state/types'
import { activateDragPointerCapture } from './dragPointerCapture'

interface UsePagedDragStarterParams {
  columns: number
  iconImageSize: number
  selectionMode: boolean
  selectedIconKeys: ReadonlySet<string>
  openFolderId: string | null
  itemById: Map<string, GridItem>
  itemsRef: MutableRefObject<GridItem[]>
  outerSlotsRef: MutableRefObject<Array<string | null>>
  pageSizeRef: MutableRefObject<number>
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  folderTileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  dockItemRefs: MutableRefObject<Map<string, HTMLDivElement>>
  pendingPointerCaptureTargetRef: MutableRefObject<HTMLElement | null>
  dragPointerCaptureTargetRef: MutableRefObject<HTMLElement | null>
  dragStartedInFolderRef: MutableRefObject<boolean>
  enteredFolderContentRef: MutableRefObject<boolean>
  setOuterSlots: Dispatch<SetStateAction<Array<string | null>>>
  setOpenFolderId: Dispatch<SetStateAction<string | null>>
  clearTimer: () => void
  clearOuterDwellTimer: () => void
  clearFolderAutoOpenTimer: () => void
  clearFolderExitTimer: () => void
  clearPending: () => void
  resetDropVisuals: () => void
  resolveDockItemOrder: (draggingIds?: string[]) => string[]
  resolveOuterItemsForLayout: (dockOrder?: Array<string | null>) => GridItem[]
  resolveTopLevelOrder: (context: 'outer' | 'dock') => Array<string | null>
  seedMissingOuterDragCenters: (params: {
    initialCenters: Record<string, { x: number; y: number }>
    draggingIds: string[]
    sourceOrder: Array<string | null>
    leadId: string
    fallbackX: number
    fallbackY: number
  }) => void
  moveDragToTopLevelContext: (
    state: DragState,
    context: 'outer' | 'dock',
    x: number,
    y: number
  ) => DragState
  commitDragState: Dispatch<SetStateAction<DragState | null>>
}

export function usePagedDragStarter(params: UsePagedDragStarterParams) {
  return (pending: PendingDrag, x: number, y: number) => {
    prepareDragSession(params, pending)
    const sourceOrder = resolveSourceOrder(params, pending)
    const sourceIndex = sourceOrder.indexOf(pending.itemId)
    if (sourceIndex < 0) {
      params.clearPending()
      return
    }

    const draggingItem = resolveDraggingItem(params, pending)
    if (!draggingItem) {
      params.clearPending()
      return
    }
    const draggingIds = resolveMixedSelectionDragIds({
      context: pending.context,
      leadId: pending.itemId,
      leadItem: draggingItem,
      sourceOrder,
      sourceFolderId: pending.sourceFolderId,
      openFolderId: params.openFolderId,
      selectionMode: params.selectionMode,
      selectedIconKeys: params.selectedIconKeys,
      items: params.itemsRef.current,
      itemById: params.itemById,
      getTopLevelOrder: params.resolveTopLevelOrder,
    })
    const nextState = buildInitialDragState(
      params,
      pending,
      draggingItem,
      draggingIds,
      sourceOrder,
      sourceIndex,
      x,
      y
    )
    if (
      nextState.context !== 'folder' &&
      seedSelectedFolderChildCenters({
        items: params.itemsRef.current,
        draggingIds,
        initialCenters: nextState.initialCenters,
        folderTileRefs: params.folderTileRefs.current,
        tileRefs: params.tileRefs.current,
        dockItemRefs: params.dockItemRefs.current,
        iconImageSize: params.iconImageSize,
      })
    ) {
      params.setOpenFolderId(null)
    }

    if (pending.context === 'outer' && draggingIds.length > 1) {
      params.seedMissingOuterDragCenters({
        initialCenters: nextState.initialCenters,
        draggingIds,
        sourceOrder,
        leadId: pending.itemId,
        fallbackX: x,
        fallbackY: y,
      })
    }
    if (pending.context === 'folder' && draggingIds.length > 1 && draggingItem.kind === 'icon') {
      params.commitDragState(params.moveDragToTopLevelContext(nextState, 'outer', x, y))
      params.clearPending()
      return
    }

    params.dragPointerCaptureTargetRef.current = activateDragPointerCapture(
      params.pendingPointerCaptureTargetRef.current,
      pending.pointerId
    )
    params.pendingPointerCaptureTargetRef.current = null
    params.commitDragState(nextState)
    params.clearPending()
  }
}

function prepareDragSession(params: UsePagedDragStarterParams, pending: PendingDrag) {
  params.clearTimer()
  params.clearOuterDwellTimer()
  params.clearFolderAutoOpenTimer()
  params.clearFolderExitTimer()
  params.dragStartedInFolderRef.current = pending.context === 'folder'
  params.enteredFolderContentRef.current = false
  params.resetDropVisuals()
}

function resolveSourceOrder(params: UsePagedDragStarterParams, pending: PendingDrag) {
  const sourceOrder =
    pending.context === 'folder' && pending.sourceFolderId
      ? getFolderChildrenById(params.itemsRef.current, pending.sourceFolderId).map(
          child => child.key
        )
      : pending.context === 'dock'
        ? params.resolveDockItemOrder()
        : normalizeOuterSlots(
            params.outerSlotsRef.current,
            params.resolveOuterItemsForLayout(),
            params.pageSizeRef.current,
            Math.max(1, params.columns)
          )
  if (pending.context === 'outer' && !areSlotsEqual(sourceOrder, params.outerSlotsRef.current)) {
    params.outerSlotsRef.current = sourceOrder
    params.setOuterSlots(sourceOrder)
  }
  return sourceOrder
}

function resolveDraggingItem(params: UsePagedDragStarterParams, pending: PendingDrag) {
  return pending.context === 'folder' && pending.sourceFolderId
    ? getFolderIconMapById(pending.sourceFolderId, params.itemsRef.current).get(pending.itemId)
    : params.itemById.get(pending.itemId)
}

function buildInitialDragState(
  params: UsePagedDragStarterParams,
  pending: PendingDrag,
  draggingItem: GridItem,
  draggingIds: string[],
  sourceOrder: Array<string | null>,
  sourceIndex: number,
  x: number,
  y: number
): DragState {
  const workingOrder = [...sourceOrder]
  workingOrder[sourceIndex] = pending.context === 'folder' ? DRAG_HOLE_ID : null
  const initialCenters =
    pending.context === 'folder'
      ? collectCenters(params.folderTileRefs.current)
      : pending.context === 'dock'
        ? collectCenters(params.dockItemRefs.current)
        : collectCenters(params.tileRefs.current)
  seedMissingInitialCenters(
    initialCenters,
    draggingIds,
    params.tileRefs.current,
    params.dockItemRefs.current
  )
  return {
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
    initialCenters,
  }
}
