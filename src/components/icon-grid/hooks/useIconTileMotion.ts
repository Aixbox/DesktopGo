import { useTransform } from 'framer-motion'
import { ICON_GRID_TILE_PADDING_Y, ICON_GRID_TITLE_GAP } from '../../../types'
import { scaledRadius, type DesktopFolderTileMetrics } from '../views/folderVisualPolicy'
import { useFolderResizeMotion } from './useFolderResizeMotion'

const EMPTY_GEOMETRY: DesktopFolderTileMetrics = {
  footprintWidth: 0,
  footprintHeight: 0,
  bodyWidth: 0,
  bodyHeight: 0,
  singleSlotBodyExtent: 0,
  shapeWidth: 0,
  shapeHeight: 0,
  panelBase: 0,
  surfaceRadius: 0,
}

/** Surface, artwork, title and handle share a single animation clock, including retargets. */
export function useIconTileMotion(
  metrics: DesktopFolderTileMetrics | undefined,
  artworkSize: number,
  reducedMotion: boolean
) {
  const display = useFolderResizeMotion(metrics ?? EMPTY_GEOMETRY, reducedMotion, artworkSize)
  const width = useTransform(display, m => m.shapeWidth)
  const height = useTransform(display, m => m.shapeHeight)
  const translate = useTransform(
    display,
    m =>
      `${(m.footprintWidth - m.shapeWidth) / 2}px ${ICON_GRID_TILE_PADDING_Y + (m.bodyHeight - m.shapeHeight) / 2}px`
  )
  const borderRadius = useTransform(display, m => scaledRadius(m.surfaceRadius))
  const titleY = useTransform(
    display,
    m => ICON_GRID_TILE_PADDING_Y + m.bodyHeight + ICON_GRID_TITLE_GAP
  )
  const titleWidth = useTransform(display, m => m.footprintWidth)
  const foregroundSize = useTransform(display, m => m.artworkSize ?? m.shapeWidth)
  return { display, width, height, translate, borderRadius, titleY, titleWidth, foregroundSize }
}
