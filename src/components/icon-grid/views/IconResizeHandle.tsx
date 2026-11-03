import { useEffect } from 'react'
import type { MotionValue } from 'framer-motion'
import { useItemMenuFocused } from '../../icons/focusedItemMenuContext'
import type { DesktopFolderTileMetrics } from './folderVisualPolicy'
import { loadIconColor } from '../services/iconColor'
import { loadRoundedIcon } from '../services/roundedIcon'
import { useDocumentDirection } from '../hooks/useDocumentDirection'
import { FolderResizeHandle } from './FolderResizeHandle'
import type { IconGridTileConfig } from './iconTileMetrics'

/** Ordinary icons use the same contour, hit band, capture and retained-handle lifecycle as folders. */
export function IconResizeHandle({
  tile,
  display,
  source,
}: {
  tile: IconGridTileConfig
  display: MotionValue<DesktopFolderTileMetrics>
  source?: string
}) {
  const focused = useItemMenuFocused()
  // Prepare only the focused icon, before the resize crosses its first size threshold.
  useEffect(() => {
    if (!focused || !source) return
    void loadIconColor(source)
    void loadRoundedIcon(source)
  }, [focused, source])
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
