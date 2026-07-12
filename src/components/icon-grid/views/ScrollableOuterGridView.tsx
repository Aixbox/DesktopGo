import { AppWindow, Folder as FolderIcon, Plus, Trash2 } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Icon } from '../../Icon'
import { translate } from '../../../lib/i18n'
import { useIconStore } from '../../../stores/iconStore'
import {
  getIconGridTitleMetrics,
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
} from '../../../types'
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
  previewItems: GridItem[]
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
  addIconDisabled: boolean
  onAddIcon?: () => void
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

function GroupPreviewGlyph({ item, compact = false }: { item: GridItem; compact?: boolean }) {
  const iconClassName = compact ? 'h-2.5 w-2.5' : 'h-4 w-4'
  const imageClassName = compact ? 'h-3 w-3 object-contain' : 'h-5 w-5 object-contain'

  if (item.kind === 'folder') {
    return (
      <span className="flex h-full w-full items-center justify-center text-blue-600 dark:text-blue-200">
        <FolderIcon className={iconClassName} />
      </span>
    )
  }

  if (item.icon.icon_base64) {
    return (
      <span className="flex h-full w-full items-center justify-center">
        <img src={item.icon.icon_base64} alt="" className={imageClassName} draggable={false} />
      </span>
    )
  }

  return (
    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
      <AppWindow className={iconClassName} />
    </span>
  )
}

