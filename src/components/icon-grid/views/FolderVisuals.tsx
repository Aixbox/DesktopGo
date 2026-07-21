import { AppWindow } from 'lucide-react'
import { memo } from 'react'
import type { DesktopIcon, TitleLineCount } from '../../../types'
import {
  getIconGridTitleHeight,
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
} from '../../../types'
import { useIconStore } from '../../../stores/iconStore'
import type { FolderSize, GridSpan } from '../model'

export const FOLDER_PREVIEW_PADDING = 4
export const FOLDER_PREVIEW_GAP = 2
export const FOLDER_PREVIEW_OUTER_EXPAND = 5
export const FOLDER_PREVIEW_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const FOLDER_PREVIEW_TOP_OFFSET = 12
export const FOLDER_MODAL_MAX_WIDTH = 620
export const FOLDER_MODAL_MAX_HEIGHT = 480
export const FOLDER_MODAL_TRANSITION_EASING = [0.22, 1, 0.36, 1] as const
export const FOLDER_SHARED_LAYOUT_TRANSITION = {
  type: 'spring',
  stiffness: 320,
  damping: 30,
  mass: 0.9,
} as const
export const FOLDER_SURFACE_CLASS =
  'relative h-full w-full overflow-hidden rounded-lg border border-border/35 bg-background/42 shadow-[0_4px_12px_rgba(15,23,42,0.1)] backdrop-blur-lg dark:border-white/14 dark:bg-black/24 dark:shadow-[0_4px_12px_rgba(0,0,0,0.18)]'
export const DESKTOP_FOLDER_SURFACE_CLASS =
  'relative h-full w-full overflow-hidden border border-border/45 bg-background/48 shadow-[0_6px_18px_rgba(15,23,42,0.12)] backdrop-blur-lg dark:border-white/16 dark:bg-black/30 dark:shadow-[0_6px_18px_rgba(0,0,0,0.18)]'
export const DOCK_FOLDER_SURFACE_CLASS =
  'relative h-full w-full overflow-hidden border border-foreground/[0.12] bg-background/46 shadow-[inset_0_1px_0_rgba(255,255,255,0.34),inset_0_0_0_1px_rgba(15,23,42,0.03)] backdrop-blur-xl dark:border-white/14 dark:bg-black/24 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
export const DOCK_FOLDER_SURFACE_ACTIVE_CLASS =
  'border-foreground/[0.18] bg-background/62 ring-1 ring-foreground/[0.12] dark:border-white/28 dark:bg-black/34 dark:ring-white/[0.16]'

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const getDesktopFolderSurfaceRadius = (panelBase: number) =>
  Math.round(clampNumber(panelBase * 0.2, 16, 24))

const getDesktopSingleSlotPreviewInset = (panelBase: number) =>
  Math.round(clampNumber(panelBase * 0.06, 3, 5))

export const getFolderSharedLayoutId = (folderId: string) => `folder-shell-${folderId}`

export interface DesktopFolderTileMetrics {
  footprintWidth: number
  footprintHeight: number
  bodyWidth: number
  bodyHeight: number
  singleSlotBodyExtent: number
  shapeWidth: number
  shapeHeight: number
  panelBase: number
  surfaceRadius: number
}

export interface DesktopSingleSlotFolderMetrics {
  bodyWidth: number
  bodyHeight: number
  surfaceSize: number
  surfaceRadius: number
  previewSize: number
  surfaceLeft: number
  surfaceTop: number
}

