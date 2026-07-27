import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { GridItem } from '../model'
import { DRAG_HOLE_ID, areSlotsEqual } from '../domain/slots'
import { getFolderChildrenById } from '../domain/folderPolicy'
import { resolveMixedSelectionDragIds } from '../domain/multiSelectionPolicy'
import {
  collectElementCenters as collectCenters,
  getFolderIconMapById as getFolderMapById,
  seedMissingInitialCenters,
} from '../domain/dragWorkflowShared'
import { seedSelectedFolderChildCenters } from '../hooks/seedSelectedFolderChildCenters'
import type { DragState, PendingDrag } from '../state/types'
import { activateDragPointerCapture } from '../hooks/dragPointerCapture'

interface ScrollableDragStarterParams {
  isCompactOuterDrop: boolean
  iconImageSize: number
  selectionMode: boolean
  selectedIconKeys: ReadonlySet<string>
  openFolderId: string | null
  itemById: Map<string, GridItem>
  itemsRef: MutableRefObject<GridItem[]>
  outerSlotsRef: MutableRefObject<Array<string | null>>
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  folderTileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  dockItemRefs: MutableRefObject<Map<string, HTMLDivElement>>
  pendingPointerCaptureTargetRef: MutableRefObject<HTMLElement | null>
  dragPointerCaptureTargetRef: MutableRefObject<HTMLElement | null>
  dragStartedInFolderRef: MutableRefObject<boolean>
  enteredFolderContentRef: MutableRefObject<boolean>
  compactOuterDragBaseOrderRef: MutableRefObject<Array<string | null> | null>
  compactOuterDragBaseWithoutDraggingRef: MutableRefObject<Array<string | null> | null>
  compactOuterPreviewItemsRef: MutableRefObject<GridItem[] | null>
  compactOuterPreviewResultRef: MutableRefObject<{
    signature: string
    order: Array<string | null>
    previewSlotIndex: number | null
  } | null>
  compactScrollLastHitPointRef: MutableRefObject<{ x: number; y: number } | null>
  compactScrollLastHitIdRef: MutableRefObject<string | null>
  setOuterSlots: Dispatch<SetStateAction<Array<string | null>>>
  setOpenFolderId: Dispatch<SetStateAction<string | null>>
  clearTimer: () => void
  clearOuterDwellTimer: () => void
  clearFolderExitTimer: () => void
  clearPending: () => void
  resetDropVisuals: () => void
  resolveDockItemOrder: (draggingIds?: string[]) => string[]
  resolveCompactOuterTopLevelOrder: () => Array<string | null>
  resolvePagedOuterTopLevelOrder: () => Array<string | null>
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
  moveDragToTopLevelContext: (
    state: DragState,
    context: 'outer' | 'dock',
    x: number,
    y: number
  ) => DragState
  commitDragState: Dispatch<SetStateAction<DragState | null>>
}

export function useScrollableDragStarter(params: ScrollableDragStarterParams) {
  const {
    clearTimer,
    clearOuterDwellTimer,
    clearFolderExitTimer,
    resetDropVisuals,
    compactOuterDragBaseOrderRef,
    compactOuterDragBaseWithoutDraggingRef,
    compactOuterPreviewItemsRef,
    compactOuterPreviewResultRef,
    compactScrollLastHitPointRef,
    compactScrollLastHitIdRef,
    resolveDockItemOrder,
    resolveCompactOuterTopLevelOrder,
    resolvePagedOuterTopLevelOrder,
    resolveTopLevelOrder,
    outerSlotsRef,
    setOuterSlots,
    itemsRef,
    itemById,
    openFolderId,
    selectionMode,
    selectedIconKeys,
    tileRefs,
    folderTileRefs,
    dockItemRefs,
    resolveActiveScrollGroupOrder,
    compactOuterPreviewOrderWithoutDragging,
    seedMissingOuterDragCenters,
    moveDragToTopLevelContext,
    pendingPointerCaptureTargetRef,
    dragPointerCaptureTargetRef,
    dragStartedInFolderRef,
    enteredFolderContentRef,
    commitDragState,
    clearPending,
    setOpenFolderId,
    isCompactOuterDrop,
    iconImageSize,
  } = params

  return (pending: PendingDrag, x: number, y: number) => {
    clearTimer()
    clearOuterDwellTimer()
    clearFolderExitTimer()
    dragStartedInFolderRef.current = pending.context === 'folder'
    enteredFolderContentRef.current = false
    resetDropVisuals()
    compactOuterDragBaseOrderRef.current = null
    compactOuterDragBaseWithoutDraggingRef.current = null
    compactOuterPreviewItemsRef.current = null
    compactOuterPreviewResultRef.current = null
    compactScrollLastHitPointRef.current = null
    compactScrollLastHitIdRef.current = null
    const sourceOrder =
      pending.context === 'folder' && pending.sourceFolderId
        ? getFolderChildrenById(itemsRef.current, pending.sourceFolderId).map(child => child.key)
        : pending.context === 'dock'
          ? resolveDockItemOrder()
          : isCompactOuterDrop
            ? resolveCompactOuterTopLevelOrder()
            : resolvePagedOuterTopLevelOrder()
    if (pending.context === 'outer' && isCompactOuterDrop) {
      compactOuterDragBaseOrderRef.current = sourceOrder
    }
    if (
      pending.context === 'outer' &&
      !isCompactOuterDrop &&
      !areSlotsEqual(sourceOrder, outerSlotsRef.current)
    ) {
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
      selectedIconKeys,
      items: itemsRef.current,
      itemById,
      getTopLevelOrder: resolveTopLevelOrder,
    })
    let workingOrder: Array<string | null> = [...sourceOrder]
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
    nextState.scrollGroupOrder =
      pending.context === 'outer' ? resolveActiveScrollGroupOrder(nextState) : null
    if (pending.context === 'outer' && isCompactOuterDrop) {
      nextState.workingOrder = compactOuterPreviewOrderWithoutDragging(nextState)
      nextState.previewSlotIndex = null
      nextState.dockPreviewIndex = null
    }
    seedMissingInitialCenters(
      nextState.initialCenters,
      draggingIds,
      tileRefs.current,
      dockItemRefs.current
    )
    if (
      pending.context !== 'folder' &&
      seedSelectedFolderChildCenters({
        items: itemsRef.current,
        draggingIds,
        initialCenters: nextState.initialCenters,
        folderTileRefs: folderTileRefs.current,
        tileRefs: tileRefs.current,
        dockItemRefs: dockItemRefs.current,
        iconImageSize,
      })
    ) {
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
}
