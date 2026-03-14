import { AppWindow } from 'lucide-react'
import {
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
  ICON_GRID_TITLE_HEIGHT,
} from '../../../types'
import type { FolderItem, GridItem } from '../model'
import { getGridItemSpan } from '../model'
import type { FolderDropFlight } from '../state/types'
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
  folderDropFlight: FolderDropFlight | null
  reorderAnimationMs: number
  folderPreviewEasing: string
}

const GHOST_FOLDER_SURFACE_CLASS =
  'relative overflow-hidden rounded-[24px] border border-white/14 bg-[linear-gradient(145deg,rgba(20,31,52,0.94),rgba(8,12,22,0.9))] shadow-[0_16px_36px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md'
const GHOST_FOLDER_INNER_PADDING = 10
const GHOST_FOLDER_INNER_GAP = 8

interface GhostPreviewIconProps {
  iconBase64: string
  name: string
  size: number
}

function GhostPreviewIcon({ iconBase64, name, size }: GhostPreviewIconProps) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {iconBase64 ? (
        <img
          src={iconBase64}
          alt={name}
          className="object-contain"
          style={{
            width: `${Math.max(18, Math.floor(size * 0.68))}px`,
            height: `${Math.max(18, Math.floor(size * 0.68))}px`,
          }}
          draggable={false}
        />
      ) : (
        <AppWindow
          className="text-white/70"
          style={{
            width: `${Math.max(16, Math.floor(size * 0.55))}px`,
            height: `${Math.max(16, Math.floor(size * 0.55))}px`,
          }}
        />
      )}
    </div>
  )
}

function FolderGhost({
  folder,
  iconImageSize,
  slotWidth,
  slotHeight,
  gridGap,
}: {
  folder: FolderItem
  iconImageSize: number
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
  const isSquare = folder.size === '2x2' || folder.size === '1x1'
  const shapeWidth = isSquare ? Math.min(bodyWidth, bodyHeight) : bodyWidth
  const shapeHeight = isSquare ? shapeWidth : bodyHeight
  const panelBase = Math.max(32, Math.min(shapeWidth, shapeHeight))
  const innerPadding = Math.min(
    GHOST_FOLDER_INNER_PADDING,
    Math.max(4, Math.floor(panelBase / 8))
  )
  const innerGap = Math.min(GHOST_FOLDER_INNER_GAP, Math.max(4, Math.floor(panelBase / 16)))

  if (folder.size === '1x1') {
    const previewSize = Math.max(24, Math.min(iconImageSize, shapeWidth - innerPadding * 2))
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: `${bodyWidth}px`, height: `${bodyHeight}px` }}
      >
        <div
          className={`${GHOST_FOLDER_SURFACE_CLASS} flex items-center justify-center`}
          style={{ width: `${shapeWidth}px`, height: `${shapeHeight}px` }}
        >
          <FolderIconVisual
            icons={folder.children.map(child => child.icon)}
            imgSize={previewSize}
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
        style={{ width: `${shapeWidth}px`, height: `${shapeHeight}px` }}
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
  folderDropFlight,
  reorderAnimationMs,
  folderPreviewEasing,
}: DragOverlaysProps) {
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
                  iconImageSize={iconImageSize}
                  slotWidth={slotWidth}
                  slotHeight={slotHeight}
                  gridGap={gridGap}
                />
              )}
          </div>
        </div>
      ) : null}

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