export const getDesktopFolderTileMetrics = ({
  span,
  slotWidth,
  slotHeight,
  gridGap,
  folderSize,
  titleLineCount = 'two',
  surfaceTitleLineCount = titleLineCount,
}: {
  span: GridSpan
  slotWidth: number
  slotHeight: number
  gridGap: number
  folderSize: FolderSize
  titleLineCount?: TitleLineCount
  surfaceTitleLineCount?: TitleLineCount
}): DesktopFolderTileMetrics => {
  const titleHeight = getIconGridTitleHeight(titleLineCount)
  const surfaceTitleHeight = getIconGridTitleHeight(surfaceTitleLineCount)
  const footprintWidth = span.cols * slotWidth + Math.max(0, span.cols - 1) * gridGap
  const footprintHeight = span.rows * slotHeight + Math.max(0, span.rows - 1) * gridGap
  const bodyWidth = Math.max(40, footprintWidth - ICON_GRID_TILE_PADDING_Y * 2)
  const bodyHeight = Math.max(
    32,
    footprintHeight - ICON_GRID_TILE_PADDING_Y * 2 - titleHeight - ICON_GRID_TITLE_GAP
  )
  const singleSlotBodyExtent = Math.max(
    32,
    slotHeight - ICON_GRID_TILE_PADDING_Y * 2 - titleHeight - ICON_GRID_TITLE_GAP
  )
  const surfaceBodyHeight = Math.max(
    32,
    footprintHeight - ICON_GRID_TILE_PADDING_Y * 2 - surfaceTitleHeight - ICON_GRID_TITLE_GAP
  )
  const surfaceSingleSlotBodyExtent = Math.max(
    32,
    slotHeight - ICON_GRID_TILE_PADDING_Y * 2 - surfaceTitleHeight - ICON_GRID_TITLE_GAP
  )
  const shapeWidth =
    folderSize === '1x2'
      ? Math.min(bodyWidth, surfaceSingleSlotBodyExtent)
      : folderSize === '2x2' || folderSize === '1x1'
        ? Math.min(bodyWidth, surfaceBodyHeight)
        : bodyWidth
  const shapeHeight =
    folderSize === '2x1'
      ? Math.min(surfaceBodyHeight, surfaceSingleSlotBodyExtent)
      : folderSize === '2x2' || folderSize === '1x1'
        ? shapeWidth
        : surfaceBodyHeight
  const panelBase = Math.max(32, Math.min(shapeWidth, shapeHeight))

  return {
    footprintWidth,
    footprintHeight,
    bodyWidth,
    bodyHeight,
    singleSlotBodyExtent,
    shapeWidth,
    shapeHeight,
    panelBase,
    surfaceRadius: getDesktopFolderSurfaceRadius(panelBase),
  }
}

export const getDesktopSingleSlotFolderMetrics = (
  tileWidth: number,
  tileHeight: number,
  titleLineCount: TitleLineCount = 'two'
): DesktopSingleSlotFolderMetrics => {
  const metrics = getDesktopFolderTileMetrics({
    span: { cols: 1, rows: 1 },
    slotWidth: tileWidth,
    slotHeight: tileHeight,
    gridGap: 0,
    folderSize: '1x1',
    titleLineCount,
    surfaceTitleLineCount: 'two',
  })
  const previewInset = getDesktopSingleSlotPreviewInset(metrics.panelBase)
  const previewSize = Math.max(24, metrics.shapeWidth - previewInset * 2)

  return {
    bodyWidth: metrics.bodyWidth,
    bodyHeight: metrics.bodyHeight,
    surfaceSize: metrics.shapeWidth,
    surfaceRadius: metrics.surfaceRadius,
    previewSize,
    surfaceLeft: (tileWidth - metrics.shapeWidth) / 2,
    surfaceTop:
      ICON_GRID_TILE_PADDING_Y + Math.max(0, (metrics.bodyHeight - metrics.shapeHeight) / 2),
  }
}

export const getFolderPreviewSlotSize = (imgSize: number): number =>
  Math.max(8, Math.floor((imgSize - FOLDER_PREVIEW_PADDING * 2 - FOLDER_PREVIEW_GAP) / 2))
export const getFolderPreviewFrameSize = (imgSize: number): number =>
  imgSize + FOLDER_PREVIEW_OUTER_EXPAND * 2

interface FolderCreatePreviewProps {
  active: boolean
  icon: DesktopIcon
  imgSize: number
  reorderAnimationMs: number
  tileWidth?: number
  tileHeight?: number
  surfaceClassName?: string
}

