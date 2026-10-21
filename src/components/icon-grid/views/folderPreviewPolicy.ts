import type { FolderSize } from '../model'

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
