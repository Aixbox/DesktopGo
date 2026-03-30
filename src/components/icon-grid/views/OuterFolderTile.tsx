import { AppWindow } from 'lucide-react'
import { motion } from 'framer-motion'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
  ICON_GRID_TITLE_HEIGHT,
} from '../../../types'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../ui/context-menu'
import type { FolderItem, FolderSize, GridSpan } from '../model'
import {
  DESKTOP_FOLDER_SURFACE_CLASS,
  FOLDER_SHARED_LAYOUT_TRANSITION,
  FolderIconVisual,
  getFolderSharedLayoutId,
} from './FolderVisuals'

interface OuterFolderTileProps {
  folder: FolderItem
  span: GridSpan
  slotWidth: number
  slotHeight: number
  gridGap: number
  folderPreview: boolean
  folderOpen: boolean
  sharedLayoutActive: boolean
  selectionMode: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onOpenFolder: (folderId: string) => void
  onLaunchIcon: (path: string) => void
  onResizeFolder: (folderId: string, size: FolderSize) => void
}

const FOLDER_SIZES: Array<{ value: FolderSize; label: string; span: GridSpan }> = [
  { value: '1x1', label: '1x1', span: { cols: 1, rows: 1 } },
  { value: '1x2', label: '1x2', span: { cols: 1, rows: 2 } },
  { value: '2x1', label: '2x1', span: { cols: 2, rows: 1 } },
  { value: '2x2', label: '2x2', span: { cols: 2, rows: 2 } },
]
const MENU_OPEN_LABEL = 'Open Folder'
const MENU_SIZE_LABEL = 'Folder Size'

const TITLE_HEIGHT = ICON_GRID_TITLE_HEIGHT
const TILE_PADDING = ICON_GRID_TILE_PADDING_Y
const BODY_TITLE_GAP = ICON_GRID_TITLE_GAP
const INNER_PADDING = 8
const INNER_GAP = 6
const PREVIEW_ICON_SCALE = 0.84
const PREVIEW_ICON_FALLBACK_SCALE = 0.68

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const getFolderSurfaceRadius = (panelBase: number) =>
  Math.round(clampNumber(panelBase * 0.2, 16, 24))

const getSingleSlotPreviewInset = (panelBase: number) =>
  Math.round(clampNumber(panelBase * 0.06, 3, 5))

interface FolderSizePreviewProps {
  span: GridSpan
  active: boolean
}

