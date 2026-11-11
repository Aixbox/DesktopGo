import { AppWindow } from 'lucide-react'
import { motion } from 'framer-motion'
import type { FolderItem, IconItem } from '../model'
import {
  FOLDER_PREVIEW_ICON_FALLBACK_SCALE,
  FOLDER_PREVIEW_ICON_SCALE,
  getFolderPreviewArtworkSize,
} from '../domain/folderPreviewMetrics'
import {
  getFolderTilePreviewGeometry,
  type FolderTilePreviewSlot,
} from './folderTilePreviewGeometry'
import { FOLDER_RESIZE_REDUCED_TRANSITION, FOLDER_RESIZE_TRANSITION } from './folderResizeMotion'
import type { DesktopFolderTileMetrics } from './folderVisualPolicy'
import { ICON_GRID_TILE_PADDING_Y } from '../../../types'

interface FolderTilePreviewProps {
  folder: FolderItem
  metrics: DesktopFolderTileMetrics
  rtl: boolean
  selectionMode: boolean
  reducedMotion: boolean
  onOpenFolder: (id: string) => void
  onLaunchIcon: (path: string) => void
}

function PreviewArtwork({
  child,
  slot,
  reducedMotion,
}: {
  child: IconItem
  slot: FolderTilePreviewSlot
  reducedMotion: boolean
}) {
  const image = child.icon.icon_base64
  const artworkSize = getFolderPreviewArtworkSize(
    slot.size,
    image ? FOLDER_PREVIEW_ICON_SCALE : FOLDER_PREVIEW_ICON_FALLBACK_SCALE,
    slot.stacked ? 5 : image ? 20 : 16
  )
  // A fixed canvas keeps scale transitions uniform as an icon enters/leaves the stack.
  return (
    <motion.span
      className="pointer-events-none absolute left-1/2 top-1/2 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center"
      initial={false}
      animate={{ scale: artworkSize / 40 }}
      style={{ transformOrigin: 'center' }}
      transition={reducedMotion ? FOLDER_RESIZE_REDUCED_TRANSITION : FOLDER_RESIZE_TRANSITION}
    >
      {image ? (
        <img
          src={image}
          alt=""
          className="launchpad-icon-artwork h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        <AppWindow className="h-full w-full text-foreground/55 dark:text-white/70" />
      )}
    </motion.span>
  )
}

export function FolderTilePreview(props: FolderTilePreviewProps) {
  const { folder, metrics, rtl, reducedMotion, selectionMode, onOpenFolder, onLaunchIcon } = props
  const { icons, holders } = getFolderTilePreviewGeometry({
    folderSize: folder.size,
    childCount: folder.children.length,
    width: metrics.shapeWidth,
    height: metrics.shapeHeight,
    panelBase: metrics.panelBase,
    rtl,
  })
  const left = (metrics.footprintWidth - metrics.shapeWidth) / 2
  const top = ICON_GRID_TILE_PADDING_Y + (metrics.bodyHeight - metrics.shapeHeight) / 2
  const transition = reducedMotion ? FOLDER_RESIZE_REDUCED_TRANSITION : FOLDER_RESIZE_TRANSITION
  const position = (slot: FolderTilePreviewSlot) => ({
    x: left + slot.left + slot.size / 2,
    y: top + slot.top + slot.size / 2,
    opacity: slot.visible ? 1 : 0,
  })
  return (
    <motion.div
      data-item-focus-part
      className="pointer-events-none absolute inset-0 z-20"
      initial={false}
      transition={transition}
    >
      {holders.map((slot, index) => (
        <motion.span
          key={`holder-${index}`}
          aria-hidden="true"
          className="absolute left-0 top-0 -ml-5 -mt-5 h-10 w-10 rounded-icon-tile bg-foreground/[0.04] dark:bg-white/[0.06]"
          initial={false}
          animate={{ ...position(slot), scale: slot.size / 40 }}
          transition={transition}
        />
      ))}
      {icons.map((slot, index) => {
        const child = folder.children[index]
        // Every expanded folder exposes direct shortcuts; compact previews only open the folder.
        const launchable = folder.size !== '1x1'
        return (
          <motion.button
            key={child.key}
            type="button"
            data-folder-preview-key={child.key}
            data-folder-preview-slot={slot.stacked ? 'stacked' : 'standard'}
            aria-hidden={!slot.visible}
            disabled={!slot.visible}
            aria-label={launchable && !slot.stacked ? child.icon.name : folder.name}
            title={launchable && !slot.stacked ? child.icon.name : folder.name}
            className="absolute left-0 top-0 border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
            style={{
              pointerEvents: slot.visible ? 'auto' : 'none',
              width: slot.size,
              height: slot.size,
              marginLeft: -slot.size / 2,
              marginTop: -slot.size / 2,
            }}
            initial={false}
            animate={position(slot)}
            transition={transition}
            onPointerDown={event => {
              // Stacked miniatures open/drag the folder; only direct app shortcuts own the press.
              if (launchable && !slot.stacked) event.stopPropagation()
            }}
            onClick={event => {
              event.stopPropagation()
              if (launchable && !selectionMode && !slot.stacked) onLaunchIcon(child.icon.path)
              else onOpenFolder(folder.id)
            }}
          >
            <PreviewArtwork child={child} slot={slot} reducedMotion={reducedMotion} />
          </motion.button>
        )
      })}
    </motion.div>
  )
}
