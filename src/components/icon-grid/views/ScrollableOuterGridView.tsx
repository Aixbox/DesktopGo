import { AppWindow, Folder as FolderIcon, Plus, Trash2 } from 'lucide-react'
import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Icon } from '../../Icon'
import { translate } from '../../../lib/i18n'
import type { FolderSize, GridItem } from '../model'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import { FolderCreatePreview } from './FolderVisuals'
import { OuterFolderTile } from './OuterFolderTile'

interface IconConfigLike {
  imgSize: number
}

export interface ScrollGridSection {
  index: number
  entries: PageAnchorEntry[]
  itemCount: number
  previewItem: GridItem | null
}

interface ScrollableOuterGridViewProps {
  containerRef: MutableRefObject<HTMLDivElement | null>
  dockEnabled: boolean
  gridWidth: number
  columns: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  sections: ScrollGridSection[]
  activeSection: ScrollGridSection | null
  currentPage: number
  dragContext: 'outer' | 'folder' | null
  dragFolderPreviewTargetId: string | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  hiddenOuterItemIds: string[]
  highlightedOuterItemIds: string[]
  iconConfig: IconConfigLike
  selectionMode: boolean
  selectedSet: Set<string>
  openFolderId: string | null
  activeFolderSharedLayoutId: string | null
  onActivePageChange: (page: number) => void
  onAddGroup: () => void
  onDeleteGroup: (page: number) => void
  onToggleSelectIcon: (key: string) => void
  onTilePointerDown: (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => void
  onTileClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onOpenFolder: (folderId: string) => void
  onLaunchIcon: (path: string) => void
  onResizeFolder: (folderId: string, size: FolderSize) => void
  bindTileRef: (id: string, node: HTMLDivElement | null) => void
  bindGridPageRef: (page: number, node: HTMLDivElement | null) => void
  reorderAnimationMs: number
}

function GroupPreviewIcon({ item }: { item: GridItem | null }) {
  if (!item) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground/6 text-muted-foreground dark:bg-white/8">
        <AppWindow className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (item.kind === 'folder') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-200">
        <FolderIcon className="h-3.5 w-3.5" />
      </span>
    )
  }

  return (
    <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-foreground/6 dark:bg-white/8">
      {item.icon.icon_base64 ? (
        <img src={item.icon.icon_base64} alt="" className="h-5 w-5 object-contain" draggable={false} />
      ) : (
        <AppWindow className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </span>
  )
}

export function ScrollableOuterGridView({
  containerRef,
  dockEnabled,
  gridWidth,
  columns,
  itemWidth,
  itemHeight,
  gridGap,
  sections,
  activeSection,
  currentPage,
  dragContext,
  dragFolderPreviewTargetId,
  folderPreviewFreezeTargetId,
  folderCreateTransitionTargetId,
  hiddenOuterItemIds,
  highlightedOuterItemIds,
  iconConfig,
  selectionMode,
  selectedSet,
  openFolderId,
  activeFolderSharedLayoutId,
  onActivePageChange,
  onAddGroup,
  onDeleteGroup,
  onToggleSelectIcon,
  onTilePointerDown,
  onTileClickCapture,
  onOpenFolder,
  onLaunchIcon,
  onResizeFolder,
  bindTileRef,
  bindGridPageRef,
  reorderAnimationMs,
}: ScrollableOuterGridViewProps) {
  const highlightedOuterItemIdSet = useRef(new Set<string>())
  highlightedOuterItemIdSet.current = new Set(highlightedOuterItemIds)
  const entries = activeSection?.entries ?? []
  const gridRows = Math.max(
    1,
    entries.reduce((maxRow, entry) => Math.max(maxRow, entry.row + entry.span.rows), 1)
  )
  const gridHeight = gridRows * itemHeight + Math.max(0, gridRows - 1) * gridGap

  const selectSection = (index: number) => {
    onActivePageChange(index)
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="grid h-full w-full min-w-0 grid-cols-[11rem_minmax(0,1fr)] overflow-hidden">
      <aside
        data-grid-mode-nav
        data-no-window-drag="true"
        className="flex h-full min-h-0 flex-col border-r border-border/60 bg-background/28 dark:border-white/12 dark:bg-black/14"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/45 px-3 dark:border-white/10">
          <span className="truncate text-xs font-semibold text-foreground/78">
            {translate('网格分组')}
          </span>
          <button
            type="button"
            data-grid-mode-nav
            aria-label={translate('添加分组')}
            title={translate('添加分组')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
            onClick={onAddGroup}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div className="grid gap-1">
            {sections.map(section => {
              const active = currentPage === section.index
              return (
                <div
                  key={section.index}
                  data-grid-mode-nav
                  data-scroll-group-target={section.index}
                  className={`group flex min-h-11 items-center rounded-md border-l-2 transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:border-blue-300 dark:bg-blue-400/12 dark:text-blue-200'
                      : 'border-transparent text-foreground/72 hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <button
                    type="button"
                    data-grid-mode-nav
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                    onClick={() => selectSection(section.index)}
                  >
                    <GroupPreviewIcon item={section.previewItem} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">
                        {translate('网格 {index}', { index: section.index + 1 })}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {translate('{count} 项', { count: section.itemCount })}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    data-grid-mode-nav
                    aria-label={translate('删除分组')}
                    title={translate('删除分组')}
                    disabled={sections.length <= 1}
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-red-500/12 hover:text-red-600 disabled:pointer-events-none disabled:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35 dark:hover:text-red-300"
                    onClick={() => onDeleteGroup(section.index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      <div
        ref={containerRef}
        className={`min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-6 pt-24 [scrollbar-gutter:stable] ${
          dockEnabled ? 'pb-32' : 'pb-12'
        }`}
      >
        <div className="flex min-h-full justify-center">
          <div
            data-scroll-grid-page={currentPage}
            data-scroll-grid-inner={currentPage}
            ref={node => {
              bindGridPageRef(currentPage, node)
            }}
            className="relative grid max-w-full content-start"
            style={{
              width: `${gridWidth}px`,
              height: `${gridHeight}px`,
              gridTemplateColumns: `repeat(${columns}, ${itemWidth}px)`,
              gridTemplateRows: `repeat(${gridRows}, ${itemHeight}px)`,
              gap: `${gridGap}px`,
            }}
          >
            {entries.map(entry => {
              const hideItem = hiddenOuterItemIds.includes(entry.id)
              const highlightedItem = highlightedOuterItemIdSet.current.has(entry.id)
              const folderPreview =
                (dragContext === 'outer' && dragFolderPreviewTargetId === entry.id) ||
                folderPreviewFreezeTargetId === entry.id ||
                folderCreateTransitionTargetId === entry.id

              return (
                <div
                  key={entry.id}
                  ref={node => {
                    bindTileRef(entry.id, node)
                  }}
                  className="relative justify-self-center self-start"
                  style={{
                    gridColumn: `${entry.col + 1} / span ${entry.span.cols}`,
                    gridRow: `${entry.row + 1} / span ${entry.span.rows}`,
                    width: `${entry.span.cols * itemWidth + Math.max(0, entry.span.cols - 1) * gridGap}px`,
                    height: `${entry.span.rows * itemHeight + Math.max(0, entry.span.rows - 1) * gridGap}px`,
                  }}
                >
                  {entry.item.kind === 'icon' ? (
                    <div
                      className={`relative touch-none transition-opacity duration-150 ${
                        hideItem ? 'opacity-0' : 'opacity-100'
                      }`}
                      onPointerDown={event => onTilePointerDown(event, entry.id)}
                      onClickCapture={onTileClickCapture}
                    >
                      <div
                        className={`transition-opacity duration-150 ${
                          folderPreview ? 'opacity-0' : 'opacity-100'
                        }`}
                      >
                        <Icon
                          icon={entry.item.icon}
                          selectionKey={entry.item.key}
                          selectionMode={selectionMode}
                          selected={selectedSet.has(entry.item.key)}
                          onToggleSelect={onToggleSelectIcon}
                          highlighted={highlightedItem}
                        />
                      </div>
                      <FolderCreatePreview
                        active={folderPreview}
                        icon={entry.item.icon}
                        imgSize={iconConfig.imgSize}
                        reorderAnimationMs={reorderAnimationMs}
                        tileWidth={itemWidth}
                        tileHeight={itemHeight}
                      />
                    </div>
                  ) : (
                    <OuterFolderTile
                      folder={entry.item}
                      span={entry.span}
                      slotWidth={itemWidth}
                      slotHeight={itemHeight}
                      gridGap={gridGap}
                      folderPreview={folderPreview}
                      folderOpen={openFolderId === entry.item.id}
                      sharedLayoutActive={activeFolderSharedLayoutId === entry.item.id}
                      selectionMode={selectionMode}
                      onPointerDown={event => onTilePointerDown(event, entry.id)}
                      onClickCapture={onTileClickCapture}
                      onOpenFolder={onOpenFolder}
                      onLaunchIcon={onLaunchIcon}
                      onResizeFolder={onResizeFolder}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
