import type { GridItem, GridSpan } from '../model'
import { getGridItemSpan, getId } from '../model'
import { clampNumber } from './geometry'
import { DRAG_HOLE_ID, getPageStartBySlotIndex } from './slots'

export interface TopLevelOccupancy {
  cells: Array<string | null>
  anchorIndexById: Map<string, number>
}

export interface PageAnchorEntry {
  id: string
  item: GridItem
  globalIndex: number
  localIndex: number
  row: number
  col: number
  span: GridSpan
}

const ensurePageCapacity = (cells: Array<string | null>, pageSize: number, anchorIndex: number) => {
  const safePageSize = Math.max(1, pageSize)
  const requiredLength = getPageStartBySlotIndex(anchorIndex, safePageSize) + safePageSize
  while (cells.length < requiredLength) {
    cells.push(...Array.from({ length: safePageSize }, () => null))
  }
}

export const getFootprintIndices = (
  anchorIndex: number,
  span: GridSpan,
  columns: number,
  pageSize: number
): number[] | null => {
  const safeColumns = Math.max(1, columns)
  const safePageSize = Math.max(1, pageSize)
  const pageStart = getPageStartBySlotIndex(anchorIndex, safePageSize)
  const localIndex = Math.max(0, anchorIndex - pageStart)
  const col = localIndex % safeColumns
  const row = Math.floor(localIndex / safeColumns)
  const maxRows = Math.ceil(safePageSize / safeColumns)

  if (col + span.cols > safeColumns) return null
  if (row + span.rows > maxRows) return null

  const indices: number[] = []
  for (let rowOffset = 0; rowOffset < span.rows; rowOffset += 1) {
    for (let colOffset = 0; colOffset < span.cols; colOffset += 1) {
      indices.push(anchorIndex + rowOffset * safeColumns + colOffset)
    }
  }

  const pageEnd = pageStart + safePageSize
  if (indices.some(index => index < pageStart || index >= pageEnd)) return null
  return indices
}

const canPlaceAtIndex = (
  occupied: Array<string | null>,
  anchorIndex: number,
  span: GridSpan,
  columns: number,
  pageSize: number
): boolean => {
  const indices = getFootprintIndices(anchorIndex, span, columns, pageSize)
  if (!indices) return false
  return indices.every(index => !occupied[index])
}

export const canPlaceItemAtAnchorIndex = (
  slots: Array<string | null>,
  items: GridItem[],
  anchorIndex: number,
  span: GridSpan,
  columns: number,
  pageSize: number
): boolean => {
  if (slots[anchorIndex]) return false
  const occupied = buildTopLevelOccupancy(slots, items, columns, pageSize).cells
  return canPlaceAtIndex(occupied, anchorIndex, span, columns, pageSize)
}

const paintFootprint = (
  occupied: Array<string | null>,
  anchorIndex: number,
  id: string,
  span: GridSpan,
  columns: number,
  pageSize: number
): boolean => {
  const indices = getFootprintIndices(anchorIndex, span, columns, pageSize)
  if (!indices) return false
  indices.forEach(index => {
    occupied[index] = id
  })
  return true
}

const buildItemMap = (items: GridItem[]): Map<string, GridItem> => {
  const map = new Map<string, GridItem>()
  items.forEach(item => {
    map.set(getId(item), item)
  })
  return map
}

export const buildTopLevelOccupancy = (
  slots: Array<string | null>,
  items: GridItem[],
  columns: number,
  pageSize: number
): TopLevelOccupancy => {
  const itemById = buildItemMap(items)
  const occupied = [...slots]
  const cells = Array.from({ length: Math.max(occupied.length, Math.max(1, pageSize)) }, () => null)
  const anchorIndexById = new Map<string, number>()

  occupied.forEach((slot, index) => {
    if (!slot || slot === DRAG_HOLE_ID) return
    const item = itemById.get(slot)
    if (!item) return
    ensurePageCapacity(cells, pageSize, index)
    if (!paintFootprint(cells, index, slot, getGridItemSpan(item), columns, pageSize)) return
    anchorIndexById.set(slot, index)
  })

  return { cells, anchorIndexById }
}

