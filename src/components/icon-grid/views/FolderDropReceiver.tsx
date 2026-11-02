import { motion, useTransform, type MotionValue } from 'framer-motion'
import { ICON_GRID_TILE_PADDING_Y } from '../../../types'
import { scaledRadius, type DesktopFolderTileMetrics } from './folderVisualPolicy'

interface FolderDropReceiverProps {
  display: MotionValue<DesktopFolderTileMetrics>
  active: boolean
}

/** The measured body must match FolderGhost, excluding the tile's title and padding. */
export function FolderDropReceiver({ display, active }: FolderDropReceiverProps) {
  const x = useTransform(display, m => (m.footprintWidth - m.bodyWidth) / 2)
  const width = useTransform(display, m => m.bodyWidth)
  const height = useTransform(display, m => m.bodyHeight)
  const backdropWidth = useTransform(display, m => m.shapeWidth + 8)
  const backdropHeight = useTransform(display, m => m.shapeHeight + 8)
  const borderRadius = useTransform(display, m => scaledRadius(m.surfaceRadius + 4))
  return (
    <motion.div
      data-folder-visual-body
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0"
      style={{ x, y: ICON_GRID_TILE_PADDING_Y, width, height }}
    >
      <motion.div
        className="folder-drop-receiver-backdrop"
        data-folder-drop-receiver={active ? 'active' : 'idle'}
        style={{ width: backdropWidth, height: backdropHeight, borderRadius }}
      />
    </motion.div>
  )
}
