import type { DesktopIcon } from '../types'
import {
  getIconGridRowHeight,
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
  ICON_SIZE_CONFIG,
} from '../types'
import { useIconStore } from '../stores/iconStore'
import { AppWindow, Check } from 'lucide-react'
import type { MouseEvent as ReactMouseEvent } from 'react'

interface IconProps {
  icon: DesktopIcon
  selectionKey: string
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (key: string) => void
}

export function Icon({ icon, selectionKey, selectionMode, selected, onToggleSelect }: IconProps) {
  const { launchApp, iconSize, titleLineCount, showShellContextMenu } = useIconStore()
  const config = ICON_SIZE_CONFIG[iconSize]
  const tileHeight = getIconGridRowHeight(iconSize)
  const isSingleLineTitle = titleLineCount === 'one'

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect(selectionKey)
      return
    }

    launchApp(icon.path)
  }

  const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (selectionMode) {
      return
    }

    void showShellContextMenu(icon)
  }

  const buttonStateClass = selectionMode
    ? 'bg-transparent'
    : 'bg-transparent hover:bg-foreground/6 active:bg-foreground/10 dark:hover:bg-white/10 dark:active:bg-white/20'
  const layerClass = selectionMode ? (selected ? 'z-30' : 'z-10') : 'z-10 hover:z-20'
  const imageMotionClass = selectionMode ? '' : 'group-hover:scale-105 group-active:scale-95'

  return (
    <button
      data-icon
      data-selection-mode={selectionMode ? 'on' : 'off'}
      className={`icon-item relative flex flex-col items-center justify-start rounded-2xl border-none px-3 shadow-none transition-all duration-200 cursor-pointer group ${buttonStateClass} ${layerClass}`}
      style={{
        width: config.containerWidth,
        height: tileHeight,
        paddingTop: ICON_GRID_TILE_PADDING_Y,
        paddingBottom: ICON_GRID_TILE_PADDING_Y,
        rowGap: ICON_GRID_TITLE_GAP,
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={icon.name}
      aria-pressed={selectionMode ? selected : undefined}
    >
      {selectionMode ? (
        <span
          className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
            selected
              ? 'border-blue-500 bg-blue-500 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
              : 'border-border/70 bg-background/72 text-transparent shadow-sm dark:border-white/60 dark:bg-black/30'
          }`}
        >
          {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </span>
      ) : null}

      <div
        className={`icon-image flex flex-1 items-center justify-center overflow-hidden transition-all duration-200 ${imageMotionClass}`}
        style={{ width: config.imgSize, height: config.imgSize }}
      >
        {icon.icon_base64 ? (
          <img
            src={icon.icon_base64}
            alt={icon.name}
            style={{ width: config.imgSize, height: config.imgSize }}
            className="object-contain"
            draggable={false}
          />
        ) : (
          <AppWindow className="w-8 h-8 text-foreground/60" />
        )}
      </div>
      <span
        className="icon-label text-[11px] text-center leading-[13px] text-foreground drop-shadow-md"
        style={{
          maxWidth: config.containerWidth - 10,
          height: isSingleLineTitle ? 13 : 26,
          display: isSingleLineTitle ? 'block' : '-webkit-box',
          WebkitLineClamp: isSingleLineTitle ? 1 : 2,
          WebkitBoxOrient: isSingleLineTitle ? undefined : 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: isSingleLineTitle ? 'nowrap' : 'normal',
          overflowWrap: 'anywhere',
        }}
      >
        {icon.name}
      </span>
    </button>
  )
}
