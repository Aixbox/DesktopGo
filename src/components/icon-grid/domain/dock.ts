export const DOCK_GAP = 14

export const normalizeDockKeys = (
  source: Array<string | null> | null | undefined,
  validKeys: Iterable<string>
): string[] => {
  const validKeySet = new Set(validKeys)
  const consumed = new Set<string>()
  const next: string[] = []

  ;(source ?? []).forEach(key => {
    if (typeof key !== 'string' || !validKeySet.has(key) || consumed.has(key)) return
    next.push(key)
    consumed.add(key)
  })

  return next
}

export const getDockOccupiedCount = (dockKeys: Array<string | null>): number =>
  dockKeys.reduce((count, key) => (typeof key === 'string' ? count + 1 : count), 0)

export const resolveOuterItemIds = (
  itemIds: string[],
  dockKeys: Array<string | null>
): string[] => {
  const dockSet = new Set(dockKeys.filter((key): key is string => typeof key === 'string'))
  return itemIds.filter(id => !dockSet.has(id))
}

const compactDockKeys = (dockKeys: Array<string | null>, draggingKey: string | null): string[] =>
  dockKeys.filter((key): key is string => typeof key === 'string' && key !== draggingKey)

export const getDockItemKeys = (
  dockKeys: Array<string | null>,
  draggingKey: string | null = null
): string[] => compactDockKeys(dockKeys, draggingKey)

export const getDockRenderSlots = (
  dockKeys: Array<string | null>,
  draggingKey: string | null,
  previewIndex: number | null,
  options?: { showPlaceholderWhenEmpty?: boolean }
): Array<string | null> => {
  const compact = compactDockKeys(dockKeys, draggingKey)
  const showPlaceholderWhenEmpty = options?.showPlaceholderWhenEmpty ?? true

  if (previewIndex !== null) {
    const next: Array<string | null> = [...compact]
    const insertIndex = Math.max(0, Math.min(previewIndex, next.length))
    next.splice(insertIndex, 0, null)
    return next
  }

  if (compact.length > 0) {
    return compact
  }

  return showPlaceholderWhenEmpty ? [null] : []
}
