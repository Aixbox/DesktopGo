export interface PendingDragActivation {
  activateOnMove?: boolean
}

export const resolvePendingDragMoveAction = (
  pending: PendingDragActivation,
  distance: number,
  tolerance: number
): 'wait' | 'begin' | 'abort' => {
  if (distance <= tolerance) return 'wait'
  return pending.activateOnMove ? 'begin' : 'abort'
}
