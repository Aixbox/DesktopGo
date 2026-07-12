import { AppWindow, Folder as FolderIcon, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../ui/context-menu'

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
  sidebarCompact: boolean
  onToggleSidebarCompact: () => void
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
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground/6 text-muted-foreground dark:bg-white/8">
        <AppWindow className="h-3.5 w-3.5" />
      </span>
    )
  }

  if (items.length === 1) {
    return (
      <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-foreground/6 dark:bg-white/8">
        <GroupPreviewGlyph item={items[0]} />
      </span>
    )
  }

  return (
    <span className="grid h-7 w-7 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-md bg-foreground/6 p-1 dark:bg-white/8">
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
  sidebarCompact,
  onToggleSidebarCompact,
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
    <div className="scroll-grid-layout grid h-full w-full min-w-0 grid-cols-[var(--scroll-grid-sidebar-width)_minmax(0,1fr)] overflow-hidden">
      <aside
        data-grid-mode-nav
        data-no-window-drag="true"
        className="scroll-grid-sidebar flex h-full min-h-0 flex-col border-r"
      >
        <div
          className={[
            'scroll-grid-sidebar-header flex h-12 shrink-0 items-center border-b',
            sidebarCompact ? 'justify-center px-1' : 'justify-between px-3',
          ].join(' ')}
        >
          <span
            className={
              sidebarCompact ? 'sr-only' : 'truncate text-[13px] font-semibold text-foreground/82'
            }
          >
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

        <div
          className={[
            'scroll-grid-sidebar-scroll min-h-0 flex-1 overflow-y-auto py-1.5',
            sidebarCompact ? 'px-1.5' : 'px-2',
          ].join(' ')}
        >
          <div className={sidebarCompact ? 'grid gap-0.5' : 'grid gap-1'}>
            {sections.map(section => {
              const active = currentPage === section.index
              return (
                <ContextMenu key={section.index}>
                  <ContextMenuTrigger asChild>
                    <div
                      ref={node => {
                        if (node) groupItemRefs.current.set(section.index, node)
                        else groupItemRefs.current.delete(section.index)
                      }}
                      data-grid-mode-nav
                      data-scroll-group-target={section.index}
                      className={[
                        'relative flex items-center rounded-md transition-colors',
                        sidebarCompact ? 'aspect-square min-h-0 w-full' : 'min-h-11',
                        active
                          ? 'scroll-grid-group-active'
                          : 'text-foreground/72 hover:bg-accent/85 hover:text-foreground',
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        data-grid-mode-nav
                        aria-current={active ? 'page' : undefined}
                        className={[
                          'flex min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45',
                          sidebarCompact
                            ? 'flex-col items-center justify-center gap-1 px-1 py-1.5 text-center'
                            : 'items-center gap-2 px-2.5 py-1.5 text-left',
                        ].join(' ')}
                        onClick={() => selectSection(section.index)}
                      >
                        <GroupPreviewIcon items={section.previewItems} />
                        <span className={sidebarCompact ? 'w-full min-w-0' : 'min-w-0'}>
                          <span
                            title={translate('网格 {index}', { index: section.index + 1 })}
                            className={[
                              'block truncate font-medium',
                              sidebarCompact ? 'text-[11px] leading-3.5' : 'text-[13px] leading-4',
                            ].join(' ')}
                          >
                            {translate('网格 {index}', { index: section.index + 1 })}
                          </span>
                          {!sidebarCompact ? (
                            <span
                              data-scroll-group-count
                              className="mt-0.5 block text-[11px] leading-3.5 text-muted-foreground"
                            >
                              {translate('{count} 项', { count: section.itemCount })}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-40">
                    <ContextMenuItem
                      disabled={sections.length <= 1}
                      className="rounded-md text-red-700 focus:bg-red-500/12 focus:text-red-800 dark:text-red-200 dark:focus:bg-red-500/20 dark:focus:text-red-100"
                      onSelect={() => onDeleteGroup(section.index)}
                    >
                      {translate('删除分组')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </div>
        </div>

        <div
          className={[
            'scroll-grid-sidebar-footer flex h-12 shrink-0 items-center border-t',
            sidebarCompact ? 'justify-center px-1' : 'justify-end px-3',
          ].join(' ')}
        >
          <button
            type="button"
            data-grid-mode-nav
            aria-label={translate(sidebarCompact ? '展开侧栏' : '收起侧栏')}
            title={translate(sidebarCompact ? '展开侧栏' : '收起侧栏')}
            aria-pressed={sidebarCompact}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
            onClick={onToggleSidebarCompact}
          >
            {sidebarCompact ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
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
