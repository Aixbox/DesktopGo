import type { DesktopIcon } from '../types'
import {
  getIconGridRowHeight,
  getIconGridTitleMetrics,
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
  ICON_SIZE_CONFIG,
} from '../types'
import { useIconStore } from '../stores/iconStore'
import { IconContextMenu } from './icons/IconContextMenu'
import { IconResizeHandle } from './icon-grid/views/IconResizeHandle'
import { IconArtwork } from './icon-grid/views/IconArtwork'
import { scaledRadius } from './icon-grid/views/folderVisualPolicy'
import {
  ENLARGED_ICON_SURFACE_CLASS,
  getIconForegroundSize,
  ICON_TILE_RESIZE_TRANSITION,
  type IconGridTileConfig,
} from './icon-grid/views/iconTileMetrics'
import { useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import {
  memo,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

interface IconProps {
  gridTile?: IconGridTileConfig
  icon: DesktopIcon
  selectionKey: string
  selectionMode: boolean
  selected: boolean
  onToggleSelect: (key: string) => void
  onActivate?: (icon: DesktopIcon) => void
  highlighted?: boolean
  motionProfile?: 'default' | 'scroll'
}

export const Icon = memo(function Icon({
  gridTile,
  icon,
  selectionKey,
  selectionMode,
  selected,
  onToggleSelect,
  onActivate,
  highlighted = false,
  motionProfile = 'default',
}: IconProps) {
  const launchApp = useIconStore(state => state.launchApp)
  const iconSize = useIconStore(state => state.iconSize)
  const titleLineCount = useIconStore(state => state.titleLineCount)
  const customName = useIconStore(state => state.customNames[icon.path])
  const setCustomName = useIconStore(state => state.setCustomName)
  const clearCustomName = useIconStore(state => state.clearCustomName)
  const renameTriggerPath = useIconStore(state => state.renameTriggerPath)
  const clearRenameTrigger = useIconStore(state => state.clearRenameTrigger)
  const config = ICON_SIZE_CONFIG[iconSize]
  const tileHeight = getIconGridRowHeight(iconSize)
  const isSingleLineTitle = titleLineCount === 'one'
  const titleMetrics = getIconGridTitleMetrics(titleLineCount)
  const displayName = customName ?? icon.name
  const reducedMotion = useReducedMotion() ?? false
  const metrics = gridTile?.metrics
  const width = metrics?.footprintWidth ?? config.containerWidth
  const height = metrics?.footprintHeight ?? tileHeight
  const resizeTransition = reducedMotion ? 'none' : ICON_TILE_RESIZE_TRANSITION
  const enlarged = !!gridTile && (gridTile.span.cols > 1 || gridTile.span.rows > 1)
  const foregroundSize = gridTile
    ? getIconForegroundSize(gridTile.span, gridTile.metrics.shapeWidth)
    : config.imgSize

  const [isRenaming, setIsRenaming] = useState(false)
  const [draftName, setDraftName] = useState(displayName)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renameTriggerPath && renameTriggerPath === icon.path) {
      // An external context-menu request intentionally opens this local editor.
      setDraftName(displayName)
      setIsRenaming(true)
      clearRenameTrigger()
    }
  }, [renameTriggerPath, icon.path, displayName, clearRenameTrigger])

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const handleClick = () => {
    if (isRenaming) return
    if (selectionMode) {
      onToggleSelect(selectionKey)
      return
    }

    if (onActivate) {
      onActivate(icon)
      return
    }

    void launchApp(icon.path)
  }

  const commitRename = () => {
    if (!isRenaming) return
    const trimmed = draftName.trim()
    if (trimmed.length === 0 || trimmed === icon.name) {
      clearCustomName(icon.path)
    } else if (trimmed !== displayName) {
      setCustomName(icon.path, trimmed)
    }
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setIsRenaming(false)
    setDraftName(displayName)
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftName(event.target.value)
  }

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      commitRename()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelRename()
    }
  }

  const buttonStateClass = selectionMode
    ? 'bg-transparent'
    : 'bg-transparent hover:bg-foreground/6 active:bg-foreground/10 dark:hover:bg-white/10 dark:active:bg-white/20'
  const layerClass = selectionMode ? (selected ? 'z-30' : 'z-10') : 'z-10 hover:z-20'
  const usesScrollMotion = motionProfile === 'scroll'
  const imageMotionClass =
    selectionMode || isRenaming || enlarged
      ? ''
      : usesScrollMotion
        ? 'scroll-grid-icon-surface'
        : 'launchpad-icon-motion'

  return (
    <IconContextMenu icon={icon} disabled={isRenaming}>
      <div data-icon tabIndex={-1} className="relative overflow-visible" style={{ width, height }}>
        <button
          data-icon
          data-selection-key={selectionKey}
          data-selection-mode={selectionMode ? 'on' : 'off'}
          className={`icon-item relative flex flex-col items-center justify-start rounded-icon-tile border-none px-3 shadow-none cursor-pointer group ${
            usesScrollMotion ? 'scroll-grid-icon-tile' : 'transition-all duration-200'
          } ${buttonStateClass} ${layerClass} ${
            highlighted ? 'launchpad-import-highlight-edge' : ''
          }`}
          style={{
            width,
            height,
            paddingTop: ICON_GRID_TILE_PADDING_Y,
            paddingBottom: ICON_GRID_TILE_PADDING_Y,
            rowGap: ICON_GRID_TITLE_GAP,
            ...(metrics ? { transition: resizeTransition } : {}),
          }}
          onClick={handleClick}
          title={displayName}
          aria-label={displayName}
          aria-pressed={selectionMode ? selected : undefined}
        >
          {selectionMode ? (
            <span
              className={`absolute right-0.5 top-0.5 z-50 flex h-4 w-4 items-center justify-center rounded-full border text-xs ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/70 bg-background/72 text-transparent shadow-sm dark:border-white/60 dark:bg-black/30'
              }`}
            >
              {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
          ) : null}

          <div
            className={`icon-image flex flex-1 items-center justify-center overflow-hidden ${
              usesScrollMotion ? '' : 'transition-all duration-200'
            } ${imageMotionClass} ${enlarged ? ENLARGED_ICON_SURFACE_CLASS : ''}`}
            style={
              metrics
                ? {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: metrics.shapeWidth,
                    height: metrics.shapeHeight,
                    translate: `${(metrics.footprintWidth - metrics.shapeWidth) / 2}px ${ICON_GRID_TILE_PADDING_Y + (metrics.bodyHeight - metrics.shapeHeight) / 2}px`,
                    borderRadius: scaledRadius(metrics.surfaceRadius),
                    transition: resizeTransition,
                  }
                : { width: config.imgSize, height: config.imgSize }
            }
          >
            <IconArtwork
              icon={icon}
              name={displayName}
              enlarged={enlarged}
              imageSize={foregroundSize}
              fallbackSize={
                metrics
                  ? (foregroundSize ?? Math.min(metrics.shapeWidth, metrics.shapeHeight) * 0.7)
                  : 32
              }
            />
          </div>
          {isRenaming ? (
            <input
              ref={inputRef}
              type="text"
              value={draftName}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onBlur={commitRename}
              onClick={event => event.stopPropagation()}
              onPointerDown={event => event.stopPropagation()}
              onContextMenu={event => event.stopPropagation()}
              className="icon-label-input rounded-md border border-border/60 bg-background/95 px-1 py-[1px] text-[11px] leading-[13px] text-center text-foreground shadow-sm outline-none focus:border-ring dark:border-white/30 dark:bg-black/60"
              style={{
                maxWidth: width - 4,
                width: width - 4,
                height: isSingleLineTitle ? 15 : 28,
                ...(metrics
                  ? ({
                      position: 'absolute',
                      left: 2,
                      top: ICON_GRID_TILE_PADDING_Y + metrics.bodyHeight + ICON_GRID_TITLE_GAP,
                    } as const)
                  : {}),
              }}
              maxLength={64}
            />
          ) : (
            <span
              className="icon-label text-[11px] text-center leading-[15px] text-foreground drop-shadow-md"
              style={{
                // 标题不受磁贴左右 padding 限制，和 hover 背景保持同宽。
                width,
                maxWidth: width,
                marginInline: metrics ? 0 : -12,
                flexShrink: 0,
                height: titleMetrics.height,
                display: isSingleLineTitle ? 'block' : '-webkit-box',
                WebkitLineClamp: titleMetrics.lineClamp,
                WebkitBoxOrient: isSingleLineTitle ? undefined : 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: isSingleLineTitle ? 'nowrap' : 'normal',
                overflowWrap: 'anywhere',
                ...(metrics
                  ? ({
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      transform: `translateY(${ICON_GRID_TILE_PADDING_Y + metrics.bodyHeight + ICON_GRID_TITLE_GAP}px)`,
                      transition: resizeTransition,
                    } as const)
                  : {}),
              }}
            >
              {displayName}
            </span>
          )}
        </button>
        {gridTile && !isRenaming ? <IconResizeHandle tile={gridTile} /> : null}
      </div>
    </IconContextMenu>
  )
})
