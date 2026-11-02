import type { IconItem } from '../model'
import { getGridItemSpan, isMultiCellGridItem } from '../model'
import { ENLARGED_ICON_SURFACE_CLASS, getIconForegroundSize } from './iconTileMetrics'
import { getDesktopFolderSurfaceRadius, scaledRadius } from './folderVisualPolicy'
import { IconArtwork } from './IconArtwork'

export function IconGhostArtwork({
  item,
  width,
  height,
  imageSize,
}: {
  item: IconItem
  width: number
  height: number
  imageSize: number
}) {
  const enlarged = isMultiCellGridItem(item)
  const foregroundSize = getIconForegroundSize(getGridItemSpan(item), width, height)
  const radius = enlarged
    ? getDesktopFolderSurfaceRadius(Math.max(32, Math.min(width, height)))
    : Math.min(16, imageSize / 4)
  return (
    <div
      className={`relative flex items-center justify-center ${enlarged ? ENLARGED_ICON_SURFACE_CLASS : ''}`}
      style={{ width, height, borderRadius: scaledRadius(radius) }}
    >
      <IconArtwork
        icon={item.icon}
        enlarged={enlarged}
        imageSize={foregroundSize}
        fallbackSize={foregroundSize ?? Math.min(width, height) * 0.7}
      />
    </div>
  )
}
