interface SearchOffsetPriorityInput {
  visibleCandidates: number[]
  requestedOffsets: number[]
  visibleStartPage: number
}

export const selectNextSearchOffset = ({
  visibleCandidates,
  requestedOffsets,
  visibleStartPage,
}: SearchOffsetPriorityInput): number | null => {
  let closestVisibleOffset: number | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const offset of visibleCandidates) {
    const distance = Math.abs(offset - visibleStartPage)
    if (
      distance < closestDistance ||
      (distance === closestDistance &&
        (closestVisibleOffset === null || offset < closestVisibleOffset))
    ) {
      closestVisibleOffset = offset
      closestDistance = distance
    }
  }

  return closestVisibleOffset ?? requestedOffsets[0] ?? null
}
