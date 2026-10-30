import type { HotseatEntry, HotseatPlaceholderKind } from '../model'

export type { HotseatEntry, HotseatPlaceholderKind } from '../model'

/**
 * Hotseat/Dock cell mapping shared by persistence, drag hit-testing and
 * vertical/RTL renderers. The current Dock view is horizontal, but keeping
 * the mapping independent makes a vertical or RTL profile a data change.
 */
export type HotseatOrientation = 'horizontal' | 'vertical'

export interface HotseatProfile {
  count: number
  orientation: HotseatOrientation
  rtl: boolean
}

export interface HotseatCell {
  order: number
  cellX: number
  cellY: number
  entry: HotseatEntry
}

const normalizeProfile = (profile: HotseatProfile): HotseatProfile => ({
  count: Number.isFinite(profile.count) ? Math.max(0, Math.floor(profile.count)) : 0,
  orientation: profile.orientation,
  rtl: profile.rtl,
})

export const getHotseatCell = (
  order: number,
  profile: HotseatProfile
): Pick<HotseatCell, 'cellX' | 'cellY'> => {
  const normalized = normalizeProfile(profile)
  const safeOrder = Math.max(0, Math.floor(order))
  const localOrder = normalized.count > 0 ? safeOrder % normalized.count : 0

  if (normalized.orientation === 'vertical') {
    return {
      cellX: 0,
      cellY: normalized.rtl ? normalized.count - 1 - localOrder : localOrder,
    }
  }

  return {
    cellX: normalized.rtl ? normalized.count - 1 - localOrder : localOrder,
    cellY: 0,
  }
}

export const getHotseatOrderFromCell = (
  cellX: number,
  cellY: number,
  profile: HotseatProfile
): number | null => {
  const normalized = normalizeProfile(profile)
  if (!Number.isInteger(cellX) || !Number.isInteger(cellY) || normalized.count <= 0) return null

  if (normalized.orientation === 'vertical') {
    if (cellX !== 0 || cellY < 0 || cellY >= normalized.count) return null
    return normalized.rtl ? normalized.count - 1 - cellY : cellY
  }

  if (cellY !== 0 || cellX < 0 || cellX >= normalized.count) return null
  return normalized.rtl ? normalized.count - 1 - cellX : cellX
}

export const mapHotseatOrderToCells = (
  entries: readonly HotseatEntry[],
  profile: HotseatProfile
): HotseatCell[] => {
  const normalized = normalizeProfile(profile)
  const maxEntries = Math.min(entries.length, normalized.count)
  return Array.from({ length: maxEntries }, (_, order) => ({
    order,
    ...getHotseatCell(order, normalized),
    entry: entries[order] ?? null,
  }))
}

export const mapHotseatCellsToOrder = (
  cells: readonly HotseatCell[],
  profile: HotseatProfile
): HotseatEntry[] => {
  const normalized = normalizeProfile(profile)
  const result: HotseatEntry[] = Array.from({ length: normalized.count }, () => null)
  cells.forEach(cell => {
    const order = getHotseatOrderFromCell(cell.cellX, cell.cellY, normalized)
    if (order === null) return
    result[order] = cell.entry
  })
  return result
}

export const createHotseatPlaceholder = (
  placeholder: HotseatPlaceholderKind
): Exclude<HotseatEntry, null | { kind: 'item'; id: string }> => ({
  kind: 'placeholder',
  placeholder,
})

export const normalizeHotseatEntries = (
  entries: readonly HotseatEntry[],
  profile: HotseatProfile
): HotseatEntry[] => {
  const normalized = normalizeProfile(profile)
  const result: HotseatEntry[] = []
  const seenIds = new Set<string>()
  entries.forEach(entry => {
    if (result.length >= normalized.count) return
    if (entry === null) {
      result.push(null)
      return
    }
    if (entry.kind === 'item') {
      if (!entry.id || seenIds.has(entry.id)) return
      seenIds.add(entry.id)
    }
    result.push(entry)
  })
  while (result.length < normalized.count) result.push(null)
  return result
}

/**
 * Hydrate runtime entries without allowing placeholders or stale item ids to
 * leak into the canonical Dock item order. Missing persisted item entries are
 * appended from dockKeys, so older layouts keep their exact Dock content.
 */
