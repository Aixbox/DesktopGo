export function resolveCommittedKeyword({
  keyword,
  submittedKeyword,
  liveOnType,
}: {
  keyword: string
  submittedKeyword: string
  liveOnType: boolean
}) {
  return (liveOnType ? keyword : submittedKeyword).trim()
}

export function clampSearchSelection(selectedIndex: number, totalResults: number) {
  if (totalResults <= 0) return -1
  return Math.min(Math.max(selectedIndex, -1), totalResults - 1)
}
