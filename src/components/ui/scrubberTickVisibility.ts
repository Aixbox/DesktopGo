export const SCRUBBER_TICK_PERCENTAGES = [10, 20, 30, 40, 50, 60, 70, 80, 90]

const TEXT_CLEARANCE = 8

interface ScrubberTickVisibilityInput {
  trackWidth: number
  labelLeft: number
  labelRight: number
  valueLeft: number
  valueRight: number
}

export function getVisibleScrubberTickPercentages({
  trackWidth,
  labelLeft,
  labelRight,
  valueLeft,
  valueRight,
}: ScrubberTickVisibilityInput) {
  if (!Number.isFinite(trackWidth) || trackWidth <= 0) return []

  const hiddenRanges = [
    [labelLeft - TEXT_CLEARANCE, labelRight + TEXT_CLEARANCE],
    [valueLeft - TEXT_CLEARANCE, valueRight + TEXT_CLEARANCE],
  ]

  return SCRUBBER_TICK_PERCENTAGES.filter(percentage => {
    const tickOffset = (trackWidth * percentage) / 100
    return hiddenRanges.every(([start, end]) => tickOffset < start || tickOffset > end)
  })
}

export function haveSameTickPercentages(current: number[], next: number[]) {
  return (
    current.length === next.length &&
    current.every((percentage, index) => percentage === next[index])
  )
}
