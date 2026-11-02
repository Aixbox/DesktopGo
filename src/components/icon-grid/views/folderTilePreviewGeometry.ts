import type { FolderSize } from '../model'
import { getClosedFolderPreviewLayout } from './folderPreviewPolicy'
import {
  FOLDER_PREVIEW_GAP,
  FOLDER_PREVIEW_PADDING,
  getFolderPreviewSlotSizeForGrid,
  getFolderStackedPreviewMetrics,
} from './folderVisualPolicy'

export interface FolderTilePreviewSlot {
  left: number
  top: number
  size: number
  stacked: boolean
  visible: boolean
}

interface PreviewInput {
  folderSize: FolderSize
  childCount: number
  width: number
  height: number
  panelBase: number
  rtl: boolean
}

function getPreviewGrid(input: PreviewInput) {
  const { folderSize, childCount, width, height, panelBase } = input
  const layout = getClosedFolderPreviewLayout(folderSize, childCount)
  const padding = Math.min(8, Math.max(4, Math.floor(panelBase / 8)))
  if (folderSize === '1x1' || folderSize === '2x2') {
    const inset = Math.round(Math.max(3, Math.min(5, panelBase * 0.06)))
    const previewSize =
      folderSize === '1x1'
        ? Math.max(24, width - inset * 2)
        : Math.max(28, Math.min(width, height) - padding * 2)
    return {
      layout,
      size: getFolderPreviewSlotSizeForGrid(previewSize, layout.columns, layout.rows),
      gap: FOLDER_PREVIEW_GAP,
      left: (width - previewSize) / 2 + FOLDER_PREVIEW_PADDING,
      top: (height - previewSize) / 2 + FOLDER_PREVIEW_PADDING,
    }
  }
  const gap = Math.min(6, Math.max(4, Math.floor(panelBase / 16)))
  const size = Math.max(
    14,
    Math.floor(
      Math.min(
        (width - padding * 2 - gap * (layout.columns - 1)) / layout.columns,
        (height - padding * 2 - gap * (layout.rows - 1)) / layout.rows
      )
    )
  )
  return {
    layout,
    size,
    gap,
    left:
      (width - layout.columns * size - (layout.columns - 1) * gap) / 2 -
      (folderSize === '2x1' ? 2 : 0),
    top:
      (height - layout.rows * size - (layout.rows - 1) * gap) / 2 - (folderSize === '1x2' ? 2 : 0),
  }
}

/** Flat positions let the same child move between a full slot and the four-icon stack. */
export function getFolderTilePreviewGeometry(input: PreviewInput) {
  const grid = getPreviewGrid(input)
  const { layout, size, gap } = grid
  const slotAt = (index: number): FolderTilePreviewSlot => {
    const column = index % layout.columns
    return {
      left: grid.left + (input.rtl ? layout.columns - 1 - column : column) * (size + gap),
      top: grid.top + Math.floor(index / layout.columns) * (size + gap),
      size,
      stacked: false,
      visible: true,
    }
  }
  const stack = slotAt(layout.stackedSlotIndex ?? layout.slotCount - 1)
  const mini = getFolderStackedPreviewMetrics(size)
  // Match CSS grid's centered tracks, including fractional leftover pixels.
  const miniInset = (size - mini.miniSize * 2 - mini.gap) / 2
  const miniAt = (index: number): FolderTilePreviewSlot => ({
    left:
      stack.left +
      miniInset +
      (input.rtl ? 1 - (index % 2) : index % 2) * (mini.miniSize + mini.gap),
    top: stack.top + miniInset + Math.floor(index / 2) * (mini.miniSize + mini.gap),
    size: mini.miniSize,
    stacked: true,
    visible: true,
  })
  const icons = Array.from({ length: Math.min(input.childCount, 12) }, (_, index) => {
    if (index < layout.standardIconCount) return slotAt(index)
    if (index < layout.visibleIconCount) return miniAt(index - layout.standardIconCount)
    // Keep hidden preview children mounted so revealing them doesn't replace their DOM identity.
    return { ...miniAt(3), visible: false }
  })
  const holders =
    layout.stackedSlotIndex === null
      ? []
      : Array.from({ length: 4 - layout.stackedIconCount }, (_, index) =>
          miniAt(layout.stackedIconCount + index)
        )
  return { icons, holders }
}
