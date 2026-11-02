import type { FolderSize, GridSpan } from '../model'
import { useFolderResizeInteraction } from '../hooks/useFolderResizeInteraction'
import { getFolderResizeVisualGeometry } from '../domain/folderResizePolicy'
import { FolderResizeOutline } from './FolderResizeOutline'

interface FolderResizeHandleProps {
  visible: boolean
  span: GridSpan
  frameWidth: number
  frameHeight: number
  frameRadius: number
  frameTop?: number
  cellWidth: number
  cellHeight: number
  gridGap: number
  rtl?: boolean
  onPreview: (size: FolderSize) => void
  onCommit: (size: FolderSize) => void
  onCancel: () => void
}

export function FolderResizeHandle({
  visible,
  span,
  frameWidth,
  frameHeight,
  frameRadius,
  frameTop = 0,
  cellWidth,
  cellHeight,
  gridGap,
  rtl = false,
  onPreview,
  onCommit,
  onCancel,
}: FolderResizeHandleProps) {
  const interaction = useFolderResizeInteraction({
    visible,
    span,
    cellWidth,
    cellHeight,
    gridGap,
    rtl,
    onPreview,
    onCommit,
    onCancel,
  })
  if (!visible && !interaction.active) return null

  const geometry = getFolderResizeVisualGeometry(span)
  const paddedFrameWidth = frameWidth + geometry.backgroundPaddingX * 2
  const paddedFrameHeight = frameHeight + geometry.backgroundPaddingY * 2
  const frameLeft = `calc(50% - ${paddedFrameWidth / 2}px)`
  const frameTopWithPadding = frameTop - geometry.backgroundPaddingY

  return (
    <div
      data-folder-resize-frame={interaction.active ? 'active' : 'idle'}
      className="pointer-events-none absolute z-40 overflow-visible"
      style={{
        left: frameLeft,
        top: frameTopWithPadding,
        width: paddedFrameWidth,
        height: paddedFrameHeight,
        overflow: 'visible',
      }}
    >
      <FolderResizeOutline
        width={frameWidth}
        height={frameHeight}
        radius={frameRadius}
        geometry={geometry}
        rtl={rtl}
        interaction={interaction}
      />
    </div>
  )
}