function GroupPreviewIcon({ items }: { items: GridItem[] }) {
  if (items.length === 0) {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground/6 text-muted-foreground dark:bg-white/8">
        <AppWindow className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (items.length === 1) {
    return (
      <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-foreground/6 dark:bg-white/8">
        <GroupPreviewGlyph item={items[0]} />
      </span>
    )
  }

  return (
    <span className="grid h-8 w-8 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-md bg-foreground/6 p-1 dark:bg-white/8">
      {items.map(item => (
        <span key={item.kind === 'folder' ? item.id : item.key} className="overflow-hidden">
          <GroupPreviewGlyph item={item} compact />
        </span>
      ))}
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
  addIconDisabled,
  onAddIcon,
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
  const groupItemRefs = useRef(new Map<number, HTMLDivElement>())
  const highlightedOuterItemIdSet = useMemo(
    () => new Set(highlightedOuterItemIds),
    [highlightedOuterItemIds]
  )
  const titleLineCount = useIconStore(state => state.titleLineCount)
  const addIconTitleMetrics = getIconGridTitleMetrics(titleLineCount)
  const addIconLabel = translate('\u6dfb\u52a0\u56fe\u6807')
  const entries = activeSection?.entries ?? []
  const showAddIcon = activeSection !== null
  const addIconSlotIndex = entries.reduce((lastIndex, entry) => {
    const footprintEnd = (entry.row + entry.span.rows - 1) * columns + entry.col + entry.span.cols
    return Math.max(lastIndex, footprintEnd)
  }, 0)
  const addIconRow = Math.floor(addIconSlotIndex / Math.max(1, columns))
  const addIconCol = addIconSlotIndex % Math.max(1, columns)
  const gridRows = Math.max(
    1,
    entries.reduce((maxRow, entry) => Math.max(maxRow, entry.row + entry.span.rows), 1),
    showAddIcon ? addIconRow + 1 : 1
  )
  const gridHeight = gridRows * itemHeight + Math.max(0, gridRows - 1) * gridGap

  const selectSection = (index: number) => {
    onActivePageChange(index)
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      groupItemRefs.current.get(currentPage)?.scrollIntoView({ block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentPage])

  return (
    <div className="grid h-full w-full min-w-0 grid-cols-[var(--scroll-grid-sidebar-width)_minmax(0,1fr)] overflow-hidden">
      <aside
        data-grid-mode-nav
        data-no-window-drag="true"
        className="scroll-grid-sidebar flex h-full min-h-0 flex-col border-r"
      >
        <div className="scroll-grid-sidebar-header flex h-12 shrink-0 items-center justify-between border-b px-3">
          <span className="truncate text-[13px] font-semibold text-foreground/82">
            {translate('网格分组')}
          </span>
          <button
            type="button"
            data-grid-mode-nav
            aria-label={translate('添加分组')}
            title={translate('添加分组')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
            onClick={onAddGroup}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-grid-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
          <div className="grid gap-1.5">
            {sections.map(section => {
              const active = currentPage === section.index
              return (
                <div
                  key={section.index}
                  ref={node => {
                    if (node) groupItemRefs.current.set(section.index, node)
                    else groupItemRefs.current.delete(section.index)
                  }}
                  data-grid-mode-nav
                  data-scroll-group-target={section.index}
                  className={`group flex min-h-12 items-center rounded-md transition-colors ${
                    active
                      ? 'scroll-grid-group-active'
                      : 'text-foreground/72 hover:bg-accent/85 hover:text-foreground'
                  }`}
                >
                  <button
                    type="button"
                    data-grid-mode-nav
                    aria-current={active ? 'page' : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                    onClick={() => selectSection(section.index)}
                  >
                    <GroupPreviewIcon items={section.previewItems} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium leading-4">
                        {translate('网格 {index}', { index: section.index + 1 })}
                      </span>
                      <span
                        data-scroll-group-count
                        className="mt-0.5 block text-[11px] leading-3.5 text-muted-foreground"
                      >
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
                    className={[
                      'mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-red-500/12 hover:text-red-600 disabled:pointer-events-none disabled:opacity-0 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35 dark:hover:text-red-300',
                      active ? 'opacity-55 hover:opacity-100' : 'opacity-0 group-hover:opacity-75',
                    ].join(' ')}
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
        className={`scroll-grid-content-scroll min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-6 pt-24 ${
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
              const highlightedItem = highlightedOuterItemIdSet.has(entry.id)
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
                  className={`relative justify-self-center self-start transition-opacity duration-150 ${
                    hideItem ? 'opacity-0' : 'opacity-100'
                  }`}
                  style={{
                    gridColumn: `${entry.col + 1} / span ${entry.span.cols}`,
                    gridRow: `${entry.row + 1} / span ${entry.span.rows}`,
                    width: `${entry.span.cols * itemWidth + Math.max(0, entry.span.cols - 1) * gridGap}px`,
                    height: `${entry.span.rows * itemHeight + Math.max(0, entry.span.rows - 1) * gridGap}px`,
                  }}
                >
                  {entry.item.kind === 'icon' ? (
                    <div
                      className="relative touch-none"
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
            {showAddIcon ? (
              <button
                type="button"
                data-no-window-drag="true"
                aria-label={addIconLabel}
                title={addIconLabel}
                disabled={addIconDisabled || !onAddIcon}
                className="icon-item group relative flex flex-col items-center justify-start justify-self-center self-start rounded-2xl border-none px-3 text-muted-foreground shadow-none transition-all duration-200 hover:bg-foreground/6 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 active:bg-foreground/10 disabled:pointer-events-none disabled:opacity-45 dark:hover:bg-white/10 dark:active:bg-white/20"
                style={{
                  gridColumn: addIconCol + 1,
                  gridRow: addIconRow + 1,
                  width: `${itemWidth}px`,
                  height: `${itemHeight}px`,
                  paddingTop: ICON_GRID_TILE_PADDING_Y,
                  paddingBottom: ICON_GRID_TILE_PADDING_Y,
                  rowGap: ICON_GRID_TITLE_GAP,
                }}
                onPointerDown={event => event.stopPropagation()}
                onClick={onAddIcon}
              >
                <span
                  className="icon-image flex flex-1 items-center justify-center overflow-hidden"
                  style={{ width: iconConfig.imgSize, height: iconConfig.imgSize }}
                >
                  <span
                    className="flex shrink-0 items-center justify-center rounded-md border border-dashed border-border/80 bg-foreground/3 transition-colors group-hover:border-foreground/35 group-hover:bg-accent dark:border-white/18 dark:bg-white/4"
                    style={{
                      width: iconConfig.imgSize,
                      height: iconConfig.imgSize,
                    }}
                  >
                    <Plus className="h-5 w-5" />
                  </span>
                </span>
                <span
                  className="icon-label text-center text-[11px] leading-[13px] text-foreground drop-shadow-md"
                  style={{
                    maxWidth: itemWidth - 10,
                    height: addIconTitleMetrics.height,
                    display: addIconTitleMetrics.singleLine ? 'block' : '-webkit-box',
                    WebkitLineClamp: addIconTitleMetrics.lineClamp,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: addIconTitleMetrics.singleLine ? 'nowrap' : 'normal',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {addIconLabel}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
