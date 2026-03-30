import { AppWindow } from 'lucide-react'
import {
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
  ICON_GRID_TITLE_HEIGHT,
} from '../../../types'
import type { DesktopIcon } from '../../../types'

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
  'relative h-full w-full overflow-hidden rounded-xl border border-border/35 bg-background/42 shadow-[0_12px_28px_rgba(15,23,42,0.16)] backdrop-blur-lg dark:border-white/14 dark:bg-black/24 dark:shadow-[0_12px_28px_rgba(0,0,0,0.26)]'
export const DESKTOP_FOLDER_SURFACE_CLASS =
  'relative h-full w-full overflow-hidden border border-border/45 bg-background/48 shadow-[0_16px_36px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/16 dark:bg-black/30 dark:shadow-[0_16px_36px_rgba(0,0,0,0.24)]'

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const getDesktopFolderSurfaceRadius = (panelBase: number) =>
  Math.round(clampNumber(panelBase * 0.2, 16, 24))

const getDesktopSingleSlotPreviewInset = (panelBase: number) =>
  Math.round(clampNumber(panelBase * 0.06, 3, 5))

export const getFolderSharedLayoutId = (folderId: string) => `folder-shell-${folderId}`

export interface DesktopSingleSlotFolderMetrics {
  bodyWidth: number
  bodyHeight: number
  surfaceSize: number
  surfaceRadius: number
  previewSize: number
  surfaceLeft: number
  surfaceTop: number
}

export const getDesktopSingleSlotFolderMetrics = (
  tileWidth: number,
  tileHeight: number
): DesktopSingleSlotFolderMetrics => {
  const bodyWidth = Math.max(40, tileWidth - ICON_GRID_TILE_PADDING_Y * 2)
  const bodyHeight = Math.max(
    32,
    tileHeight - ICON_GRID_TILE_PADDING_Y * 2 - ICON_GRID_TITLE_HEIGHT - ICON_GRID_TITLE_GAP
  )
  const surfaceSize = Math.min(bodyWidth, bodyHeight)
  const panelBase = Math.max(32, surfaceSize)
  const surfaceRadius = getDesktopFolderSurfaceRadius(panelBase)
  const previewInset = getDesktopSingleSlotPreviewInset(panelBase)
  const previewSize = Math.max(24, surfaceSize - previewInset * 2)

  return {
    bodyWidth,
    bodyHeight,
    surfaceSize,
    surfaceRadius,
    previewSize,
    surfaceLeft: (tileWidth - surfaceSize) / 2,
    surfaceTop: ICON_GRID_TILE_PADDING_Y + Math.max(0, (bodyHeight - surfaceSize) / 2),
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
}

export function FolderCreatePreview({
  active,
  icon,
  imgSize,
  reorderAnimationMs,
  tileWidth,
  tileHeight,
}: FolderCreatePreviewProps) {
  if (tileWidth !== undefined && tileHeight !== undefined) {
    const metrics = getDesktopSingleSlotFolderMetrics(tileWidth, tileHeight)

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
        className={`${FOLDER_SURFACE_CLASS} absolute transition-all duration-200 ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
        style={surfaceStyle}
      >
        <div className="absolute left-0 top-0 overflow-hidden rounded-[5px]" style={itemStyle}>
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
      </div>
    </div>
  )
}

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
              className="absolute overflow-hidden rounded-[5px] transition-[left,top] duration-200 ease-out"
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
