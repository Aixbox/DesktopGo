import type { IconItem } from '../model'
import { getGridItemSpan, isMultiCellGridItem } from '../model'
import {
  ENLARGED_ICON_SURFACE_CLASS,
  getIconForegroundSize,
  getIconPreviewSurfaceRadius,
} from './iconTileMetrics'
import { getDesktopFolderSurfaceRadius, scaledRadius } from './folderVisualPolicy'
import { IconArtwork } from './IconArtwork'

export function IconGhostArtwork({
  item,
  width,
  height,
  imageSize,
  compactPreview = false,
}: {
  item: IconItem
  width: number
  height: number
  imageSize: number
  compactPreview?: boolean
}) {
  const enlarged = isMultiCellGridItem(item)
  const foregroundSize = getIconForegroundSize(getGridItemSpan(item), width, height)
  const radius = enlarged
    ? getDesktopFolderSurfaceRadius(Math.max(32, Math.min(width, height)))
    : Math.min(16, imageSize / 4)
  return (
    <div
      className={`relative flex items-center justify-center transition-[border-radius] duration-200 ease-out motion-reduce:transition-none ${enlarged ? ENLARGED_ICON_SURFACE_CLASS : ''}`}
      style={{
        width,
        height,
        borderRadius: scaledRadius(
          compactPreview && enlarged
            ? Math.max(radius, getIconPreviewSurfaceRadius(width, height))
            : radius
        ),
      }}
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
