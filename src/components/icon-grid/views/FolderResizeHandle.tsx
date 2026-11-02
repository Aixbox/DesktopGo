import type { FolderSize, GridSpan } from '../model'
import { motion, useTransform, type MotionValue } from 'framer-motion'
import { useFolderResizeInteraction } from '../hooks/useFolderResizeInteraction'
import { useFolderResizeHandleFocus } from '../hooks/useFolderResizeHandleFocus'
import { getFolderResizeVisualGeometry } from '../domain/folderResizePolicy'
import { FolderResizeOutline } from './FolderResizeOutline'
import type { DesktopFolderTileMetrics } from './folderVisualPolicy'
import { ICON_GRID_TILE_PADDING_Y } from '../../../types'
import { useDismissItemMenu } from '../../icons/focusedItemMenuContext'

interface FolderResizeHandleProps {
  label?: string
  visible: boolean
  span: GridSpan
  display: MotionValue<DesktopFolderTileMetrics>
  cellWidth: number
  cellHeight: number
  gridGap: number
  rtl?: boolean
  onPreview: (size: FolderSize) => void
  onCommit: (size: FolderSize) => void
  onCancel: () => void
}

export function FolderResizeHandle({
  label,
  visible,
  span,
  display,
  cellWidth,
  cellHeight,
  gridGap,
  rtl = false,
  onPreview,
  onCommit,
  onCancel,
}: FolderResizeHandleProps) {
  const dismissMenu = useDismissItemMenu()
  const { frameRef, retained, retain } = useFolderResizeHandleFocus()
  const handleVisible = visible || retained
  const interaction = useFolderResizeInteraction({
    visible: handleVisible,
    span,
    cellWidth,
    cellHeight,
    gridGap,
    rtl,
    onPreview,
    onCommit,
    onCancel,
    onStart: () => {
      retain()
      dismissMenu()
    },
  })
  const geometry = getFolderResizeVisualGeometry(span)
  const x = useTransform(
    display,
    m => (m.footprintWidth - m.shapeWidth) / 2 - geometry.backgroundPaddingX
  )
  const y = useTransform(
    display,
    m => ICON_GRID_TILE_PADDING_Y + (m.bodyHeight - m.shapeHeight) / 2 - geometry.backgroundPaddingY
  )
  const width = useTransform(display, m => m.shapeWidth + geometry.backgroundPaddingX * 2)
  const height = useTransform(display, m => m.shapeHeight + geometry.backgroundPaddingY * 2)
  if (!handleVisible && !interaction.active) return null

  return (
    <motion.div
      ref={frameRef}
      data-folder-resize-frame={interaction.active ? 'active' : 'idle'}
      className="pointer-events-none absolute left-0 top-0 z-40 overflow-visible"
      style={{
        x,
        y,
        width,
        height,
        overflow: 'visible',
      }}
    >
      <FolderResizeOutline
        label={label}
        display={display}
        geometry={geometry}
        rtl={rtl}
        interaction={interaction}
      />
    </motion.div>
  )
}