export const hydrateHotseatEntries = (
  source: readonly HotseatEntry[] | undefined,
  dockKeys: readonly (string | null)[],
  validItemIds: Iterable<string>
): HotseatEntry[] | undefined => {
  if (!source && dockKeys.length === 0) return undefined
  const validIds = new Set(validItemIds)
  const seenIds = new Set<string>()
  const result: HotseatEntry[] = []
  ;(source ?? []).forEach(entry => {
    if (entry === null) {
      result.push(null)
      return
    }
    if (entry.kind === 'placeholder') {
      result.push(entry)
      return
    }
    if (!validIds.has(entry.id) || seenIds.has(entry.id)) return
    seenIds.add(entry.id)
    result.push({ kind: 'item', id: entry.id })
  })
  dockKeys.forEach(id => {
    if (typeof id !== 'string' || !validIds.has(id) || seenIds.has(id)) return
    seenIds.add(id)
    result.push({ kind: 'item', id })
  })
  return result
}

/** Insert a temporary item drop slot while keeping runtime placeholders fixed. */
export const insertHotseatItemPreview = (
  entries: readonly HotseatEntry[],
  itemIndex: number
): HotseatEntry[] => {
  const next = [...entries]
  const safeIndex = Math.max(0, Math.floor(itemIndex))
  let seenItems = 0
  for (let index = 0; index < next.length; index += 1) {
    const entry = next[index]
    if (entry?.kind !== 'item') continue
    if (seenItems === safeIndex) {
      next.splice(index, 0, null)
      return next
    }
    seenItems += 1
  }
  next.push(null)
  return next
}

/**
 * Apply a canonical item order to a persisted runtime Hotseat sequence.
 * ColorOS runtime entries can contain non-item slots (Docker/subscribe/divider)
 * that must keep their relative positions while item moves are committed.
 */
export const reconcileHotseatEntries = (
  source: readonly HotseatEntry[] | undefined,
  dockKeys: readonly (string | null)[]
): HotseatEntry[] | undefined => {
  if (!source) return undefined

  const itemIds = dockKeys.filter((id): id is string => typeof id === 'string' && id.length > 0)
  const result: HotseatEntry[] = []
  let itemCursor = 0

  source.forEach(entry => {
    if (entry?.kind === 'placeholder') {
      result.push(entry)
      return
    }
    if (itemCursor < itemIds.length) {
      result.push({ kind: 'item', id: itemIds[itemCursor] })
      itemCursor += 1
      return
    }
    // Keep an explicit empty slot when the runtime sequence had one. This is
    // useful for fixed-width profiles and is removed only by normalization.
    if (entry === null) result.push(null)
  })

  while (itemCursor < itemIds.length) {
    result.push({ kind: 'item', id: itemIds[itemCursor] })
    itemCursor += 1
  }
  return result
}

export const reorderHotseatItemIds = (
  source: readonly string[],
  itemId: string,
  targetIndex: number
): string[] => {
  const currentIndex = source.indexOf(itemId)
  if (currentIndex < 0 || source.length === 0) return [...source]
  const nextIndex = Math.max(0, Math.min(source.length - 1, Math.floor(targetIndex)))
  if (currentIndex === nextIndex) return [...source]
  const next = [...source]
  next.splice(currentIndex, 1)
  next.splice(nextIndex, 0, itemId)
  return next
}

/** Reconcile transient drag slots with persisted runtime placeholders. */
export const resolveHotseatDisplayEntries = (
  runtimeEntries: readonly HotseatEntry[] | undefined,
  displaySlots: readonly (string | null)[],
  previewIndex: number | null
): HotseatEntry[] => {
  const itemIds = displaySlots.filter((entry): entry is string => typeof entry === 'string')
  const result: HotseatEntry[] = []
  let itemCursor = 0
  ;(runtimeEntries ?? []).forEach(entry => {
    if (entry?.kind === 'item') {
      const id = itemIds[itemCursor]
      if (id) {
        result.push({ kind: 'item', id })
        itemCursor += 1
      }
      return
    }
    result.push(entry)
  })
  while (itemCursor < itemIds.length) {
    result.push({ kind: 'item', id: itemIds[itemCursor] })
    itemCursor += 1
  }
  const withPreview =
    previewIndex === null ? result : insertHotseatItemPreview(result, previewIndex)
  return withPreview.length > 0 ? withPreview : [null]
}
