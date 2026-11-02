import type { FolderSize, GridSpan } from '../model'
import { useFolderResizeInteraction } from '../hooks/useFolderResizeInteraction'
import { getFolderResizeVisualGeometry } from '../domain/folderResizePolicy'

interface FolderResizeHandleProps {
  visible: boolean
  span: GridSpan
  frameWidth: number
  frameHeight: number
  frameTop?: number
  cellWidth: number
  cellHeight: number
  gridGap: number
  rtl?: boolean
  onPreview: (size: FolderSize) => void
  onCommit: (size: FolderSize) => void
  onCancel: () => void
}

function ResizeFrameStroke({
  active,
  width,
  height,
  strokeWidth,
}: {
  active: boolean
  width: number
  height: number
  strokeWidth: number
}) {
  if (!active) return null
  return (
    <rect
      x={strokeWidth / 2}
      y={strokeWidth / 2}
      width={Math.max(1, width - strokeWidth)}
      height={Math.max(1, height - strokeWidth)}
      rx={Math.min(22, Math.min(width, height) * 0.2)}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    />
  )
}

function ResizeArc({
  size,
  radius,
  strokeWidth,
  rtl,
}: {
  size: number
  radius: number
  strokeWidth: number
  rtl: boolean
}) {
  const safeRadius = Math.min(radius, Math.max(1, size - strokeWidth))
  const start = size - safeRadius
  const end = size
  return (
    <svg
      aria-hidden="true"
      className="h-full w-full"
      viewBox={`0 0 ${size} ${size}`}
      style={rtl ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path
        d={`M ${start} ${end} A ${safeRadius} ${safeRadius} 0 0 1 ${end} ${start}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function FolderResizeHandle({
  visible,
  span,
  frameWidth,
  frameHeight,
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

  const geometry = getFolderResizeVisualGeometry(span, interaction.active)
  const paddedFrameWidth = frameWidth + geometry.backgroundPaddingX * 2
  const paddedFrameHeight = frameHeight + geometry.backgroundPaddingY * 2
  const frameLeft = `calc(50% - ${paddedFrameWidth / 2}px)`
  const frameTopWithPadding = frameTop - geometry.backgroundPaddingY
  const offsetX = geometry.backgroundPaddingX
  const offsetY = geometry.backgroundPaddingY

  return (
    <div
      data-folder-resize-frame={interaction.active ? 'active' : 'idle'}
      className="pointer-events-none absolute z-40"
      style={{
        left: frameLeft,
        top: frameTopWithPadding,
        width: paddedFrameWidth,
        height: paddedFrameHeight,
      }}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-black/20 dark:text-white/60"
        viewBox={`0 0 ${Math.max(1, paddedFrameWidth)} ${Math.max(1, paddedFrameHeight)}`}
        preserveAspectRatio="none"
      >
        <ResizeFrameStroke
          active={interaction.active}
          width={paddedFrameWidth}
          height={paddedFrameHeight}
          strokeWidth={geometry.frameStrokeWidth}
        />
      </svg>
      <button
        type="button"
        aria-label="调整文件夹大小"
        title="拖动调整文件夹大小"
        className="pointer-events-auto absolute touch-none rounded-full border-0 bg-transparent p-0 text-[#808080] outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:text-white"
        style={{
          width: interaction.hotSize,
          height: interaction.hotSize,
          bottom: -offsetY,
          ...(rtl ? { left: -offsetX } : { right: -offsetX }),
        }}
        onPointerDown={interaction.startPointerResize}
        onPointerMove={interaction.movePointerResize}
        onPointerUp={interaction.finishPointerResize}
        onPointerCancel={event => interaction.finishPointerResize(event, true)}
        onClick={event => event.stopPropagation()}
      >
        <ResizeArc
          size={interaction.hotSize}
          radius={geometry.handleRadius}
          strokeWidth={geometry.handleStrokeWidth}
          rtl={rtl}
        />
      </button>
    </div>
  )
}
