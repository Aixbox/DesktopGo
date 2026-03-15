import { AppWindow } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DesktopIcon } from '../../../types'
import {
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
  ICON_GRID_TITLE_HEIGHT,
} from '../../../types'
import type { FolderItem, GridItem } from '../model'
import { getGridItemSpan } from '../model'
import type { FolderDropFlight, MultiDropFlightItem } from '../state/types'
import { FolderIconVisual } from './FolderVisuals'

interface DragGhostPointer {
  pointerX: number
  pointerY: number
}

interface DragOverlaysProps {
  dragPointer: DragGhostPointer | null
  ghostItem: GridItem | null
  iconImageSize: number
  slotWidth: number
  slotHeight: number
  gridGap: number
  dragSessionId: number | null
  stackedIcons: Array<{
    id: string
    icon: DesktopIcon
    sourceCenter: { x: number; y: number }
  }>
  folderDropFlight: FolderDropFlight | null
  multiDropFlight: MultiDropFlightItem[] | null
  reorderAnimationMs: number
  folderPreviewEasing: string
}

const GHOST_FOLDER_SURFACE_CLASS =
  'relative overflow-hidden border border-white/14 bg-[linear-gradient(145deg,rgba(20,31,52,0.94),rgba(8,12,22,0.9))] shadow-[0_16px_36px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md'
const GHOST_FOLDER_INNER_PADDING = 8
const GHOST_FOLDER_INNER_GAP = 6
const GHOST_PREVIEW_ICON_SCALE = 0.84
const GHOST_PREVIEW_ICON_FALLBACK_SCALE = 0.68

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const getGhostFolderSurfaceRadius = (panelBase: number) =>
  Math.round(clampNumber(panelBase * 0.2, 16, 24))

const getSingleSlotGhostPreviewInset = (panelBase: number) =>
  Math.round(clampNumber(panelBase * 0.06, 3, 5))

interface GhostPreviewIconProps {
  iconBase64: string
  name: string
  size: number
}

function GhostPreviewIcon({ iconBase64, name, size }: GhostPreviewIconProps) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {iconBase64 ? (
        <img
          src={iconBase64}
          alt={name}
          className="object-contain"
          style={{
            width: `${Math.max(20, Math.floor(size * GHOST_PREVIEW_ICON_SCALE))}px`,
            height: `${Math.max(20, Math.floor(size * GHOST_PREVIEW_ICON_SCALE))}px`,
          }}
          draggable={false}
        />
      ) : (
        <AppWindow
          className="text-white/70"
          style={{
            width: `${Math.max(16, Math.floor(size * GHOST_PREVIEW_ICON_FALLBACK_SCALE))}px`,
            height: `${Math.max(16, Math.floor(size * GHOST_PREVIEW_ICON_FALLBACK_SCALE))}px`,
          }}
        />
      )}
    </div>
  )
}

