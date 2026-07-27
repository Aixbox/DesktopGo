import type { PersistedGridCoordinate } from '../model.ts'
import { clampNumber } from './geometry.ts'

export const getGridCoordinateForIndex = (
  anchorIndex: number,
  columns: number,
  pageSize: number
): PersistedGridCoordinate => {
  const safeColumns = Math.max(1, columns)
  const safePageSize = Math.max(1, pageSize)
  const safeIndex = Math.max(0, anchorIndex)
  const page = Math.floor(safeIndex / safePageSize)
  const localIndex = safeIndex % safePageSize
  return {
    page,
    row: Math.floor(localIndex / safeColumns),
    col: localIndex % safeColumns,
  }
}

const compareGridCoordinates = (
  left: PersistedGridCoordinate,
  right: PersistedGridCoordinate
): number => {
  if (left.page !== right.page) return left.page - right.page
  if (left.row !== right.row) return left.row - right.row
  return left.col - right.col
}

export const getAnchorCoordinateFromCells = (
  cells: PersistedGridCoordinate[]
): PersistedGridCoordinate | null => {
  if (cells.length === 0) return null

  let anchor = cells[0]
  for (let index = 1; index < cells.length; index += 1) {
    if (compareGridCoordinates(cells[index], anchor) < 0) {
      anchor = cells[index]
    }
  }
  return anchor
}

export const getAnchorIndexFromCoordinate = (
  coordinate: PersistedGridCoordinate,
  columns: number,
  pageSize: number
): number | null => {
  if (
    !Number.isInteger(coordinate.page) ||
    !Number.isInteger(coordinate.row) ||
    !Number.isInteger(coordinate.col) ||
    coordinate.page < 0 ||
    coordinate.row < 0 ||
    coordinate.col < 0
  ) {
    return null
  }

  const safeColumns = Math.max(1, columns)
  const safePageSize = Math.max(1, pageSize)
  const maxRows = Math.max(1, Math.ceil(safePageSize / safeColumns))
  if (coordinate.col >= safeColumns || coordinate.row >= maxRows) {
    return null
  }
  const localIndex = coordinate.row * safeColumns + coordinate.col
  if (localIndex >= safePageSize) return null
  return coordinate.page * safePageSize + localIndex
}

export const getLocalAnchorIndexFromCoordinate = (
  coordinate: PersistedGridCoordinate,
  columns: number,
  pageSize: number
): number | null => {
  const globalAnchorIndex = getAnchorIndexFromCoordinate(
    { ...coordinate, page: 0 },
    columns,
    pageSize
  )
  if (globalAnchorIndex === null) return null
  return globalAnchorIndex
}

export const projectCoordinateToNearestAnchorIndex = (
  coordinate: PersistedGridCoordinate,
  columns: number,
  pageSize: number
): number | null => {
  if (
    !Number.isInteger(coordinate.page) ||
    !Number.isInteger(coordinate.row) ||
    !Number.isInteger(coordinate.col) ||
    coordinate.page < 0 ||
    coordinate.row < 0 ||
    coordinate.col < 0
  ) {
    return null
  }

  const safeColumns = Math.max(1, columns)
  const safePageSize = Math.max(1, pageSize)
  const maxRows = Math.max(1, Math.ceil(safePageSize / safeColumns))
  const clampedRow = clampNumber(coordinate.row, 0, maxRows - 1)
  const clampedCol = clampNumber(coordinate.col, 0, safeColumns - 1)
  let localIndex = clampedRow * safeColumns + clampedCol
  if (localIndex >= safePageSize) {
    localIndex = safePageSize - 1
  }
  return coordinate.page * safePageSize + localIndex
}
