import { AppWindow } from 'lucide-react'
import type { GridItem } from '../model'
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
  folderDropFlight: FolderDropFlight | null
  reorderAnimationMs: number
  folderPreviewEasing: string
}

export function DragOverlays({
  dragPointer,
  ghostItem,
  iconImageSize,
  folderDropFlight,
  reorderAnimationMs,
  folderPreviewEasing,
}: DragOverlaysProps) {
  return (
    <>
      {dragPointer && ghostItem ? (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            width: iconImageSize,
            height: iconImageSize,
            left: dragPointer.pointerX - iconImageSize / 2,
            top: dragPointer.pointerY - iconImageSize / 2,
          }}
        >
          <div className="flex items-center justify-center" style={{ width: iconImageSize, height: iconImageSize }}>
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
              <FolderIconVisual
                icons={ghostItem.children.map(child => child.icon)}
                imgSize={iconImageSize}
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
