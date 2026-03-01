import { AppWindow } from 'lucide-react'
import type { DesktopIcon } from '../../../types'

export const FOLDER_PREVIEW_PADDING = 4
export const FOLDER_PREVIEW_GAP = 2
export const FOLDER_PREVIEW_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const FOLDER_PREVIEW_TOP_OFFSET = 12
export const FOLDER_MODAL_MAX_WIDTH = 620
export const FOLDER_MODAL_MAX_HEIGHT = 480
const FOLDER_SURFACE_CLASS =
  'relative h-full w-full overflow-hidden rounded-xl bg-[linear-gradient(145deg,rgba(20,31,52,0.92),rgba(8,12,22,0.9))] shadow-[0_12px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-md'

export const getFolderPreviewSlotSize = (imgSize: number): number =>
  Math.max(8, Math.floor((imgSize - FOLDER_PREVIEW_PADDING * 2 - FOLDER_PREVIEW_GAP) / 2))

interface FolderCreatePreviewProps {
  active: boolean
  icon: DesktopIcon
  imgSize: number
  reorderAnimationMs: number
}

export function FolderCreatePreview({
  active,
  icon,
  imgSize,
  reorderAnimationMs,
}: FolderCreatePreviewProps) {
  const slotSize = getFolderPreviewSlotSize(imgSize)
  const startSize = Math.max(slotSize, Math.floor(imgSize * 0.84))
  const startOffset = (imgSize - startSize) / 2

  const itemStyle = {
    width: `${active ? slotSize : startSize}px`,
    height: `${active ? slotSize : startSize}px`,
    transform: `translate3d(${active ? FOLDER_PREVIEW_PADDING : startOffset}px, ${active ? FOLDER_PREVIEW_PADDING : startOffset}px, 0)`,
    opacity: active ? 1 : 0,
    transition: `transform ${reorderAnimationMs}ms ${FOLDER_PREVIEW_EASING}, width ${reorderAnimationMs}ms ${FOLDER_PREVIEW_EASING}, height ${reorderAnimationMs}ms ${FOLDER_PREVIEW_EASING}, opacity 140ms ease-out`,
  } as const

  const frameStyle = {
    width: `${imgSize}px`,
    height: `${imgSize}px`,
  } as const

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2"
      style={frameStyle}
      aria-hidden="true"
    >
      <div
        className={`${FOLDER_SURFACE_CLASS} transition-all duration-200 ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
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
}

export function FolderIconVisual({ icons, imgSize }: FolderIconVisualProps) {
  const slotSize = getFolderPreviewSlotSize(imgSize)
  const frameStyle = {
    width: `${imgSize}px`,
    height: `${imgSize}px`,
  } as const

  return (
    <div className="relative" style={frameStyle} aria-hidden="true" data-folder-icon-visual>
      <div className={FOLDER_SURFACE_CLASS}>
        {icons.slice(0, 4).map((icon, idx) => {
          const row = Math.floor(idx / 2)
          const col = idx % 2
          const left = FOLDER_PREVIEW_PADDING + col * (slotSize + FOLDER_PREVIEW_GAP)
          const top = FOLDER_PREVIEW_PADDING + row * (slotSize + FOLDER_PREVIEW_GAP)
          return (
            <div
              key={`${icon.id}-${idx}`}
              className="absolute overflow-hidden rounded-[5px]"
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
