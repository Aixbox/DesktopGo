import type { FolderSize } from '../model'

export interface ClosedFolderPreviewLayout {
  columns: number
  rows: number
  slotCount: number
  standardIconCount: number
  stackedIconCount: number
  stackedSlotIndex: number | null
  visibleIconCount: number
}

export type ClosedFolderPreviewMode = 'standard' | 'four-grid' | 'highlight'

const getClosedFolderGrid = (
  folderSize: FolderSize,
  mode: ClosedFolderPreviewMode = 'standard'
): { columns: number; rows: number } => {
  if (mode === 'four-grid' && folderSize === '2x2') return { columns: 2, rows: 2 }
  switch (folderSize) {
    case '2x2':
      return { columns: 3, rows: 3 }
    case '2x1':
      return { columns: 3, rows: 1 }
    case '1x2':
      return { columns: 1, rows: 3 }
    default:
      return { columns: 2, rows: 2 }
  }
}

/**
 * Organize the closed folder preview independently from the opened folder
 * page. ColorOS keeps the ninth slot as a normal icon until a second overflow
 * item exists; only then does it replace that slot with a 2x2 stacked group.
 */
export const getClosedFolderPreviewLayout = (
  folderSize: FolderSize,
  childCount: number,
  mode: ClosedFolderPreviewMode = 'standard'
): ClosedFolderPreviewLayout => {
  const { columns, rows } = getClosedFolderGrid(folderSize, mode)
  const slotCount = columns * rows
  const count = Number.isFinite(childCount) ? Math.max(0, Math.floor(childCount)) : 0
  const highlight = mode === 'highlight' && folderSize === '2x2'
  const ordinarySlotCount = highlight ? Math.max(1, slotCount - 4) : slotCount - 1
  const exactFillCount = highlight ? ordinarySlotCount + 1 : slotCount
  const overflowCount = Math.max(0, count - ordinarySlotCount)
  const stackedIconCount = count > exactFillCount ? Math.min(4, overflowCount) : 0
  const usesStacked = stackedIconCount >= 2
  const standardIconCount = usesStacked ? ordinarySlotCount : Math.min(count, exactFillCount)

  return {
    columns,
    rows,
    slotCount,
    standardIconCount,
    stackedIconCount: usesStacked ? stackedIconCount : 0,
    stackedSlotIndex: usesStacked ? slotCount - 1 : null,
    visibleIconCount: standardIconCount + (usesStacked ? stackedIconCount : 0),
  }
}

export const getClosedFolderPreviewItems = <T>(
  entries: readonly T[],
  folderSize: FolderSize,
  mode: ClosedFolderPreviewMode = 'standard'
): { standardItems: T[]; stackedItems: T[]; layout: ClosedFolderPreviewLayout } => {
  const layout = getClosedFolderPreviewLayout(folderSize, entries.length, mode)
  return {
    standardItems: entries.slice(0, layout.standardIconCount),
    stackedItems:
      layout.stackedSlotIndex === null
        ? []
        : entries.slice(
            layout.standardIconCount,
            layout.standardIconCount + layout.stackedIconCount
          ),
    layout,
  }
}

export type ClosedFolderDropCellState = 'occupied' | 'empty' | 'stacked' | 'next'

export interface ClosedFolderDropPreview {
  columns: number
  rows: number
  cells: ClosedFolderDropCellState[]
  nextSlotIndex: number | null
}

/**
 * Resolve the closed-folder target shown while an item is hovering a folder.
 * This deliberately uses the same preview layout as the resting tile, so a
 * 2×2 folder never falls back to the opened 4×4 content-page grid.
 */
export const getClosedFolderDropPreview = (
  folderSize: FolderSize,
  childCount: number,
  incomingCount = 1,
  mode: ClosedFolderPreviewMode = 'standard'
): ClosedFolderDropPreview => {
  const count = Number.isFinite(childCount) ? Math.max(0, Math.floor(childCount)) : 0
  const incoming = Number.isFinite(incomingCount) ? Math.max(1, Math.floor(incomingCount)) : 1
  const layout = getClosedFolderPreviewLayout(folderSize, count, mode)
  const cells = Array.from({ length: layout.slotCount }, () => 'empty' as ClosedFolderDropCellState)
  for (let index = 0; index < layout.standardIconCount; index += 1) {
    cells[index] = 'occupied'
  }
  if (layout.stackedSlotIndex !== null) cells[layout.stackedSlotIndex] = 'stacked'

  const targetIndex =
    count < layout.slotCount && count < layout.standardIconCount
      ? count
      : (layout.stackedSlotIndex ?? Math.min(layout.slotCount - 1, count))
  if (incoming > 0 && targetIndex >= 0 && targetIndex < cells.length) {
    cells[targetIndex] = 'next'
  }

  return {
    columns: layout.columns,
    rows: layout.rows,
    cells,
    nextSlotIndex: targetIndex >= 0 && targetIndex < cells.length ? targetIndex : null,
  }
}

export interface DesktopLargeFolderPreviewLayout {
  standardIconCount: number
  splitLastSlot: boolean
  visibleIconCount: number
}

export const getDesktopLargeFolderPreviewLayout = (
  folderSize: Exclude<FolderSize, '1x1'>,
  childCount: number
): DesktopLargeFolderPreviewLayout => {
  const iconCount = Math.max(0, childCount)
  const slotCount = folderSize === '2x2' ? 9 : 3
  const splitLastSlot = iconCount > slotCount
  const standardIconCount = Math.min(iconCount, slotCount - (splitLastSlot ? 1 : 0))
  const visibleIconCount = splitLastSlot
    ? standardIconCount + Math.min(4, iconCount - standardIconCount)
    : standardIconCount

  return { standardIconCount, splitLastSlot, visibleIconCount }
}