export const FolderCreatePreview = memo(function FolderCreatePreview({
  active,
  icon,
  imgSize,
  reorderAnimationMs,
  tileWidth,
  tileHeight,
  surfaceClassName = FOLDER_SURFACE_CLASS,
}: FolderCreatePreviewProps) {
  const titleLineCount = useIconStore(state => state.titleLineCount)

  if (tileWidth !== undefined && tileHeight !== undefined) {
    const metrics = getDesktopSingleSlotFolderMetrics(tileWidth, tileHeight, titleLineCount)

    return (
      <div className="pointer-events-none absolute inset-0 z-30" aria-hidden="true">
        <div
          className={`${DESKTOP_FOLDER_SURFACE_CLASS} absolute transition-all duration-200 ${
            active ? 'scale-100 opacity-100' : 'scale-[0.94] opacity-0'
          }`}
          style={{
            left: `${metrics.surfaceLeft}px`,
            top: `${metrics.surfaceTop}px`,
            width: `${metrics.surfaceSize}px`,
            height: `${metrics.surfaceSize}px`,
            borderRadius: `${metrics.surfaceRadius}px`,
            transitionDuration: `${reorderAnimationMs}ms`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <FolderIconVisual icons={[icon]} imgSize={metrics.previewSize} withSurface={false} />
          </div>
        </div>
      </div>
    )
  }

  const frameSize = getFolderPreviewFrameSize(imgSize)
  const slotSize = getFolderPreviewSlotSize(imgSize)
  const startSize = Math.max(slotSize, Math.floor(imgSize * 0.84))
  const startOffset = (imgSize - startSize) / 2
  const surfaceOffset = FOLDER_PREVIEW_OUTER_EXPAND

  const itemStyle = {
    width: `${active ? slotSize : startSize}px`,
    height: `${active ? slotSize : startSize}px`,
    transform: `translate3d(${active ? surfaceOffset + FOLDER_PREVIEW_PADDING : surfaceOffset + startOffset}px, ${active ? surfaceOffset + FOLDER_PREVIEW_PADDING : surfaceOffset + startOffset}px, 0)`,
    opacity: active ? 1 : 0,
    transition: `transform ${reorderAnimationMs}ms ${FOLDER_PREVIEW_EASING}, width ${reorderAnimationMs}ms ${FOLDER_PREVIEW_EASING}, height ${reorderAnimationMs}ms ${FOLDER_PREVIEW_EASING}, opacity 140ms ease-out`,
  } as const

  const frameStyle = {
    width: `${frameSize}px`,
    height: `${frameSize}px`,
    top: `${FOLDER_PREVIEW_TOP_OFFSET - FOLDER_PREVIEW_OUTER_EXPAND}px`,
  } as const

  const surfaceStyle = {
    left: '0px',
    top: '0px',
    width: `${frameSize}px`,
    height: `${frameSize}px`,
  } as const

  return (
    <div
      className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2"
      style={frameStyle}
      aria-hidden="true"
    >
      <div
        className={`${surfaceClassName} absolute transition-all duration-200 ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
        style={surfaceStyle}
      >
        <div className="absolute left-0 top-0 overflow-hidden" style={itemStyle}>
          {icon.icon_base64 ? (
            <img
              src={icon.icon_base64}
              alt={icon.name}
              className="launchpad-icon-artwork h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <AppWindow className="h-full w-full text-foreground/70" />
          )}
        </div>
      </div>
    </div>
  )
})

interface FolderIconVisualProps {
  icons: DesktopIcon[]
  imgSize: number
  expanded?: boolean
  withSurface?: boolean
}

export function FolderIconVisual({
  icons,
  imgSize,
  expanded = false,
  withSurface = true,
}: FolderIconVisualProps) {
  const visualSize = expanded ? getFolderPreviewFrameSize(imgSize) : imgSize
  const slotSize = getFolderPreviewSlotSize(imgSize)
  const outerExpand = expanded ? FOLDER_PREVIEW_OUTER_EXPAND : 0
  const frameStyle = {
    width: `${imgSize}px`,
    height: `${imgSize}px`,
  } as const

  const surfaceStyle = {
    left: `${-outerExpand}px`,
    top: `${-outerExpand}px`,
    width: `${visualSize}px`,
    height: `${visualSize}px`,
  } as const

  const hitboxStyle = {
    left: '0px',
    top: '0px',
    width: `${imgSize}px`,
    height: `${imgSize}px`,
  } as const

  return (
    <div className="relative" style={frameStyle} aria-hidden="true" data-folder-icon-visual>
      <div className="pointer-events-none absolute" style={hitboxStyle} data-folder-icon-hitbox />
      <div
        className={`${withSurface ? FOLDER_SURFACE_CLASS : ''} absolute transition-[left,top,width,height] duration-200 ease-out`}
        style={surfaceStyle}
      >
        {icons.slice(0, 4).map((icon, idx) => {
          const row = Math.floor(idx / 2)
          const col = idx % 2
          const left = outerExpand + FOLDER_PREVIEW_PADDING + col * (slotSize + FOLDER_PREVIEW_GAP)
          const top = outerExpand + FOLDER_PREVIEW_PADDING + row * (slotSize + FOLDER_PREVIEW_GAP)
          return (
            <div
              key={`${icon.id}-${idx}`}
              className="launchpad-icon-artwork absolute overflow-hidden transition-[left,top] duration-200 ease-out"
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${slotSize}px`,
                height: `${slotSize}px`,
              }}
            >
              {icon.icon_base64 ? (
                <img
                  src={icon.icon_base64}
                  alt={icon.name}
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <AppWindow className="h-full w-full text-foreground/70" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
