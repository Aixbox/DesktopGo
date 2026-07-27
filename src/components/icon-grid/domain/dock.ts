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

const normalizeDraggingKeySet = (
  draggingKeys: string | string[] | null | undefined
): Set<string> => {
  if (Array.isArray(draggingKeys)) {
    return new Set(draggingKeys.filter((key): key is string => typeof key === 'string'))
  }
  return typeof draggingKeys === 'string' ? new Set([draggingKeys]) : new Set()
}

const compactDockKeys = (
  dockKeys: Array<string | null>,
  draggingKeys: string | string[] | null
): string[] => {
  const draggingKeySet = normalizeDraggingKeySet(draggingKeys)
  return dockKeys.filter(
    (key): key is string => typeof key === 'string' && !draggingKeySet.has(key)
  )
}

export const getDockItemKeys = (
  dockKeys: Array<string | null>,
  draggingKeys: string | string[] | null = null
): string[] => compactDockKeys(dockKeys, draggingKeys)

export const getDockRenderSlots = (
  dockKeys: Array<string | null>,
  draggingKeys: string | string[] | null,
  previewIndex: number | null,
  options?: { showPlaceholderWhenEmpty?: boolean }
): Array<string | null> => {
  const compact = compactDockKeys(dockKeys, draggingKeys)
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

interface ResolveDockDisplaySlotsParams {
  dockKeys: Array<string | null>
  draggingKeys: string[]
  previewIndex: number | null
  workingOrder?: Array<string | null> | null
  showPlaceholderWhenEmpty?: boolean
}

export const resolveDockDisplaySlots = ({
  dockKeys,
  draggingKeys,
  previewIndex,
  workingOrder,
  showPlaceholderWhenEmpty = true,
}: ResolveDockDisplaySlotsParams): Array<string | null> => {
  const draggingKeySet = normalizeDraggingKeySet(draggingKeys)
  if (workingOrder && workingOrder.length > 0) {
    const consumed = new Set<string>()
    const next: Array<string | null> = []

    workingOrder.forEach(slot => {
      if (slot === null) {
        next.push(null)
        return
      }
      if (draggingKeySet.has(slot) || consumed.has(slot)) return
      next.push(slot)
      consumed.add(slot)
    })

    if (previewIndex !== null && !next.includes(null)) {
      const insertIndex = Math.max(0, Math.min(previewIndex, next.length))
      next.splice(insertIndex, 0, null)
    }

    if (next.length > 0) {
      return next
    }
  }

  return getDockRenderSlots(dockKeys, draggingKeys, previewIndex, {
    showPlaceholderWhenEmpty,
  })
}