function FolderSizePreview({ span, active }: FolderSizePreviewProps) {
  const unitSize = 9
  const slotGap = 3
  const shellPadding = 3
  const shellWidth = span.cols * unitSize + Math.max(0, span.cols - 1) * slotGap + shellPadding * 2
  const shellHeight = span.rows * unitSize + Math.max(0, span.rows - 1) * slotGap + shellPadding * 2
  const shellRadius = Math.max(5, Math.floor(Math.min(shellWidth, shellHeight) * 0.2))
  const slotRadius = Math.max(2, Math.floor(unitSize * 0.22))

  return (
    <span className="flex h-8 w-12 shrink-0 items-center justify-center" aria-hidden="true">
      <span
        className={`relative overflow-hidden border shadow-[0_6px_14px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.32)] transition ${
          active
            ? 'border-border/60 bg-background/62 shadow-[0_6px_14px_rgba(15,23,42,0.12)] ring-1 ring-foreground/[0.05] dark:border-white/24 dark:bg-white/12 dark:shadow-[0_6px_14px_rgba(0,0,0,0.16)] dark:ring-white/[0.08]'
            : 'border-border/45 bg-background/42 shadow-[0_4px_12px_rgba(15,23,42,0.1)] ring-1 ring-foreground/[0.03] dark:border-white/16 dark:bg-white/[0.04] dark:shadow-[0_4px_12px_rgba(0,0,0,0.12)] dark:ring-white/[0.05]'
        }`}
        style={{
          width: `${shellWidth}px`,
          height: `${shellHeight}px`,
          borderRadius: `${shellRadius}px`,
        }}
      >
        <span
          className="absolute inset-0 grid"
          style={{
            padding: `${shellPadding}px`,
            gap: `${slotGap}px`,
            gridTemplateColumns: `repeat(${span.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${span.rows}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: span.cols * span.rows }, (_, index) => (
            <span
              key={index}
              className={`border transition ${
                active
                  ? 'border-border/40 bg-background/72 dark:border-white/18 dark:bg-white/14'
                  : 'border-border/30 bg-background/50 dark:border-white/10 dark:bg-white/[0.05]'
              }`}
              style={{ borderRadius: `${slotRadius}px` }}
            />
          ))}
        </span>
      </span>
    </span>
  )
}

interface PreviewIconButtonProps {
  path: string
  name: string
  iconBase64: string
  size: number
  selectionMode: boolean
  onOpenFolder: () => void
  onLaunchIcon: (path: string) => void
}

function PreviewIconButton({
  path,
  name,
  iconBase64,
  size,
  selectionMode,
  onOpenFolder,
  onLaunchIcon,
}: PreviewIconButtonProps) {
  return (
    <button
      type="button"
      className={`group flex items-center justify-center rounded-2xl transition ${
        selectionMode ? 'cursor-pointer' : 'cursor-pointer active:scale-[0.97]'
      }`}
      style={{ width: `${size}px`, height: `${size}px` }}
      title={name}
      onPointerDown={event => {
        event.stopPropagation()
      }}
      onClick={event => {
        event.stopPropagation()
        if (selectionMode) {
          onOpenFolder()
          return
        }
        onLaunchIcon(path)
      }}
    >
      {iconBase64 ? (
        <img
          src={iconBase64}
          alt={name}
          className="object-contain transition-transform group-hover:scale-[1.04]"
          style={{
            width: `${Math.max(20, Math.floor(size * PREVIEW_ICON_SCALE))}px`,
            height: `${Math.max(20, Math.floor(size * PREVIEW_ICON_SCALE))}px`,
          }}
          draggable={false}
        />
      ) : (
        <AppWindow
          className="text-foreground/55 dark:text-white/70"
          style={{
            width: `${Math.max(16, Math.floor(size * PREVIEW_ICON_FALLBACK_SCALE))}px`,
            height: `${Math.max(16, Math.floor(size * PREVIEW_ICON_FALLBACK_SCALE))}px`,
          }}
        />
      )}
    </button>
  )
}

interface FolderBodyProps {
  folder: FolderItem
  bodyWidth: number
  bodyHeight: number
  singleSlotBodyExtent: number
  folderPreview: boolean
  folderOpen: boolean
  sharedLayoutActive: boolean
  selectionMode: boolean
  onOpenFolder: (folderId: string) => void
  onLaunchIcon: (path: string) => void
}

function FolderBody({
  folder,
  bodyWidth,
  bodyHeight,
  singleSlotBodyExtent,
  folderPreview,
  folderOpen,
  sharedLayoutActive,
  selectionMode,
  onOpenFolder,
  onLaunchIcon,
}: FolderBodyProps) {
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
  const surfaceRadius = getFolderSurfaceRadius(panelBase)
  const innerPadding = Math.min(INNER_PADDING, Math.max(4, Math.floor(panelBase / 8)))
  const innerGap = Math.min(INNER_GAP, Math.max(4, Math.floor(panelBase / 16)))
  const highlightSurface = folderPreview || folderOpen

  if (folder.size === '1x1') {
    const previewInset = getSingleSlotPreviewInset(panelBase)
    const previewSize = Math.max(24, shapeWidth - previewInset * 2)

    return (
      <div
        className="relative flex cursor-pointer items-center justify-center transition"
        style={{
          width: `${bodyWidth}px`,
          height: `${bodyHeight}px`,
          borderRadius: `${surfaceRadius}px`,
        }}
        title={folder.name}
        onClick={event => {
          event.stopPropagation()
          onOpenFolder(folder.id)
        }}
      >
        <motion.div
          layoutId={sharedLayoutActive ? getFolderSharedLayoutId(folder.id) : undefined}
          transition={FOLDER_SHARED_LAYOUT_TRANSITION}
          className={`${DESKTOP_FOLDER_SURFACE_CLASS} flex items-center justify-center transition-all duration-200 ${
            highlightSurface
              ? 'border-border/70 bg-background/72 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_42px_rgba(15,23,42,0.18)] dark:border-white/40 dark:bg-black/40 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_18px_42px_rgba(0,0,0,0.34)]'
              : ''
          }`}
          data-folder-body-hitbox
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
        </motion.div>
      </div>
    )
  }

  const previewIcons =
    folder.size === '2x2' ? folder.children.slice(0, 9) : folder.children.slice(0, 3)

  const renderVertical = folder.size === '1x2'
  const renderHorizontal = folder.size === '2x1'
  const rows = folder.size === '2x2' ? 3 : renderVertical ? 3 : 1
  const cols = folder.size === '2x2' ? 3 : renderHorizontal ? 3 : 1
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
      className="relative flex cursor-pointer items-center justify-center transition"
      style={{
        width: `${bodyWidth}px`,
        height: `${bodyHeight}px`,
        borderRadius: `${surfaceRadius}px`,
      }}
      title={folder.name}
      onClick={event => {
        event.stopPropagation()
        onOpenFolder(folder.id)
      }}
    >
      <motion.div
        layoutId={sharedLayoutActive ? getFolderSharedLayoutId(folder.id) : undefined}
        transition={FOLDER_SHARED_LAYOUT_TRANSITION}
        className={`${DESKTOP_FOLDER_SURFACE_CLASS} transition-all duration-200 ${
          highlightSurface
            ? 'border-border/70 bg-background/72 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_42px_rgba(15,23,42,0.18)] dark:border-white/40 dark:bg-black/40 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_18px_42px_rgba(0,0,0,0.34)]'
            : ''
        }`}
        data-folder-body-hitbox
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
            <PreviewIconButton
              key={icon.key}
              path={icon.icon.path}
              name={icon.icon.name}
              iconBase64={icon.icon.icon_base64}
              size={iconSize}
              selectionMode={selectionMode}
              onOpenFolder={() => onOpenFolder(folder.id)}
              onLaunchIcon={onLaunchIcon}
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

export function OuterFolderTile({
  folder,
  span,
  slotWidth,
  slotHeight,
  gridGap,
  folderPreview,
  folderOpen,
  sharedLayoutActive,
  selectionMode,
  onPointerDown,
  onClickCapture,
  onOpenFolder,
  onLaunchIcon,
  onResizeFolder,
}: OuterFolderTileProps) {
  const footprintWidth = span.cols * slotWidth + Math.max(0, span.cols - 1) * gridGap
  const footprintHeight = span.rows * slotHeight + Math.max(0, span.rows - 1) * gridGap
  const bodyWidth = Math.max(40, footprintWidth - TILE_PADDING * 2)
  const bodyHeight = Math.max(
    32,
    footprintHeight - TILE_PADDING * 2 - TITLE_HEIGHT - BODY_TITLE_GAP
  )
  const singleSlotBodyExtent = Math.max(
    32,
    slotHeight - TILE_PADDING * 2 - TITLE_HEIGHT - BODY_TITLE_GAP
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-icon
          className="relative h-full w-full touch-none"
          onPointerDown={onPointerDown}
          onClickCapture={onClickCapture}
        >
          <div
            className="flex h-full w-full flex-col items-center gap-1"
            style={{ padding: `${TILE_PADDING}px 0` }}
          >
            <FolderBody
              folder={folder}
              bodyWidth={bodyWidth}
              bodyHeight={bodyHeight}
              singleSlotBodyExtent={singleSlotBodyExtent}
              folderPreview={folderPreview}
              folderOpen={folderOpen}
              sharedLayoutActive={sharedLayoutActive}
              selectionMode={selectionMode}
              onOpenFolder={onOpenFolder}
              onLaunchIcon={onLaunchIcon}
            />
            <button
              type="button"
              className="flex max-w-full items-start justify-center overflow-hidden px-2 text-center text-[11px] leading-[1.05] text-foreground transition hover:text-foreground/90"
              style={{
                width: `${Math.min(footprintWidth, bodyWidth)}px`,
                minHeight: `${TITLE_HEIGHT}px`,
              }}
              title={folder.name}
              onClick={event => {
                event.stopPropagation()
                onOpenFolder(folder.id)
              }}
            >
              <span className="block w-full truncate">{folder.name}</span>
            </button>
          </div>
        </div>
      </ContextMenuTrigger>

      {!selectionMode ? (
        <ContextMenuContent className="w-44 rounded-2xl p-1.5 shadow-2xl backdrop-blur-xl">
          <ContextMenuItem
            className="rounded-xl px-3 py-2 text-foreground/85 focus:bg-accent focus:text-foreground"
            onSelect={() => {
              onOpenFolder(folder.id)
            }}
          >
            {MENU_OPEN_LABEL}
          </ContextMenuItem>
          <ContextMenuSeparator className="mx-1 my-1 bg-border/70" />
          <ContextMenuLabel className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {MENU_SIZE_LABEL}
          </ContextMenuLabel>
          <ContextMenuRadioGroup
            value={folder.size}
            onValueChange={value => {
              onResizeFolder(folder.id, value as FolderSize)
            }}
          >
            {FOLDER_SIZES.map(option => (
              <ContextMenuRadioItem
                key={option.value}
                value={option.value}
                className="rounded-xl px-3 py-1.5 text-foreground/85 focus:bg-accent focus:text-foreground data-[state=checked]:bg-accent/80 data-[state=checked]:text-foreground"
              >
                <div className="flex items-center gap-3 pr-4">
                  <FolderSizePreview span={option.span} active={folder.size === option.value} />
                  <span className="text-sm font-medium leading-none">{option.label}</span>
                </div>
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  )
}
