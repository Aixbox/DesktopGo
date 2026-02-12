import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { DesktopIcon } from '../types'
import { ICON_SIZE_CONFIG } from '../types'
import { useIconStore } from '../stores/iconStore'
import { AppWindow, Check } from 'lucide-react'

interface IconProps {
  icon: DesktopIcon
  selectionKey: string
  selectionMode: boolean
  selected: boolean
  onEnterSelectionMode: (key: string) => void
  onToggleSelect: (key: string) => void
}

const LONG_PRESS_MS = 420

export function Icon({
  icon,
  selectionKey,
  selectionMode,
  selected,
  onEnterSelectionMode,
  onToggleSelect,
}: IconProps) {
  const { launchApp, iconSize, titleLineCount } = useIconStore()
  const config = ICON_SIZE_CONFIG[iconSize]
  const isSingleLineTitle = titleLineCount === 'one'
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearLongPressTimer()
    }
  }, [])

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (selectionMode || e.button !== 0) return
    longPressTriggeredRef.current = false
    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true
      onEnterSelectionMode(selectionKey)
    }, LONG_PRESS_MS)
  }

  const handlePointerUp = () => {
    clearLongPressTimer()
  }

  const handlePointerCancel = () => {
    clearLongPressTimer()
  }

  const handlePointerLeave = () => {
    clearLongPressTimer()
  }

  const handleClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }

    if (selectionMode) {
      onToggleSelect(selectionKey)
      return
    }

    launchApp(icon.path)
  }

  const buttonStateClass = selectionMode
    ? selected
      ? 'bg-blue-500/20 ring-1 ring-blue-500/70'
      : 'bg-black/10 dark:bg-white/5'
    : 'bg-transparent hover:bg-black/10 active:bg-black/20 dark:hover:bg-white/10 dark:active:bg-white/20'
  const layerClass = selectionMode
    ? selected
      ? 'z-30'
      : 'z-10'
    : 'z-10 hover:z-20'
  const imageMotionClass = selectionMode ? '' : 'group-hover:scale-105 group-active:scale-95'

  return (
    <button
      data-icon
      data-selection-mode={selectionMode ? 'on' : 'off'}
      className={`icon-item relative flex flex-col items-center gap-2 rounded-2xl border-none p-3 shadow-none transition-all duration-200 cursor-pointer group ${buttonStateClass} ${layerClass}`}
      style={{ width: config.containerWidth }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      title={icon.name}
      aria-pressed={selectionMode ? selected : undefined}
    >
      {selectionMode ? (
        <span
          className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
            selected
              ? 'border-blue-500 bg-blue-500 text-white'
              : 'border-white/60 bg-black/30 text-transparent'
          }`}
        >
          {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </span>
      ) : null}

      <div
        className={`icon-image flex items-center justify-center overflow-hidden transition-all duration-200 ${imageMotionClass}`}
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
        className={`icon-label text-[11px] text-center leading-tight drop-shadow-md ${
          selectionMode && selected ? 'text-blue-200' : 'text-foreground'
        }`}
        style={{
          maxWidth: config.containerWidth - 10,
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
