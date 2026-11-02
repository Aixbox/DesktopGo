import { Ungroup } from 'lucide-react'
import {
  memo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { translate } from '../../../lib/i18n'
import { useIconStore } from '../../../stores/iconStore'
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
import { getGridItemSpan, type FolderItem, type FolderSize, type GridSpan } from '../model'
import { getDesktopFolderTileMetrics, scaledRadius } from './folderVisualPolicy'
import { FolderTileContents } from './FolderTileContents'
import { useDocumentDirection } from '../hooks/useDocumentDirection'

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
  resizePreviewSize?: FolderSize | null
  onPreviewFolderResize?: (folderId: string, size: FolderSize) => void
  onCancelFolderResize?: () => void
  onDissolveFolder: (folderId: string) => void
}

const FOLDER_SIZES: Array<{ value: FolderSize; label: string; span: GridSpan }> = [
  { value: '1x1', label: '1x1', span: { cols: 1, rows: 1 } },
  { value: '1x2', label: '1x2', span: { cols: 1, rows: 2 } },
  { value: '2x1', label: '2x1', span: { cols: 2, rows: 1 } },
  { value: '2x2', label: '2x2', span: { cols: 2, rows: 2 } },
]
const MENU_OPEN_LABEL = '打开文件夹'
const MENU_SIZE_LABEL = '文件夹大小'
const MENU_DISSOLVE_LABEL = '解散文件夹'

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
          borderRadius: scaledRadius(shellRadius),
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
              style={{ borderRadius: scaledRadius(slotRadius) }}
            />
          ))}
        </span>
      </span>
    </span>
  )
}

function OuterFolderTileComponent({
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
  resizePreviewSize = null,
  onPreviewFolderResize,
  onCancelFolderResize,
  onDissolveFolder,
}: OuterFolderTileProps) {
  const titleLineCount = useIconStore(state => state.titleLineCount)
  const direction = useDocumentDirection()
  const effectiveSize = resizePreviewSize ?? folder.size
  const effectiveFolder = resizePreviewSize ? { ...folder, size: resizePreviewSize } : folder
  const effectiveSpan = resizePreviewSize ? getGridItemSpan(effectiveFolder) : span
  const metrics = getDesktopFolderTileMetrics({
    span: effectiveSpan,
    slotWidth,
    slotHeight,
    gridGap,
    folderSize: effectiveSize,
    titleLineCount,
    surfaceTitleLineCount: 'two',
  })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-icon
          className="relative h-full w-full touch-none overflow-visible"
          onPointerDown={onPointerDown}
          onClickCapture={onClickCapture}
        >
          <FolderTileContents
            folder={effectiveFolder}
            metrics={metrics}
            span={effectiveSpan}
            slotWidth={slotWidth}
            slotHeight={slotHeight}
            gridGap={gridGap}
            titleLineCount={titleLineCount}
            folderPreview={folderPreview}
            folderOpen={folderOpen}
            sharedLayoutActive={sharedLayoutActive}
            selectionMode={selectionMode}
            rtl={direction === 'rtl'}
            onOpenFolder={onOpenFolder}
            onLaunchIcon={onLaunchIcon}
            // folder can already be the preview item; the controller owns the committed size.
            onCommit={nextSize => onResizeFolder(folder.id, nextSize)}
            onPreview={nextSize => onPreviewFolderResize?.(folder.id, nextSize)}
            onCancel={() => onCancelFolderResize?.()}
          />
        </div>
      </ContextMenuTrigger>

      {!selectionMode ? (
        <ContextMenuContent className="w-44 p-1.5 shadow-xl backdrop-blur-xl">
          <ContextMenuItem
            className="px-3 py-2 text-foreground/85 focus:bg-accent focus:text-foreground"
            onSelect={() => {
              onOpenFolder(folder.id)
            }}
          >
            {translate(MENU_OPEN_LABEL)}
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2 px-3 py-2 text-red-700 focus:bg-red-500/12 focus:text-red-800 dark:text-red-200 dark:focus:bg-red-500/25 dark:focus:text-red-100"
            onSelect={() => {
              onDissolveFolder(folder.id)
            }}
          >
            <Ungroup className="h-4 w-4" aria-hidden="true" />
            <span>{translate(MENU_DISSOLVE_LABEL)}</span>
          </ContextMenuItem>
          <ContextMenuSeparator className="mx-1 my-1 bg-border/70" />
          <ContextMenuLabel className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {translate(MENU_SIZE_LABEL)}
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
                className="px-3 py-1.5 text-foreground/85 focus:bg-accent focus:text-foreground data-[state=checked]:bg-accent/80 data-[state=checked]:text-foreground"
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

export const OuterFolderTile = memo(
  OuterFolderTileComponent,
  (previous, next) =>
    previous.folder === next.folder &&
    previous.span.cols === next.span.cols &&
    previous.span.rows === next.span.rows &&
    previous.slotWidth === next.slotWidth &&
    previous.slotHeight === next.slotHeight &&
    previous.gridGap === next.gridGap &&
    previous.folderPreview === next.folderPreview &&
    previous.folderOpen === next.folderOpen &&
    previous.sharedLayoutActive === next.sharedLayoutActive &&
    previous.selectionMode === next.selectionMode &&
    previous.onPointerDown === next.onPointerDown &&
    previous.onClickCapture === next.onClickCapture &&
    previous.onOpenFolder === next.onOpenFolder &&
    previous.onLaunchIcon === next.onLaunchIcon &&
    previous.onResizeFolder === next.onResizeFolder &&
    previous.resizePreviewSize === next.resizePreviewSize &&
    previous.onPreviewFolderResize === next.onPreviewFolderResize &&
    previous.onCancelFolderResize === next.onCancelFolderResize &&
    previous.onDissolveFolder === next.onDissolveFolder
)
