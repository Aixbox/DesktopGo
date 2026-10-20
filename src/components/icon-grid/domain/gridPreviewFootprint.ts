import type { GridItem, GridSpan } from '../model.ts'
import { getGridItemSpan } from '../model.ts'
import { canPlaceItemAtAnchorIndex, getFootprintIndices } from './topLevelLayout.ts'

export interface GridPreviewFootprint {
  row: number
  col: number
  span: GridSpan
}

interface ResolveGridPreviewFootprintInput {
  anchorIndex: number | null
  currentPage: number
  columns: number
  folderPreviewTargetId: string | null
  item: GridItem
  items: GridItem[]
  pageSize: number
  slots: Array<string | null>
}

export const resolveGridPreviewFootprint = ({
  anchorIndex,
  currentPage,
  columns,
  folderPreviewTargetId,
  item,
  items,
  pageSize,
  slots,
}: ResolveGridPreviewFootprintInput): GridPreviewFootprint | null => {
  if (anchorIndex === null || folderPreviewTargetId !== null) return null

  const safeColumns = Math.max(1, columns)
  const safePageSize = Math.max(1, pageSize)
  const span = getGridItemSpan(item)
  if (!canPlaceItemAtAnchorIndex(slots, items, anchorIndex, span, safeColumns, safePageSize)) {
    return null
  }

  const footprint = getFootprintIndices(anchorIndex, span, safeColumns, safePageSize)
  if (!footprint) return null

  const pageStart = currentPage * safePageSize
  const pageEnd = pageStart + safePageSize
  if (footprint.some(index => index < pageStart || index >= pageEnd)) return null

  const localIndex = anchorIndex - pageStart
  return {
    row: Math.floor(localIndex / safeColumns),
    col: localIndex % safeColumns,
    span,
  }
}
