import { motion, useReducedMotion, useTransform, type MotionValue } from 'framer-motion'
import {
  getIconGridTitleMetrics,
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
} from '../../../types'
import type { FolderItem, FolderSize, GridSpan } from '../model'
import type { TitleLineCount } from '../../../types'
import { useFolderResizeMotion } from '../hooks/useFolderResizeMotion'
import {
  DESKTOP_FOLDER_SURFACE_CLASS,
  FOLDER_SHARED_LAYOUT_TRANSITION,
  getFolderSharedLayoutId,
  scaledRadius,
  type DesktopFolderTileMetrics,
} from './folderVisualPolicy'
import { FolderTilePreview } from './FolderTilePreview'
import { FolderResizeHandle } from './FolderResizeHandle'
import { FolderDropReceiver } from './FolderDropReceiver'

interface FolderTileContentsProps {
  folder: FolderItem
  metrics: DesktopFolderTileMetrics
  span: GridSpan
  slotWidth: number
  slotHeight: number
  gridGap: number
  titleLineCount: TitleLineCount
  folderPreview: boolean
  folderOpen: boolean
  sharedLayoutActive: boolean
  selectionMode: boolean
  rtl: boolean
  onOpenFolder: (id: string) => void
  onLaunchIcon: (path: string) => void
  onCommit: (size: FolderSize) => void
  onPreview: (size: FolderSize) => void
  onCancel: () => void
}

export function FolderTileContents(props: FolderTileContentsProps) {
  const { folder, metrics, folderPreview, folderOpen, sharedLayoutActive, selectionMode, rtl } =
    props
  const reducedMotion = useReducedMotion() ?? false
  const display = useFolderResizeMotion(metrics, reducedMotion)
  const x = useTransform(display, m => (m.footprintWidth - m.shapeWidth) / 2)
  const y = useTransform(
    display,
    m => ICON_GRID_TILE_PADDING_Y + (m.bodyHeight - m.shapeHeight) / 2
  )
  const width = useTransform(display, m => m.shapeWidth)
  const height = useTransform(display, m => m.shapeHeight)
  const borderRadius = useTransform(display, m => scaledRadius(m.surfaceRadius))
  return (
    <div
      className="folder-tile-body absolute left-0 top-0 cursor-pointer"
      style={{ width: metrics.footprintWidth, height: metrics.footprintHeight }}
      onClick={event => {
        event.stopPropagation()
        props.onOpenFolder(folder.id)
      }}
    >
      <div className="absolute inset-0 isolate">
        <FolderDropReceiver display={display} active={folderPreview} />
        <motion.div
          data-folder-body-hitbox
          layoutId={sharedLayoutActive ? getFolderSharedLayoutId(folder.id) : undefined}
          transition={reducedMotion ? { duration: 0 } : FOLDER_SHARED_LAYOUT_TRANSITION}
          className={`${DESKTOP_FOLDER_SURFACE_CLASS} absolute left-0 top-0 z-10 ${
            folderOpen
              ? 'border-border/70 bg-background/72 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_10px_26px_rgba(15,23,42,0.14)] dark:border-white/40 dark:bg-black/40 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_10px_26px_rgba(0,0,0,0.26)]'
              : ''
          }`}
          style={{ position: 'absolute', x, y, width, height, borderRadius }}
        />
        <FolderTilePreview
          folder={folder}
          metrics={metrics}
          rtl={rtl}
          selectionMode={selectionMode}
          reducedMotion={reducedMotion}
          onOpenFolder={props.onOpenFolder}
          onLaunchIcon={props.onLaunchIcon}
        />
        <FolderTileTitle
          display={display}
          name={folder.name}
          titleLineCount={props.titleLineCount}
        />
      </div>
      <FolderResizeHandle
        visible={selectionMode && !folderPreview && !folderOpen}
        span={props.span}
        display={display}
        cellWidth={props.slotWidth}
        cellHeight={props.slotHeight}
        gridGap={props.gridGap}
        rtl={rtl}
        onCommit={props.onCommit}
        onPreview={props.onPreview}
        onCancel={props.onCancel}
      />
    </div>
  )
}

function FolderTileTitle({
  display,
  name,
  titleLineCount,
}: {
  display: MotionValue<DesktopFolderTileMetrics>
  name: string
  titleLineCount: TitleLineCount
}) {
  const titleX = useTransform(display, m => (m.footprintWidth - m.bodyWidth) / 2)
  const titleY = useTransform(
    display,
    m => ICON_GRID_TILE_PADDING_Y + m.bodyHeight + ICON_GRID_TITLE_GAP
  )
  const titleWidth = useTransform(display, m => m.bodyWidth)
  const title = getIconGridTitleMetrics(titleLineCount)
  return (
    <motion.button
      type="button"
      aria-label={name}
      title={name}
      className="absolute left-0 top-0 z-20 flex items-start justify-center overflow-hidden rounded-md border-none bg-transparent p-0 text-center text-[11px] font-medium leading-[13px] text-foreground shadow-none transition-colors hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 active:bg-transparent"
      style={{ x: titleX, y: titleY, width: titleWidth, height: title.height }}
    >
      <span
        className="icon-label block w-full text-[11px] leading-[13px] text-foreground drop-shadow-md"
        style={{
          height: title.height,
          lineHeight: `${title.lineHeight}px`,
          display: title.singleLine ? 'block' : '-webkit-box',
          WebkitLineClamp: title.lineClamp,
          WebkitBoxOrient: title.singleLine ? undefined : 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: title.singleLine ? 'nowrap' : 'normal',
          overflowWrap: 'anywhere',
        }}
      >
        {name}
      </span>
    </motion.button>
  )
}
