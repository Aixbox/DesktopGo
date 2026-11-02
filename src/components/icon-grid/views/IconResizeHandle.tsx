import { useReducedMotion } from 'framer-motion'
import { useItemMenuFocused } from '../../icons/focusedItemMenuContext'
import { useFolderResizeMotion } from '../hooks/useFolderResizeMotion'
import { useDocumentDirection } from '../hooks/useDocumentDirection'
import { FolderResizeHandle } from './FolderResizeHandle'
import type { IconGridTileConfig } from './iconTileMetrics'

/** Ordinary icons use the same contour, hit band, capture and retained-handle lifecycle as folders. */
export function IconResizeHandle({ tile }: { tile: IconGridTileConfig }) {
  const focused = useItemMenuFocused()
  const reducedMotion = useReducedMotion() ?? false
  const display = useFolderResizeMotion(tile.metrics, reducedMotion)
  const rtl = useDocumentDirection() === 'rtl'
  if (!tile.onCommit || !tile.onPreview || !tile.onCancel) return null
  return (
    <FolderResizeHandle
      visible={focused}
      span={tile.span}
      display={display}
      cellWidth={tile.slotWidth}
      cellHeight={tile.slotHeight}
      gridGap={tile.gridGap}
      rtl={rtl}
      label="调整图标大小"
      onCommit={tile.onCommit}
      onPreview={tile.onPreview}
      onCancel={tile.onCancel}
    />
  )
}
