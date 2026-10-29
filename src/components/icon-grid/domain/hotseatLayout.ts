/**
 * Hotseat/Dock cell mapping shared by persistence, drag hit-testing and
 * vertical/RTL renderers. The current Dock view is horizontal, but keeping
 * the mapping independent makes a vertical or RTL profile a data change.
 */
export type HotseatOrientation = 'horizontal' | 'vertical'

export type HotseatPlaceholderKind = 'docker' | 'subscribe' | 'divider'

export interface HotseatProfile {
  count: number
  orientation: HotseatOrientation
  rtl: boolean
}

export interface HotseatItemEntry {
  kind: 'item'
  id: string
}

export interface HotseatPlaceholderEntry {
  kind: 'placeholder'
  placeholder: HotseatPlaceholderKind
}

export type HotseatEntry = HotseatItemEntry | HotseatPlaceholderEntry | null

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
): HotseatPlaceholderEntry => ({
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
