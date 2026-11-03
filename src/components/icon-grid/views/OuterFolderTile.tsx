import { Ungroup } from 'lucide-react'
import {
  memo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { translate } from '../../../lib/i18n'
import { useIconStore } from '../../../stores/iconStore'
import { MenuItem, MenuSeparator } from '../../ui/menu'
import { FocusedItemMenu } from '../../icons/FocusedItemMenu'
import { getGridItemSpan, type FolderItem, type FolderSize, type GridSpan } from '../model'
import { getDesktopFolderTileMetrics } from './folderVisualPolicy'
import { GridItemSizeMenu } from './GridItemSizeMenu'
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

const MENU_OPEN_LABEL = '打开文件夹'
const MENU_DISSOLVE_LABEL = '解散文件夹'

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
    <FocusedItemMenu
      width={176}
      label={folder.name}
      disabled={folderPreview || folderOpen}
      trigger={
        <div
          data-icon
          tabIndex={-1}
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
      }
    >
      <MenuItem
        className="px-3 py-2 text-foreground/85 focus:bg-accent focus:text-foreground"
        onSelect={() => {
          onOpenFolder(folder.id)
        }}
      >
        {translate(MENU_OPEN_LABEL)}
      </MenuItem>
      <MenuItem
        className="gap-2 px-3 py-2 text-red-700 focus:bg-red-500/12 focus:text-red-800 dark:text-red-200 dark:focus:bg-red-500/25 dark:focus:text-red-100"
        onSelect={() => {
          onDissolveFolder(folder.id)
        }}
      >
        <Ungroup className="h-4 w-4" aria-hidden="true" />
        <span>{translate(MENU_DISSOLVE_LABEL)}</span>
      </MenuItem>
      <MenuSeparator className="mx-1 my-1 bg-border/70" />
      <GridItemSizeMenu
        label={translate('文件夹大小')}
        size={folder.size}
        onResize={size => onResizeFolder(folder.id, size)}
      />
    </FocusedItemMenu>
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