function FolderGhost({
  folder,
  slotWidth,
  slotHeight,
  gridGap,
}: {
  folder: FolderItem
  slotWidth: number
  slotHeight: number
  gridGap: number
}) {
  const span = getGridItemSpan(folder)
  const footprintWidth = span.cols * slotWidth + Math.max(0, span.cols - 1) * gridGap
  const footprintHeight = span.rows * slotHeight + Math.max(0, span.rows - 1) * gridGap
  const bodyWidth = Math.max(40, footprintWidth - ICON_GRID_TILE_PADDING_Y * 2)
  const bodyHeight = Math.max(
    32,
    footprintHeight -
      ICON_GRID_TILE_PADDING_Y * 2 -
      ICON_GRID_TITLE_HEIGHT -
      ICON_GRID_TITLE_GAP
  )
  const singleSlotBodyExtent = Math.max(
    32,
    slotHeight -
      ICON_GRID_TILE_PADDING_Y * 2 -
      ICON_GRID_TITLE_HEIGHT -
      ICON_GRID_TITLE_GAP
  )
  const shapeWidth =
    folder.size === '1x2'
      ? Math.min(bodyWidth, singleSlotBodyExtent)
      : folder.size === '2x2' || folder.size === '1x1'
        ? Math.min(bodyWidth, bodyHeight)
        : bodyWidth
  const shapeHeight =
    folder.size === '2x1'
      ? Math.min(bodyHeight, singleSlotBodyExtent)
      : folder.size === '2x2' || folder.size === '1x1'
        ? shapeWidth
        : bodyHeight
  const panelBase = Math.max(32, Math.min(shapeWidth, shapeHeight))
  const surfaceRadius = getGhostFolderSurfaceRadius(panelBase)
  const innerPadding = Math.min(
    GHOST_FOLDER_INNER_PADDING,
    Math.max(4, Math.floor(panelBase / 8))
  )
  const innerGap = Math.min(GHOST_FOLDER_INNER_GAP, Math.max(4, Math.floor(panelBase / 16)))

  if (folder.size === '1x1') {
    const previewInset = getSingleSlotGhostPreviewInset(panelBase)
    const previewSize = Math.max(24, shapeWidth - previewInset * 2)

    return (
      <div
        className="flex items-center justify-center"
        style={{ width: `${bodyWidth}px`, height: `${bodyHeight}px` }}
      >
        <div
          className={`${GHOST_FOLDER_SURFACE_CLASS} flex items-center justify-center`}
          style={{
            width: `${shapeWidth}px`,
            height: `${shapeHeight}px`,
            borderRadius: `${surfaceRadius}px`,
          }}
        >
          <FolderIconVisual
            icons={folder.children.map(child => child.icon)}
            imgSize={previewSize}
            withSurface={false}
          />
        </div>
      </div>
    )
  }

  const previewIcons =
    folder.size === '2x2' ? folder.children.slice(0, 9) : folder.children.slice(0, 3)
  const rows = folder.size === '2x2' ? 3 : folder.size === '1x2' ? 3 : 1
  const cols = folder.size === '2x2' ? 3 : folder.size === '2x1' ? 3 : 1
  const iconSize = Math.max(
    14,
    Math.floor(
      Math.min(
        (shapeWidth - innerPadding * 2 - innerGap * Math.max(0, cols - 1)) / cols,
        (shapeHeight - innerPadding * 2 - innerGap * Math.max(0, rows - 1)) / rows
      )
    )
  )

  return (
    <div
      className="flex items-center justify-center"
      style={{ width: `${bodyWidth}px`, height: `${bodyHeight}px` }}
    >
      <div
        className={`${GHOST_FOLDER_SURFACE_CLASS}`}
        style={{
          width: `${shapeWidth}px`,
          height: `${shapeHeight}px`,
          borderRadius: `${surfaceRadius}px`,
        }}
      >
        <div
          className="absolute inset-0 grid place-items-center"
          style={{
            padding: `${innerPadding}px`,
            gap: `${innerGap}px`,
            gridTemplateColumns: `repeat(${cols}, minmax(0, ${iconSize}px))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, ${iconSize}px))`,
          }}
        >
          {previewIcons.map(icon => (
            <GhostPreviewIcon
              key={icon.key}
              iconBase64={icon.icon.icon_base64}
              name={icon.icon.name}
              size={iconSize}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function DragOverlays({
  dragPointer,
  ghostItem,
  iconImageSize,
  slotWidth,
  slotHeight,
  gridGap,
  dragSessionId,
  stackedIcons,
  folderDropFlight,
  multiDropFlight,
  reorderAnimationMs,
  folderPreviewEasing,
}: DragOverlaysProps) {
  const [stackEntered, setStackEntered] = useState(false)

  useEffect(() => {
    if (!dragSessionId || stackedIcons.length === 0) {
      setStackEntered(false)
      return
    }

    setStackEntered(false)
    const raf = requestAnimationFrame(() => {
      setStackEntered(true)
    })
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [dragSessionId, stackedIcons.length])

  const folderSpan = ghostItem?.kind === 'folder' ? getGridItemSpan(ghostItem) : null
  const folderFootprintWidth =
    folderSpan ? folderSpan.cols * slotWidth + Math.max(0, folderSpan.cols - 1) * gridGap : 0
  const folderFootprintHeight =
    folderSpan ? folderSpan.rows * slotHeight + Math.max(0, folderSpan.rows - 1) * gridGap : 0
  const ghostWidth = ghostItem?.kind === 'folder' ? folderFootprintWidth : iconImageSize
  const ghostHeight = ghostItem?.kind === 'folder' ? folderFootprintHeight : iconImageSize

  return (
    <>
      {dragPointer && ghostItem ? (
        <>
          {ghostItem.kind === 'icon' && stackedIcons.length > 0
            ? stackedIcons.map((entry, index) => {
                const stackOffsetX = Math.min(14, (index + 1) * 3)
                const stackOffsetY = 10 + index * 10
                const targetLeft = dragPointer.pointerX - iconImageSize / 2 + stackOffsetX
                const targetTop = dragPointer.pointerY - iconImageSize / 2 + stackOffsetY
                const baseLeft = entry.sourceCenter.x - iconImageSize / 2
                const baseTop = entry.sourceCenter.y - iconImageSize / 2
                const scale = Math.max(0.72, 0.94 - index * 0.06)
                const opacity = Math.max(0.38, 0.8 - index * 0.12)

                return (
                  <div
                    key={entry.id}
                    className="pointer-events-none fixed"
                    style={{
                      zIndex: 48 - index,
                      width: iconImageSize,
                      height: iconImageSize,
                      left: stackEntered ? targetLeft : baseLeft,
                      top: stackEntered ? targetTop : baseTop,
                      opacity,
                      transform: `scale(${scale})`,
                      transition:
                        'left 220ms cubic-bezier(0.22, 1, 0.36, 1), top 220ms cubic-bezier(0.22, 1, 0.36, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out',
                    }}
                  >
                    {entry.icon.icon_base64 ? (
                      <img
                        src={entry.icon.icon_base64}
                        alt={entry.icon.name}
                        className="object-contain"
                        style={{ width: iconImageSize, height: iconImageSize }}
                        draggable={false}
                      />
                    ) : (
                      <AppWindow className="h-8 w-8 text-foreground/70" />
                    )}
                  </div>
                )
              })
            : null}

          <div
            className="pointer-events-none fixed z-50"
            style={{
              width: ghostWidth,
              height: ghostHeight,
              left: dragPointer.pointerX - ghostWidth / 2,
              top: dragPointer.pointerY - ghostHeight / 2,
            }}
          >
            <div
              className="flex items-center justify-center"
              style={{ width: ghostWidth, height: ghostHeight }}
            >
              {ghostItem.kind === 'icon' ? (
                ghostItem.icon.icon_base64 ? (
                  <img
                    src={ghostItem.icon.icon_base64}
                    alt={ghostItem.icon.name}
                    className="object-contain"
                    style={{ width: iconImageSize, height: iconImageSize }}
                    draggable={false}
                  />
                ) : (
                  <AppWindow className="h-8 w-8 text-foreground/70" />
                )
              ) : (
                <FolderGhost
                  folder={ghostItem}
                  slotWidth={slotWidth}
                  slotHeight={slotHeight}
                  gridGap={gridGap}
                />
              )}
            </div>
          </div>
        </>
      ) : null}

      {multiDropFlight
        ? multiDropFlight.map(item => (
            <div
              key={item.id}
              className="pointer-events-none fixed"
              style={{
                zIndex: item.zIndex,
                width: iconImageSize,
                height: iconImageSize,
                left: item.animate ? item.endLeft : item.startLeft,
                top: item.animate ? item.endTop : item.startTop,
                opacity: item.animate ? item.endOpacity : item.startOpacity,
                transform: `scale(${item.animate ? item.endScale : item.startScale})`,
                transition: `left ${reorderAnimationMs}ms ${folderPreviewEasing}, top ${reorderAnimationMs}ms ${folderPreviewEasing}, transform ${reorderAnimationMs}ms ${folderPreviewEasing}, opacity ${reorderAnimationMs}ms ease-out`,
              }}
            >
              {item.icon.icon_base64 ? (
                <img
                  src={item.icon.icon_base64}
                  alt={item.icon.name}
                  className="object-contain"
                  style={{ width: iconImageSize, height: iconImageSize }}
                  draggable={false}
                />
              ) : (
                <AppWindow className="h-8 w-8 text-foreground/70" />
              )}
            </div>
          ))
        : null}

      {folderDropFlight ? (
        <div
          className="pointer-events-none fixed z-[55]"
          style={{
            left:
              (folderDropFlight.animate ? folderDropFlight.endX : folderDropFlight.startX) -
              (folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize) / 2,
            top:
              (folderDropFlight.animate ? folderDropFlight.endY : folderDropFlight.startY) -
              (folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize) / 2,
            width: folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize,
            height: folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize,
            opacity: folderDropFlight.animate ? 0.92 : 1,
            transition: `left ${reorderAnimationMs}ms ${folderPreviewEasing}, top ${reorderAnimationMs}ms ${folderPreviewEasing}, width ${reorderAnimationMs}ms ${folderPreviewEasing}, height ${reorderAnimationMs}ms ${folderPreviewEasing}, opacity ${reorderAnimationMs}ms ease-out`,
          }}
        >
          {folderDropFlight.icon.icon_base64 ? (
            <img
              src={folderDropFlight.icon.icon_base64}
              alt={folderDropFlight.icon.name}
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <AppWindow className="h-full w-full text-foreground/70" />
          )}
        </div>
      ) : null}
    </>
  )
}