export const normalizeOuterSlots = (
  source: Array<string | null> | null | undefined,
  items: GridItem[],
  pageSize: number,
  columns: number
): Array<string | null> => {
  const safePageSize = Math.max(1, pageSize)
  const safeColumns = Math.max(1, columns)
  const itemById = buildItemMap(items)
  const itemIds = items.map(getId)
  const validIdSet = new Set(itemIds)
  const consumed = new Set<string>()
  const anchors: Array<string | null> = []
  const occupied: Array<string | null> = []

  const ensureAnchorCapacity = (anchorIndex: number) => {
    ensurePageCapacity(anchors, safePageSize, anchorIndex)
    ensurePageCapacity(occupied, safePageSize, anchorIndex)
  }

  ;(source ?? []).forEach((slot, index) => {
    ensureAnchorCapacity(index)
    if (!slot || slot === DRAG_HOLE_ID) return
    if (!validIdSet.has(slot) || consumed.has(slot)) return

    const item = itemById.get(slot)
    if (!item) return
    const span = getGridItemSpan(item)
    if (!canPlaceAtIndex(occupied, index, span, safeColumns, safePageSize)) return

    anchors[index] = slot
    paintFootprint(occupied, index, slot, span, safeColumns, safePageSize)
    consumed.add(slot)
  })

  itemIds.forEach(id => {
    if (consumed.has(id)) return
    const item = itemById.get(id)
    if (!item) return
    const span = getGridItemSpan(item)

    let anchorIndex: number | null = null
    for (let index = 0; anchorIndex === null; index += 1) {
      ensureAnchorCapacity(index)
      if (anchors[index]) continue
      if (!canPlaceAtIndex(occupied, index, span, safeColumns, safePageSize)) continue
      anchorIndex = index
    }

    anchors[anchorIndex] = id
    paintFootprint(occupied, anchorIndex, id, span, safeColumns, safePageSize)
    consumed.add(id)
  })

  if (anchors.length === 0) {
    anchors.push(...Array.from({ length: safePageSize }, () => null))
  }

  while (anchors.length > safePageSize) {
    const lastPageStart = anchors.length - safePageSize
    const lastPageHasAnchor = anchors.slice(lastPageStart).some(slot => typeof slot === 'string')
    if (lastPageHasAnchor) break
    anchors.splice(lastPageStart, safePageSize)
  }

  return anchors
}

export const getPageAnchorEntries = (
  slots: Array<string | null>,
  items: GridItem[],
  currentPage: number,
  pageSize: number,
  columns: number
): PageAnchorEntry[] => {
  const safeColumns = Math.max(1, columns)
  const safePageSize = Math.max(1, pageSize)
  const itemById = buildItemMap(items)
  const pageStart = clampNumber(currentPage, 0, Number.MAX_SAFE_INTEGER) * safePageSize
  const pageEnd = pageStart + safePageSize
  const entries: PageAnchorEntry[] = []

  for (let index = pageStart; index < pageEnd && index < slots.length; index += 1) {
    const id = slots[index]
    if (!id || id === DRAG_HOLE_ID) continue
    const item = itemById.get(id)
    if (!item) continue

    const localIndex = index - pageStart
    entries.push({
      id,
      item,
      globalIndex: index,
      localIndex,
      row: Math.floor(localIndex / safeColumns),
      col: localIndex % safeColumns,
      span: getGridItemSpan(item),
    })
  }

  return entries
}

export const findNearestValidAnchorIndex = ({
  pointerX,
  pointerY,
  gridRect,
  slots,
  items,
  draggingItem,
  columns,
  rows,
  itemWidth,
  itemHeight,
  pageOffset,
  pageSize,
  gridGap,
  allowOutside = false,
}: {
  pointerX: number
  pointerY: number
  gridRect: DOMRect
  slots: Array<string | null>
  items: GridItem[]
  draggingItem: GridItem
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  pageOffset: number
  pageSize: number
  gridGap: number
  allowOutside?: boolean
}): number | null => {
  if (!allowOutside) {
    const outside =
      pointerX < gridRect.left ||
      pointerX > gridRect.right ||
      pointerY < gridRect.top ||
      pointerY > gridRect.bottom
    if (outside) return null
  }

  const safeColumns = Math.max(1, columns)
  const safeRows = Math.max(1, rows)
  const safePageSize = Math.max(1, pageSize)
  const occupied = buildTopLevelOccupancy(slots, items, safeColumns, safePageSize).cells
  const span = getGridItemSpan(draggingItem)
  const pageStart = pageOffset
  const pageEnd = pageStart + safePageSize

  let bestIndex: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col < safeColumns; col += 1) {
      const localIndex = row * safeColumns + col
      const globalIndex = pageStart + localIndex
      if (globalIndex >= pageEnd) continue
      if (slots[globalIndex]) continue
      if (!canPlaceAtIndex(occupied, globalIndex, span, safeColumns, safePageSize)) continue

      const width = span.cols * itemWidth + Math.max(0, span.cols - 1) * gridGap
      const height = span.rows * itemHeight + Math.max(0, span.rows - 1) * gridGap
      const centerX = gridRect.left + col * (itemWidth + gridGap) + width / 2
      const centerY = gridRect.top + row * (itemHeight + gridGap) + height / 2
      const distance = Math.abs(pointerX - centerX) + Math.abs(pointerY - centerY)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = globalIndex
      }
    }
  }

  return bestIndex
}
