import type { GridItem } from '../model'
import { getGridItemSpan } from '../model'
import { GRID_GAP } from '../constants'

export const fitGridItemCount = (container: number, item: number) => {
  if (item <= 0 || container <= item) return 1
  return Math.floor((container - item) / (item + GRID_GAP)) + 1
}

export const buildGridGeometryKey = (windowMode: string, iconSize: string, dockEnabled: boolean) =>
  `${windowMode}:${iconSize}:${dockEnabled}`

export const getFolderModalMaxAvailableWidth = (maxWidth: number) => {
  const resolvedMaxWidth =
    typeof window === 'undefined' ? maxWidth : Math.min(maxWidth, window.innerWidth * 0.92)
  return Math.max(0, resolvedMaxWidth - 40)
}

export const getDefaultFolderColumnCount = (tileWidth: number, maxWidth: number) =>
  fitGridItemCount(getFolderModalMaxAvailableWidth(maxWidth), tileWidth)

export const getLayoutNormalizationMetrics = (
  items: GridItem[],
  columns: number,
  pageSize: number
): { columns: number; pageSize: number } => {
  const minColumns = items.some(item => getGridItemSpan(item).cols > 1) ? 2 : 1
  const minRows = items.some(item => getGridItemSpan(item).rows > 1) ? 2 : 1
  const safeColumns = Math.max(minColumns, columns)
  return {
    columns: safeColumns,
    pageSize: Math.max(pageSize, safeColumns * minRows),
  }
}

export const isSuspiciousSingleCellPageGeometry = ({
  columns,
  rows,
  pageSize,
}: {
  columns: number
  rows: number
  pageSize: number
}) => columns === 1 && rows === 1 && pageSize === 1
