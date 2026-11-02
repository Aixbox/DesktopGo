import { Icon } from '../../Icon'
import type { IconItem, GridSpan } from '../model'
import { useGridItemResizeActions } from '../hooks/gridItemResizeContext'
import { useIconStore } from '../../../stores/iconStore'
import { ICON_SIZE_CONFIG } from '../../../types'
import { getIconTileMetrics } from './iconTileMetrics'

interface ResizableIconProps {
  item: IconItem
  span: GridSpan
  slotWidth: number
  slotHeight: number
  gridGap: number
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (key: string) => void
  highlighted?: boolean
  motionProfile?: 'default' | 'scroll'
  interactive?: boolean
}

export function ResizableIcon({
  item,
  span,
  slotWidth,
  slotHeight,
  gridGap,
  interactive = true,
  ...props
}: ResizableIconProps) {
  const actions = useGridItemResizeActions()
  const iconSize = useIconStore(state => state.iconSize)
  const titleLineCount = useIconStore(state => state.titleLineCount)
  const metrics = getIconTileMetrics({
    span,
    slotWidth,
    slotHeight,
    gridGap,
    imageSize: ICON_SIZE_CONFIG[iconSize].imgSize,
    titleLineCount,
  })
  return (
    <Icon
      {...props}
      icon={item.icon}
      selectionKey={item.key}
      gridTile={{
        metrics,
        span,
        slotWidth,
        slotHeight,
        gridGap,
        ...(actions && interactive
          ? {
              onPreview: size => actions.preview(item.key, size),
              onCommit: size => actions.commit(item.key, size),
              onCancel: actions.cancel,
            }
          : {}),
      }}
    />
  )
}
