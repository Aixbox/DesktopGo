import { AppWindow } from 'lucide-react'
import { memo } from 'react'
import type { DesktopIcon } from '../../../types'
import { ICON_GRID_TILE_PADDING_Y } from '../../../types'
import { useIconStore } from '../../../stores/iconStore'
import type { GridSpan } from '../model'
import { folderSizeFromSpan } from '../domain/folderResizePolicy'
import { useDocumentDirection } from '../hooks/useDocumentDirection'
import { getFolderTilePreviewGeometry } from './folderTilePreviewGeometry'
import {
  DESKTOP_FOLDER_SURFACE_CLASS,
  FOLDER_PREVIEW_EASING,
  FOLDER_PREVIEW_GAP,
  FOLDER_PREVIEW_OUTER_EXPAND,
  FOLDER_PREVIEW_PADDING,
  FOLDER_PREVIEW_TOP_OFFSET,
  FOLDER_SURFACE_CLASS,
  FOLDER_PREVIEW_ICON_FALLBACK_SCALE,
  FOLDER_PREVIEW_ICON_SCALE,
  getDesktopFolderTileMetrics,
  getFolderPreviewArtworkSize,
  getFolderPreviewFrameSize,
  getFolderPreviewSlotSize,
  getFolderPreviewSlotSizeForGrid,
  getFolderStackedPreviewMetrics,
  scaledRadius,
} from './folderVisualPolicy'
import type { ClosedFolderPreviewLayout } from './folderPreviewPolicy'
import {
  DEFAULT_FOLDER_PREVIEW_THEME,
  shouldRenderFolderPreviewHolders,
  type FolderPreviewThemeState,
} from '../domain/folderPreviewThemePolicy'

interface FolderCreatePreviewProps {
  active: boolean
  icon: DesktopIcon
  imgSize: number
  reorderAnimationMs: number
  tileWidth?: number
  tileHeight?: number
  span?: GridSpan
  gridGap?: number
  surfaceClassName?: string
}

