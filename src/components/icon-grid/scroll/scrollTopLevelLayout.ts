import type { GridItem } from '../model'
import { getId } from '../model'
import { DRAG_HOLE_ID } from '../domain/slots'
import { normalizeOuterSlots } from '../domain/topLevelLayout'

const buildItemMap = (items: GridItem[]) => new Map(items.map(item => [getId(item), item]))

export const compactOuterSlotsWithinPages = (
  slots: Array<string | null>,
  items: GridItem[],
  pageSize: number,
  columns: number,
  minPageCount = 1
): Array<string | null> => {
  const safePageSize = Math.max(1, pageSize)
  const safeColumns = Math.max(1, columns)
  const itemById = buildItemMap(items)
  const sourcePageCount = Math.max(
    1,
    minPageCount,
    Math.ceil(Math.max(slots.length, safePageSize) / safePageSize)
  )
  const result: Array<string | null> = []
  const placedIds = new Set<string>()
  let carryIds: string[] = []

  const placePage = (ids: string[]) => {
    const pageItems = ids
      .map(id => itemById.get(id))
      .filter((item): item is GridItem => Boolean(item))
    const compacted = normalizeOuterSlots(ids, pageItems, safePageSize, safeColumns, {
      preserveSourceAnchors: false,
      spillStrategy: 'row-major-forward',
    })
    const pageSlots = compacted.slice(0, safePageSize)
    pageSlots.forEach(slot => {
      if (slot) placedIds.add(slot)
    })
    result.push(...pageSlots)
    carryIds = compacted
      .slice(safePageSize)
      .filter((slot): slot is string => typeof slot === 'string' && !placedIds.has(slot))
  }

  for (let page = 0; page < sourcePageCount; page += 1) {
    const pageStart = page * safePageSize
    const pageEnd = pageStart + safePageSize
    const queuedIds = new Set(carryIds)
    const pageIds = slots
      .slice(pageStart, pageEnd)
      .filter(
        (slot): slot is string =>
          typeof slot === 'string' &&
          slot !== DRAG_HOLE_ID &&
          itemById.has(slot) &&
          !placedIds.has(slot) &&
          !queuedIds.has(slot)
      )
    placePage([...carryIds, ...pageIds])
  }

  while (carryIds.length > 0) {
    placePage(carryIds)
  }

  const minimumLength = Math.max(1, minPageCount) * safePageSize
  while (result.length < minimumLength) {
    result.push(null)
  }

  while (result.length > minimumLength) {
    const lastPageStart = result.length - safePageSize
    const lastPageHasAnchor = result
      .slice(lastPageStart)
      .some(slot => typeof slot === 'string' && slot !== DRAG_HOLE_ID)
    if (lastPageHasAnchor) break
    result.splice(lastPageStart, safePageSize)
  }

  return result
}
