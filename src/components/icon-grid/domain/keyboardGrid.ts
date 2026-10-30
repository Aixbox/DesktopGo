export interface KeyboardGridCellTarget {
  page: number
  index: number
}

export interface KeyboardGridCellCenterInput {
  id: string
  currentPage: number
  columns: number
  rows: number
  pageSize: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  gridLeft: number
  gridTop: number
  scaleX?: number
  scaleY?: number
}

export interface KeyboardGridPoint {
  x: number
  y: number
}

/** Parse the ids used by empty paged-grid droppable cells. */
export const parseKeyboardGridCellId = (id: string): KeyboardGridCellTarget | null => {
  const match = /^cell:(\d+):(\d+)$/.exec(id)
  if (!match) return null

  const page = Number(match[1])
  const index = Number(match[2])
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(index)) return null
  return { page, index }
}

/** Resolve an empty cell id to the same visual center used by the CSS grid. */
export const resolveKeyboardGridCellCenter = ({
  id,
  currentPage,
  columns,
  rows,
  pageSize,
  itemWidth,
  itemHeight,
  gridGap,
  gridLeft,
  gridTop,
  scaleX = 1,
  scaleY = 1,
}: KeyboardGridCellCenterInput): KeyboardGridPoint | null => {
  const cell = parseKeyboardGridCellId(id)
  if (!cell || cell.page !== currentPage) return null

  const safeColumns = Math.max(1, Math.floor(columns))
  const safeRows = Math.max(1, Math.floor(rows))
  const safePageSize = Math.max(1, Math.floor(pageSize))
  if (cell.index < 0 || cell.index >= safePageSize || cell.index >= safeColumns * safeRows) {
    return null
  }

  const row = Math.floor(cell.index / safeColumns)
  const col = cell.index % safeColumns
  const safeScaleX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1
  const safeScaleY = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1
  return {
    x: gridLeft + (col * (itemWidth + gridGap) + itemWidth / 2) * safeScaleX,
    y: gridTop + (row * (itemHeight + gridGap) + itemHeight / 2) * safeScaleY,
  }
}