function DesktopFolderCreatePreview({
  active,
  icon,
  reorderAnimationMs,
  tileWidth,
  tileHeight,
  span = { cols: 1, rows: 1 },
  gridGap = 0,
}: FolderCreatePreviewProps & { tileWidth: number; tileHeight: number }) {
  const titleLineCount = useIconStore(state => state.titleLineCount)
  const direction = useDocumentDirection()
  const folderSize = folderSizeFromSpan(span)
  const metrics = getDesktopFolderTileMetrics({
    span,
    slotWidth: tileWidth,
    slotHeight: tileHeight,
    gridGap,
    folderSize,
    titleLineCount,
    surfaceTitleLineCount: titleLineCount,
  })
  const { icons } = getFolderTilePreviewGeometry({
    folderSize,
    childCount: 2,
    width: metrics.shapeWidth,
    height: metrics.shapeHeight,
    panelBase: metrics.panelBase,
    rtl: direction === 'rtl',
  })
  const left = (metrics.footprintWidth - metrics.shapeWidth) / 2
  const top = ICON_GRID_TILE_PADDING_Y + (metrics.bodyHeight - metrics.shapeHeight) / 2
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-30 transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
      style={{ transitionDuration: `${reorderAnimationMs}ms` }}
      aria-hidden="true"
    >
      <div
        data-folder-create-surface
        className={`${DESKTOP_FOLDER_SURFACE_CLASS} absolute`}
        style={{
          position: 'absolute',
          left,
          top,
          width: metrics.shapeWidth,
          height: metrics.shapeHeight,
          borderRadius: scaledRadius(metrics.surfaceRadius),
        }}
      />
      {icons.map((slot, index) => (
        <div
          key={index}
          data-folder-create-drop-slot={index === 1 ? '' : undefined}
          className="absolute flex items-center justify-center"
          style={{
            left: left + slot.left,
            top: top + slot.top,
            width: slot.size,
            height: slot.size,
          }}
        >
          {index === 0 ? (
            <FolderPreviewArtwork
              icon={icon}
              size={slot.size}
              minimumSize={20}
              fallbackMinimumSize={16}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}

export const FolderCreatePreview = memo(function FolderCreatePreview({
  active,
  icon,
  imgSize,
  reorderAnimationMs,
  tileWidth,
  tileHeight,
  span,
  gridGap,
  surfaceClassName = FOLDER_SURFACE_CLASS,
}: FolderCreatePreviewProps) {
  if (tileWidth !== undefined && tileHeight !== undefined) {
    return (
      <DesktopFolderCreatePreview
        active={active}
        icon={icon}
        imgSize={imgSize}
        reorderAnimationMs={reorderAnimationMs}
        tileWidth={tileWidth}
        tileHeight={tileHeight}
        span={span}
        gridGap={gridGap}
      />
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
  /** Extra children kept outside the active preview page, shown as a stack. */
  stackedIcons?: DesktopIcon[]
  /** Closed-folder grid and the slot occupied by the ColorOS stacked drawable. */
  previewLayout?: ClosedFolderPreviewLayout
  rtl?: boolean
  previewTheme?: FolderPreviewThemeState
  expanded?: boolean
  withSurface?: boolean
}

function FolderPreviewArtwork({
  icon,
  size,
  minimumSize = 5,
  fallbackMinimumSize = minimumSize,
}: {
  icon: DesktopIcon
  size: number
  minimumSize?: number
  fallbackMinimumSize?: number
}) {
  const artworkSize = getFolderPreviewArtworkSize(
    size,
    icon.icon_base64 ? FOLDER_PREVIEW_ICON_SCALE : FOLDER_PREVIEW_ICON_FALLBACK_SCALE,
    icon.icon_base64 ? minimumSize : fallbackMinimumSize
  )

  return icon.icon_base64 ? (
    <img
      src={icon.icon_base64}
      alt=""
      className="launchpad-icon-artwork object-contain"
      style={{ width: artworkSize, height: artworkSize }}
      draggable={false}
    />
  ) : (
    <AppWindow className="text-foreground/70" style={{ width: artworkSize, height: artworkSize }} />
  )
}

function StackedFolderPreview({
  icons,
  size,
  position,
  showHolders,
}: {
  icons: DesktopIcon[]
  size: number
  position: { left: number; top: number }
  showHolders: boolean
}) {
  const { padding, gap, miniSize } = getFolderStackedPreviewMetrics(size)
  return (
    <div
      data-folder-stacked-preview="true"
      className="pointer-events-none absolute grid grid-cols-2 grid-rows-2 place-items-center overflow-hidden rounded-icon-tile"
      style={{
        left: position.left,
        top: position.top,
        width: size,
        height: size,
        gap,
        padding,
        zIndex: 3,
      }}
    >
      {Array.from({ length: 4 }, (_, index) => {
        const icon = icons[index]
        return (
          <span
            key={icon ? `${icon.id}-${index}` : `holder-${index}`}
            data-folder-stacked-slot={icon ? 'icon' : 'holder'}
            className={`flex items-center justify-center overflow-hidden rounded-icon-tile ${
              !icon && showHolders ? 'bg-foreground/[0.04] dark:bg-white/[0.06]' : 'bg-transparent'
            }`}
            style={{ width: miniSize, height: miniSize }}
          >
            {icon ? <FolderPreviewArtwork icon={icon} size={miniSize} /> : null}
          </span>
        )
      })}
    </div>
  )
}

export function FolderIconVisual({
  icons,
  imgSize,
  stackedIcons = [],
  previewLayout,
  rtl = false,
  previewTheme = DEFAULT_FOLDER_PREVIEW_THEME,
  expanded = false,
  withSurface = true,
}: FolderIconVisualProps) {
  const visualSize = expanded ? getFolderPreviewFrameSize(imgSize) : imgSize
  const columns = previewLayout?.columns ?? 2
  const rows = previewLayout?.rows ?? 2
  const slotSize = previewLayout
    ? getFolderPreviewSlotSizeForGrid(imgSize, columns, rows)
    : getFolderPreviewSlotSize(imgSize)
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
  const stackIndex = previewLayout?.stackedSlotIndex ?? null
  const visibleStack = stackedIcons.slice(0, previewLayout?.stackedIconCount ?? 0)
  const showStackedHolders = shouldRenderFolderPreviewHolders(previewTheme)
  const getSlotPosition = (index: number) => {
    const row = Math.floor(index / columns)
    const logicalColumn = index % columns
    const col = rtl ? columns - logicalColumn - 1 : logicalColumn
    return {
      left: outerExpand + FOLDER_PREVIEW_PADDING + col * (slotSize + FOLDER_PREVIEW_GAP),
      top: outerExpand + FOLDER_PREVIEW_PADDING + row * (slotSize + FOLDER_PREVIEW_GAP),
    }
  }

  return (
    <div className="relative" style={frameStyle} aria-hidden="true" data-folder-icon-visual>
      <div className="pointer-events-none absolute" style={hitboxStyle} data-folder-icon-hitbox />
      <div
        className={`${withSurface ? FOLDER_SURFACE_CLASS : ''} absolute transition-[left,top,width,height] duration-200 ease-out`}
        style={surfaceStyle}
      >
        <div className="relative h-full w-full">
          {icons.slice(0, previewLayout?.standardIconCount ?? 4).map((icon, idx) => {
            const position = getSlotPosition(idx)
            return (
              <div
                key={`${icon.id}-${idx}`}
                className="launchpad-icon-artwork absolute flex items-center justify-center overflow-hidden transition-[left,top] duration-200 ease-out"
                style={{
                  left: `${position.left}px`,
                  top: `${position.top}px`,
                  width: `${slotSize}px`,
                  height: `${slotSize}px`,
                  zIndex: 2,
                }}
              >
                <FolderPreviewArtwork
                  icon={icon}
                  size={slotSize}
                  minimumSize={20}
                  fallbackMinimumSize={16}
                />
              </div>
            )
          })}
          {stackIndex !== null && visibleStack.length > 0 ? (
            <StackedFolderPreview
              icons={visibleStack}
              size={slotSize}
              position={getSlotPosition(stackIndex)}
              showHolders={showStackedHolders}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
