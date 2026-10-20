export const findNewlyAddedIconKeys = (
  previousKeys: ReadonlySet<string>,
  currentKeys: readonly string[]
) => {
  const seen = new Set(previousKeys)
  return currentKeys.filter(key => {
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
