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

interface NormalizeOuterSlotsOptions {
  preferredAnchorById?: Map<string, number>
}

interface ResizeAnchorCandidate {
  anchorIndex: number
  blockerCount: number
  distance: number
  rowShift: number
  colShift: number
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

const getAnchorDistanceScore = (
  originIndex: number,
  candidateIndex: number,
  columns: number,
  pageSize: number
): [number, number, number] => {
  const safeColumns = Math.max(1, columns)
  const safePageSize = Math.max(1, pageSize)
  const originPage = Math.floor(Math.max(0, originIndex) / safePageSize)
  const candidatePage = Math.floor(Math.max(0, candidateIndex) / safePageSize)
  const originLocalIndex = Math.max(0, originIndex) % safePageSize
  const candidateLocalIndex = Math.max(0, candidateIndex) % safePageSize
  const originRow = Math.floor(originLocalIndex / safeColumns)
  const originCol = originLocalIndex % safeColumns
  const candidateRow = Math.floor(candidateLocalIndex / safeColumns)
  const candidateCol = candidateLocalIndex % safeColumns

  return [
    Math.abs(candidatePage - originPage),
    Math.abs(candidateRow - originRow) + Math.abs(candidateCol - originCol),
    Math.abs(candidateIndex - originIndex),
  ]
}

const compareAnchorDistanceScore = (
  left: [number, number, number],
  right: [number, number, number]
): number => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue
    return left[index] - right[index]
  }
  return 0
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
  columns: number,
  options?: NormalizeOuterSlotsOptions
): Array<string | null> => {
  const safePageSize = Math.max(1, pageSize)
  const safeColumns = Math.max(1, columns)
  const itemById = buildItemMap(items)
  const itemIds = items.map(getId)
  const validIdSet = new Set(itemIds)
  const consumed = new Set<string>()
  const anchors: Array<string | null> = []
  const occupied: Array<string | null> = []
  const sourceAnchorIndexById = new Map<string, number>()

  const ensureAnchorCapacity = (anchorIndex: number) => {
    ensurePageCapacity(anchors, safePageSize, anchorIndex)
    ensurePageCapacity(occupied, safePageSize, anchorIndex)
  }

  const tryPlaceAtAnchor = (id: string, anchorIndex: number): boolean => {
    if (!validIdSet.has(id) || consumed.has(id) || anchorIndex < 0) return false
    ensureAnchorCapacity(anchorIndex)
    if (anchors[anchorIndex]) return false

    const item = itemById.get(id)
    if (!item) return false
    const span = getGridItemSpan(item)
    if (!canPlaceAtIndex(occupied, anchorIndex, span, safeColumns, safePageSize)) return false

    anchors[anchorIndex] = id
    paintFootprint(occupied, anchorIndex, id, span, safeColumns, safePageSize)
    consumed.add(id)
    return true
  }

  const findNearestAvailableAnchorIndex = (span: GridSpan, originIndex: number): number | null => {
    if (originIndex < 0) return null

    let searchLimit = Math.max(anchors.length, safePageSize)
    const minimumLimit = getPageStartBySlotIndex(originIndex, safePageSize) + safePageSize
    if (searchLimit < minimumLimit) {
      searchLimit = minimumLimit
    }

    for (let pageExpansion = 0; pageExpansion < 64; pageExpansion += 1) {
      let bestAnchorIndex: number | null = null
      let bestScore: [number, number, number] | null = null

      for (let index = 0; index < searchLimit; index += 1) {
        ensureAnchorCapacity(index)
        if (anchors[index]) continue
        if (!canPlaceAtIndex(occupied, index, span, safeColumns, safePageSize)) continue

        const score = getAnchorDistanceScore(originIndex, index, safeColumns, safePageSize)
        if (!bestScore || compareAnchorDistanceScore(score, bestScore) < 0) {
          bestAnchorIndex = index
          bestScore = score
        }
      }

      if (bestAnchorIndex !== null) {
        return bestAnchorIndex
      }

      searchLimit += safePageSize
    }

    for (let index = 0; ; index += 1) {
      ensureAnchorCapacity(index)
      if (anchors[index]) continue
      if (!canPlaceAtIndex(occupied, index, span, safeColumns, safePageSize)) continue
      return index
    }
  }

  const findAppendAnchorIndex = (span: GridSpan): number => {
    let searchIndex = anchors.reduce((lastAnchorIndex, slot, index) => {
      if (typeof slot === 'string') {
        return index + 1
      }
      return lastAnchorIndex
    }, 0)

    for (;;) {
      ensureAnchorCapacity(searchIndex)
      if (!anchors[searchIndex] && canPlaceAtIndex(occupied, searchIndex, span, safeColumns, safePageSize)) {
        return searchIndex
      }
      searchIndex += 1
    }
  }

  options?.preferredAnchorById?.forEach((anchorIndex, id) => {
    tryPlaceAtAnchor(id, anchorIndex)
  })
  ;(source ?? []).forEach((slot, index) => {
    ensureAnchorCapacity(index)
    if (!slot || slot === DRAG_HOLE_ID) return
    if (!validIdSet.has(slot) || consumed.has(slot)) return
    if (!sourceAnchorIndexById.has(slot)) {
      sourceAnchorIndexById.set(slot, index)
    }

    tryPlaceAtAnchor(slot, index)
  })

  itemIds.forEach(id => {
    if (consumed.has(id)) return
    const item = itemById.get(id)
    if (!item) return
    const span = getGridItemSpan(item)
    const originIndex = sourceAnchorIndexById.get(id) ?? -1
    let anchorIndex =
      originIndex >= 0 ? findNearestAvailableAnchorIndex(span, originIndex) : findAppendAnchorIndex(span)
    if (anchorIndex === null) {
      for (let index = 0; anchorIndex === null; index += 1) {
        ensureAnchorCapacity(index)
        if (anchors[index]) continue
        if (!canPlaceAtIndex(occupied, index, span, safeColumns, safePageSize)) continue
        anchorIndex = index
      }
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

export const findBestResizeAnchorIndex = ({
  slots,
  items,
  itemId,
  currentAnchorIndex,
  currentSpan,
  nextSpan,
  columns,
  pageSize,
}: {
  slots: Array<string | null>
  items: GridItem[]
  itemId: string
  currentAnchorIndex: number
  currentSpan: GridSpan
  nextSpan: GridSpan
  columns: number
  pageSize: number
}): number | null => {
  if (currentAnchorIndex < 0) return null

  const safeColumns = Math.max(1, columns)
  const safePageSize = Math.max(1, pageSize)
  const occupancy = buildTopLevelOccupancy(slots, items, safeColumns, safePageSize).cells
  const currentFootprint = getFootprintIndices(
    currentAnchorIndex,
    currentSpan,
    safeColumns,
    safePageSize
  ) ?? [currentAnchorIndex]
  const currentFootprintSet = new Set(currentFootprint)
  const maxRowShift = Math.max(0, nextSpan.rows - currentSpan.rows)
  const maxColShift = Math.max(0, nextSpan.cols - currentSpan.cols)

  let bestCandidate: ResizeAnchorCandidate | null = null

  for (let rowShift = 0; rowShift <= maxRowShift; rowShift += 1) {
    for (let colShift = 0; colShift <= maxColShift; colShift += 1) {
      const anchorIndex = currentAnchorIndex - rowShift * safeColumns - colShift
      const footprint = getFootprintIndices(anchorIndex, nextSpan, safeColumns, safePageSize)
      if (!footprint) continue

      let blockerCount = 0
      for (const index of footprint) {
        if (currentFootprintSet.has(index)) continue
        const occupant = occupancy[index]
        if (occupant && occupant !== itemId) {
          blockerCount += 1
        }
      }

      const candidate: ResizeAnchorCandidate = {
        anchorIndex,
        blockerCount,
        distance: rowShift + colShift,
        rowShift,
        colShift,
      }

      if (
        !bestCandidate ||
        candidate.blockerCount < bestCandidate.blockerCount ||
        (candidate.blockerCount === bestCandidate.blockerCount &&
          (candidate.distance < bestCandidate.distance ||
            (candidate.distance === bestCandidate.distance &&
              (candidate.rowShift < bestCandidate.rowShift ||
                (candidate.rowShift === bestCandidate.rowShift &&
                  candidate.colShift < bestCandidate.colShift)))))
      ) {
        bestCandidate = candidate
      }
    }
  }

  return bestCandidate?.anchorIndex ?? null
}

export const resizeSlotPages = (
  slots: Array<string | null>,
  items: GridItem[],
  prevPageSize: number,
  nextPageSize: number,
  prevColumns: number,
  nextColumns: number
): Array<string | null> => {
  const safePrevPS = Math.max(1, prevPageSize)
  const safeNextPS = Math.max(1, nextPageSize)
  const safePrevCols = Math.max(1, prevColumns)
  const safeNextCols = Math.max(1, nextColumns)

  if (safePrevPS === safeNextPS && safePrevCols === safeNextCols) {
    // Folder span changes can invalidate anchors without changing page geometry.
    // Re-normalize so stale placements are repaired instead of preserved.
    return normalizeOuterSlots(slots, items, safeNextPS, safeNextCols)
  }

  if (safePrevPS === 1 && safeNextPS > 1) {
    // Recover from an abnormal one-slot page layout by rebuilding the layout
    // against the current page geometry instead of preserving stale page boundaries.
    return normalizeOuterSlots(slots, items, safeNextPS, safeNextCols)
  }

  const itemById = buildItemMap(items)
  const oldPageCount = Math.max(1, Math.ceil(Math.max(slots.length, safePrevPS) / safePrevPS))
  const result: Array<string | null> = []

  const appendOverflowPages = (overflowIds: string[]) => {
    if (overflowIds.length === 0) return

    let overflowAnchors: Array<string | null> = Array.from({ length: safeNextPS }, () => null)
    let overflowOccupied: Array<string | null> = Array.from({ length: safeNextPS }, () => null)

    const flushOverflowPage = () => {
      result.push(...overflowAnchors)
      overflowAnchors = Array.from({ length: safeNextPS }, () => null)
      overflowOccupied = Array.from({ length: safeNextPS }, () => null)
    }

    for (const id of overflowIds) {
      const item = itemById.get(id)
      if (!item) continue
      const span = getGridItemSpan(item)
      let placed = false

      for (let index = 0; index < safeNextPS; index += 1) {
        if (!canPlaceAtIndex(overflowOccupied, index, span, safeNextCols, safeNextPS)) continue
        overflowAnchors[index] = id
        paintFootprint(overflowOccupied, index, id, span, safeNextCols, safeNextPS)
        placed = true
        break
      }

      if (placed) continue

      if (overflowAnchors.some(slot => slot !== null)) {
        flushOverflowPage()
      }

      for (let index = 0; index < safeNextPS; index += 1) {
        if (!canPlaceAtIndex(overflowOccupied, index, span, safeNextCols, safeNextPS)) continue
        overflowAnchors[index] = id
        paintFootprint(overflowOccupied, index, id, span, safeNextCols, safeNextPS)
        placed = true
        break
      }

      if (!placed) {
        continue
      }
    }

    if (overflowAnchors.some(slot => slot !== null)) {
      result.push(...overflowAnchors)
    }
  }

  for (let page = 0; page < oldPageCount; page += 1) {
    const pageStart = page * safePrevPS
    const pageSlots = slots.slice(pageStart, pageStart + safePrevPS)
    const nextPageAnchors: Array<string | null> = Array.from({ length: safeNextPS }, () => null)
    const nextPageOccupied: Array<string | null> = Array.from({ length: safeNextPS }, () => null)

    const overflowIds: string[] = []
    for (let index = 0; index < pageSlots.length; index += 1) {
      const slot = pageSlots[index]
      if (!slot || slot === DRAG_HOLE_ID) continue

      const item = itemById.get(slot)
      if (!item) continue

      const span = getGridItemSpan(item)
      const canKeepAtIndex =
        index < safeNextPS &&
        canPlaceAtIndex(nextPageOccupied, index, span, safeNextCols, safeNextPS)

      if (canKeepAtIndex) {
        nextPageAnchors[index] = slot
        paintFootprint(nextPageOccupied, index, slot, span, safeNextCols, safeNextPS)
        continue
      }

      overflowIds.push(slot)
    }

    result.push(...nextPageAnchors)
    appendOverflowPages(overflowIds)
  }

  if (result.length === 0) {
    result.push(...Array.from({ length: safeNextPS }, () => null))
  }

  return result
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
