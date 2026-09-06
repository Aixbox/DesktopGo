export const DRAG_HOLE_ID = '__desktopgo.drag-hole__'

export const isVacantSlot = (slot: string | null | undefined): boolean =>
  slot === null || slot === DRAG_HOLE_ID

export const normalizeOuterSlots = (
  source: Array<string | null> | null | undefined,
  itemIds: string[],
  pageSize: number
): Array<string | null> => {
  const safePageSize = Math.max(1, pageSize)
  const validIdSet = new Set(itemIds)
  const consumed = new Set<string>()
  const next: Array<string | null> = []

  ;(source ?? []).forEach(slot => {
    if (slot === null || slot === DRAG_HOLE_ID) {
      next.push(null)
      return
    }
    if (!validIdSet.has(slot) || consumed.has(slot)) {
      next.push(null)
      return
    }
    consumed.add(slot)
    next.push(slot)
  })

  itemIds.forEach(id => {
    if (consumed.has(id)) return
    const emptyIndex = next.indexOf(null)
    if (emptyIndex >= 0) next[emptyIndex] = id
    else next.push(id)
    consumed.add(id)
  })

  if (next.length === 0) next.push(null)
  if (next.length < safePageSize) {
    next.push(...Array.from({ length: safePageSize - next.length }, () => null))
  }

  const remainder = next.length % safePageSize
  if (remainder > 0) {
    next.push(...Array.from({ length: safePageSize - remainder }, () => null))
  }

  while (next.length > safePageSize) {
    const lastPageStart = next.length - safePageSize
    const prevPageStart = lastPageStart - safePageSize
    if (prevPageStart < 0) break
    const lastPageEmpty = next.slice(lastPageStart).every(slot => slot === null)
    const prevPageEmpty = next.slice(prevPageStart, lastPageStart).every(slot => slot === null)
    if (!lastPageEmpty || !prevPageEmpty) break
    next.splice(lastPageStart, safePageSize)
  }

  return next
}

export const areSlotsEqual = (a: Array<string | null>, b: Array<string | null>): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export const getPageCountBySlots = (slots: Array<string | null>, pageSize: number): number =>
  Math.max(1, Math.ceil(Math.max(pageSize, slots.length) / Math.max(1, pageSize)))

export const compactEmptyPages = (
  slots: Array<string | null>,
  pageSize: number
): Array<string | null> => {
  const safePageSize = Math.max(1, pageSize)
  const pageCount = getPageCountBySlots(slots, safePageSize)
  const pages: Array<Array<string | null>> = []

  for (let page = 0; page < pageCount; page += 1) {
    const start = page * safePageSize
    const pageEntries = slots.slice(start, start + safePageSize)
    if (pageEntries.length < safePageSize) {
      pageEntries.push(...Array.from({ length: safePageSize - pageEntries.length }, () => null))
    }
    pages.push(pageEntries)
  }

  const compacted = pages.filter(pageEntries =>
    pageEntries.some(slot => slot !== null && slot !== DRAG_HOLE_ID)
  )
  if (compacted.length === 0) {
    return Array.from({ length: safePageSize }, () => null)
  }

  return compacted.flat()
}

export const isPageFullyEmpty = (
  slots: Array<string | null>,
  page: number,
  pageSize: number
): boolean => {
  const safePageSize = Math.max(1, pageSize)
  const start = page * safePageSize
  for (let i = 0; i < safePageSize; i += 1) {
    const slot = slots[start + i]
    if (slot && slot !== DRAG_HOLE_ID) return false
  }
  return true
}

export const hasTrailingEmptyPage = (slots: Array<string | null>, pageSize: number): boolean => {
  const pageCount = getPageCountBySlots(slots, pageSize)
  if (pageCount <= 1) return false
  return isPageFullyEmpty(slots, pageCount - 1, pageSize)
}

export const getPageStartBySlotIndex = (slotIndex: number, pageSize: number): number => {
  const safePageSize = Math.max(1, pageSize)
  return Math.floor(Math.max(0, slotIndex) / safePageSize) * safePageSize
}

export const getSlotRowColWithinPage = (
  slotIndex: number,
  pageStart: number,
  columns: number
): { row: number; col: number } => {
  const safeColumns = Math.max(1, columns)
  const local = Math.max(0, slotIndex - pageStart)
  return {
    row: Math.floor(local / safeColumns),
    col: local % safeColumns,
  }
}

export const getManhattanDistanceBySlotIndex = (
  a: number,
  b: number,
  pageStart: number,
  columns: number
): number => {
  const aPos = getSlotRowColWithinPage(a, pageStart, columns)
  const bPos = getSlotRowColWithinPage(b, pageStart, columns)
  return Math.abs(aPos.row - bPos.row) + Math.abs(aPos.col - bPos.col)
}

export const findFirstNullInRange = (
  slots: Array<string | null>,
  start: number,
  endExclusive: number
): number | null => {
  const safeStart = Math.max(0, start)
  const safeEnd = Math.max(safeStart, endExclusive)
  for (let index = safeStart; index < safeEnd; index += 1) {
    if (slots[index] === null) return index
  }
  return null
}

export const findNearestEmptyOnPageByManhattan = (
  slots: Array<string | null>,
  pageStart: number,
  pageSize: number,
  columns: number,
  originIndex: number
): number | null => {
  const pageEnd = pageStart + Math.max(1, pageSize)
  let bestIndex: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = pageStart; index < pageEnd; index += 1) {
    if (index === originIndex || !isVacantSlot(slots[index])) continue
    const distance = getManhattanDistanceBySlotIndex(originIndex, index, pageStart, columns)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
      continue
    }
    if (distance === bestDistance && bestIndex !== null && index < bestIndex) {
      bestIndex = index
    }
  }
  return bestIndex
}

export const getOccupiedPageCountForSlots = (
  slots: Array<string | null>,
  pageSize: number
): number => {
  const safePageSize = Math.max(1, pageSize)
  let lastOccupiedIndex = -1
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const slot = slots[index]
    if (typeof slot !== 'string' || slot === DRAG_HOLE_ID) continue
    lastOccupiedIndex = index
    break
  }
  return Math.max(1, Math.ceil((lastOccupiedIndex + 1) / safePageSize))
}
