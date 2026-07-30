export type SearchScrollDirection = -1 | 0 | 1

export const getSearchScrollAnchorIndex = ({
  direction,
  scrollTop,
  viewportHeight,
  rowHeight,
  resultCount,
}: {
  direction: SearchScrollDirection
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  resultCount: number
}) => {
  if (direction === 0 || resultCount <= 0 || rowHeight <= 0) return -1

  const rawIndex =
    direction > 0
      ? Math.floor(Math.max(0, scrollTop) / rowHeight)
      : Math.floor(Math.max(0, scrollTop + Math.max(0, viewportHeight)) / rowHeight) - 1

  return Math.min(Math.max(rawIndex, 0), resultCount - 1)
}
