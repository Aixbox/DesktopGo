import { DRAG_HOLE_ID } from './slots'

/**
 * Reserve every selected source cell for one drag session. Keeping the holes
 * together in the source order prevents a multi-selection from leaving stale
 * occupants that can be selected again by the candidate solver.
 */
export const removeDraggingIdsFromOrder = (
  sourceOrder: Array<string | null>,
  draggingIds: readonly string[],
  context: 'outer' | 'folder' | 'dock'
): Array<string | null> => {
  const draggingIdSet = new Set(draggingIds)
  const emptyValue = context === 'folder' ? DRAG_HOLE_ID : null
  return sourceOrder.map(id => (id && draggingIdSet.has(id) ? emptyValue : id))
}
