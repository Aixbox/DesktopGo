export const MAX_ANIMATED_SELECTION_ROWS = 4
export const SELECTION_ANIMATION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

const BASE_DURATION_MS = 90
const PER_EXTRA_ROW_DURATION_MS = 18
const MAX_DURATION_MS = 150
const CATCH_UP_DURATION_MS = 70

export const isSelectionRowFullyVisible = ({
  index,
  rowHeight,
  scrollTop,
  viewportHeight,
}: {
  index: number
  rowHeight: number
  scrollTop: number
  viewportHeight: number
}) => {
  if (index < 0 || rowHeight <= 0 || viewportHeight <= 0) return false

  return index * rowHeight >= scrollTop && (index + 1) * rowHeight <= scrollTop + viewportHeight
}

/**
 * The highlight only glides when the list frame is standing still: any move that
 * accompanies a scroll would race the rows underneath it and read as drifting.
 */
export const shouldAnimateSelectionMove = ({
  previousIndex,
  index,
  viewportScrolled,
  rowFullyVisible,
  reducedMotion,
}: {
  previousIndex: number
  index: number
  viewportScrolled: boolean
  rowFullyVisible: boolean
  reducedMotion: boolean
}) => {
  if (reducedMotion || viewportScrolled || !rowFullyVisible) return false
  if (previousIndex < 0 || index < 0 || previousIndex === index) return false

  return Math.abs(index - previousIndex) <= MAX_ANIMATED_SELECTION_ROWS
}

/** Interrupted moves catch up faster so held arrow keys cannot build up a trailing lag. */
export const resolveSelectionAnimationDuration = ({
  distance,
  interrupted,
}: {
  distance: number
  interrupted: boolean
}) => {
  if (interrupted) return CATCH_UP_DURATION_MS

  const extraRows = Math.max(0, distance - 1)
  return Math.min(BASE_DURATION_MS + extraRows * PER_EXTRA_ROW_DURATION_MS, MAX_DURATION_MS)
}
