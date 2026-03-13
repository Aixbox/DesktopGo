export const DOCK_CAPACITY = 8
export const DOCK_SLOT_SIZE = 64
export const DOCK_GAP = 8

export const normalizeDockKeys = (
  source: Array<string | null> | null | undefined,
  validKeys: Iterable<string>,
  capacity: number = DOCK_CAPACITY
): Array<string | null> => {
  const safeCapacity = Math.max(1, capacity)
  const validKeySet = new Set(validKeys)
  const consumed = new Set<string>()
  const next = Array.from({ length: safeCapacity }, () => null as string | null)

  ;(source ?? []).slice(0, safeCapacity).forEach((slot, index) => {
    if (slot === null) return
    if (typeof slot !== 'string' || !validKeySet.has(slot) || consumed.has(slot)) return
    next[index] = slot
    consumed.add(slot)
  })

  return next
}

export const createDockSlots = (
  dockKeys: Array<string | null>,
  capacity: number = DOCK_CAPACITY
): Array<string | null> => normalizeDockKeys(dockKeys, dockKeys.filter((key): key is string => Boolean(key)), capacity)

export const getDockOccupiedCount = (dockKeys: Array<string | null>): number =>
  dockKeys.reduce((count, key) => (typeof key === 'string' ? count + 1 : count), 0)

export const resolveOuterItemIds = (
  itemIds: string[],
  dockKeys: Array<string | null>
): string[] => {
  const dockSet = new Set(dockKeys.filter((key): key is string => typeof key === 'string'))
  return itemIds.filter(id => !dockSet.has(id))
}

export const getDockPreviewSlots = (
  dockKeys: Array<string | null>,
  draggingKey: string | null
): Array<string | null> =>
  dockKeys.map(slot => (slot === draggingKey ? null : slot))
