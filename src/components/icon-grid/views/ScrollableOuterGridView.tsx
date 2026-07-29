import { Plus } from 'lucide-react'
import { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, useSortable, type SortingStrategy } from '@dnd-kit/sortable'
import {
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Icon } from '../../Icon'
import { translate } from '../../../lib/i18n'
import { useIconStore } from '../../../stores/iconStore'
import {
  getIconGridTitleMetrics,
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
} from '../../../types'
import type { FolderSize, ScrollGroupMeta } from '../model'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import { useScrollableOuterGridDragWorkflow } from '../scroll/useScrollableOuterGridDragWorkflow'
import { FolderCreatePreview } from './FolderVisuals'
import { OuterFolderTile } from './OuterFolderTile'
import { ScrollableGroupNavigation } from './ScrollableGroupNavigation'
import type { GridItemPosition, ScrollGridSection } from './scrollableOuterGridTypes'

export type { ScrollGridSection } from './scrollableOuterGridTypes'

interface IconConfigLike {
  imgSize: number
}

const EMPTY_PAGE_ANCHOR_ENTRIES: PageAnchorEntry[] = []
const NOOP = () => undefined
const noSortableTransform: SortingStrategy = () => null

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
  dragHoveredGroupId: string | null
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
  onAddGroup: (meta: Pick<ScrollGroupMeta, 'name' | 'icon'>) => void
  onEditGroup: (page: number, meta: Pick<ScrollGroupMeta, 'name' | 'icon'>) => void
  onReorderGroup: (sourcePage: number, targetPage: number) => void
  onCommitItemOrder: (groupId: string, itemIds: string[]) => void
  onMoveItemToGroup: (itemId: string, targetGroupId: string) => void
  onMoveItemToDock: (itemId: string, targetIndex: number) => void
  onMergeItems: (sourceId: string, targetId: string) => void
  addIconDisabled: boolean
  onAddIcon?: (targetGroupId: string) => void
  onDeleteGroup: (page: number) => void
  onToggleSelectIcon: (key: string) => void
  onTilePointerDown: (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => void
  onTileClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onOpenFolder: (folderId: string) => void
  onLaunchIcon: (path: string) => void
  onResizeFolder: (folderId: string, size: FolderSize) => void
  bindTileRef: (id: string, node: HTMLDivElement | null) => void
  bindGridPageRef: (page: number, node: HTMLDivElement | null) => void
  externalGridFlipPositionsRef: MutableRefObject<Map<string, GridItemPosition> | null>
  reorderAnimationMs: number
}

interface SortableGridItemBindings {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setNodeRef: ReturnType<typeof useSortable>['setNodeRef']
  isDragging: boolean
}

function SortableGridItem({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: (bindings: SortableGridItemBindings) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id,
    disabled,
    animateLayoutChanges: () => false,
  })
  return children({ attributes, listeners, setNodeRef, isDragging })
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
  dragHoveredGroupId,
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
  onEditGroup,
  onReorderGroup,
  onCommitItemOrder,
  onMoveItemToGroup,
  onMoveItemToDock,
  onMergeItems,
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
  externalGridFlipPositionsRef,
  reorderAnimationMs,
}: ScrollableOuterGridViewProps) {
  const highlightedOuterItemIdSet = useMemo(
    () => new Set(highlightedOuterItemIds),
    [highlightedOuterItemIds]
  )
  const titleLineCount = useIconStore(state => state.titleLineCount)
  const addIconTitleMetrics = getIconGridTitleMetrics(titleLineCount)
  const addIconLabel = translate('\u6dfb\u52a0\u56fe\u6807')
  const committedEntries = useMemo(
    () => activeSection?.entries ?? EMPTY_PAGE_ANCHOR_ENTRIES,
    [activeSection?.entries]
  )
  const activeItemById = useMemo(
    () => new Map(committedEntries.map(entry => [entry.id, entry.item])),
    [committedEntries]
  )
  const committedItemIds = activeSection?.meta?.itemIds ?? committedEntries.map(entry => entry.id)
  const layoutColumns = committedEntries.reduce(
    (maximum, entry) => Math.max(maximum, entry.span.cols),
    Math.max(1, columns)
  )
  const {
    activeDraggedItemId,
    entries,
    gridElementRef,
    gridItemRefs,
    handleGridClickCapture,
    handleGridPointerCancel,
    handleGridPointerDown,
    handleGridPointerMove,
    handleGridPointerUp,
    handleKeyboardItemDragCancel,
    handleKeyboardItemDragEnd,
    handleKeyboardItemDragMove,
    handleKeyboardItemDragStart,
    hoveredGroupId,
    itemSensors,
    keyboardDraggedItem,
    keyboardDraggedSpan,
    layoutMotionActive,
    mergeTargetId,
  } = useScrollableOuterGridDragWorkflow({
    containerRef,
    activeSection,
    committedEntries,
    committedItemIds,
    activeItemById,
    layoutColumns,
    itemWidth,
    itemHeight,
    gridGap,
    selectionMode,
    externalGridFlipPositionsRef,
    reorderAnimationMs,
    onCommitItemOrder,
    onMoveItemToGroup,
    onMoveItemToDock,
    onMergeItems,
    onTileClickCapture,
  })
  const hasAddIconSlot = activeSection !== null
  const addIconVisible = hasAddIconSlot && !layoutMotionActive
  const addIconSlotIndex = entries.reduce((lastIndex, entry) => {
    const footprintEnd =
      (entry.row + entry.span.rows - 1) * layoutColumns + entry.col + entry.span.cols
    return Math.max(lastIndex, footprintEnd)
  }, 0)
  const addIconRow = Math.floor(addIconSlotIndex / layoutColumns)
  const addIconCol = addIconSlotIndex % layoutColumns
  const committedGridRows = committedEntries.reduce(
    (maxRow, entry) => Math.max(maxRow, entry.row + entry.span.rows),
    1
  )
  const gridRows = Math.max(
    1,
    layoutMotionActive ? committedGridRows : 1,
    entries.reduce((maxRow, entry) => Math.max(maxRow, entry.row + entry.span.rows), 1),
    hasAddIconSlot ? addIconRow + 1 : 1
  )
  const gridHeight = gridRows * itemHeight + Math.max(0, gridRows - 1) * gridGap

  return (
    <div className="scroll-grid-layout grid h-full w-full min-w-0 grid-cols-[var(--scroll-grid-sidebar-width)_minmax(0,1fr)] overflow-hidden">
      <ScrollableGroupNavigation
        containerRef={containerRef}
        sidebarCompact={sidebarCompact}
        sections={sections}
        currentPage={currentPage}
        dragHoveredGroupId={dragHoveredGroupId}
        itemDragHoveredGroupId={hoveredGroupId}
        onToggleSidebarCompact={onToggleSidebarCompact}
        onActivePageChange={onActivePageChange}
        onAddGroup={onAddGroup}
        onEditGroup={onEditGroup}
        onReorderGroup={onReorderGroup}
        onDeleteGroup={onDeleteGroup}
      />

      <DndContext
        sensors={itemSensors}
        collisionDetection={closestCenter}
        onDragStart={handleKeyboardItemDragStart}
        onDragMove={handleKeyboardItemDragMove}
        onDragEnd={handleKeyboardItemDragEnd}
        onDragCancel={handleKeyboardItemDragCancel}
      >
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
                gridElementRef.current = node
                bindGridPageRef(currentPage, node)
              }}
              className="relative grid max-w-full content-start"
              onPointerDown={handleGridPointerDown}
              onPointerMove={handleGridPointerMove}
              onPointerUp={handleGridPointerUp}
              onPointerCancel={handleGridPointerCancel}
              onLostPointerCapture={handleGridPointerCancel}
              style={{
                width: `${Math.max(
                  gridWidth,
                  layoutColumns * itemWidth + Math.max(0, layoutColumns - 1) * gridGap
                )}px`,
                height: `${gridHeight}px`,
                gridTemplateColumns: `repeat(${layoutColumns}, ${itemWidth}px)`,
                gridTemplateRows: `repeat(${gridRows}, ${itemHeight}px)`,
                gap: `${gridGap}px`,
              }}
            >
              <SortableContext
                items={entries.map(entry => entry.id)}
                strategy={noSortableTransform}
              >
                {entries.map(entry => {
                  const activeItem = activeDraggedItemId === entry.id
                  const hideItem = hiddenOuterItemIds.includes(entry.id) || activeItem
                  const highlightedItem = highlightedOuterItemIdSet.has(entry.id)
                  const folderPreview =
                    (dragContext === 'outer' && dragFolderPreviewTargetId === entry.id) ||
                    mergeTargetId === entry.id ||
                    folderPreviewFreezeTargetId === entry.id ||
                    folderCreateTransitionTargetId === entry.id

                  return (
                    <SortableGridItem key={entry.id} id={entry.id} disabled={selectionMode}>
                      {sortable => (
                        <div
                          ref={node => {
                            sortable.setNodeRef(node)
                            bindTileRef(entry.id, node)
                            if (node) gridItemRefs.current.set(entry.id, node)
                            else gridItemRefs.current.delete(entry.id)
                          }}
                          data-scroll-sortable-id={entry.id}
                          className={`relative touch-pan-y justify-self-center self-start ${
                            activeItem
                              ? 'pointer-events-none opacity-0'
                              : `transition-opacity duration-[220ms] ${hideItem ? 'opacity-0' : 'opacity-100'}`
                          } ${sortable.isDragging ? 'z-20 cursor-grabbing' : 'z-10'}`}
                          style={{
                            gridColumn: `${entry.col + 1} / span ${entry.span.cols}`,
                            gridRow: `${entry.row + 1} / span ${entry.span.rows}`,
                            width: `${entry.span.cols * itemWidth + Math.max(0, entry.span.cols - 1) * gridGap}px`,
                            height: `${entry.span.rows * itemHeight + Math.max(0, entry.span.rows - 1) * gridGap}px`,
                          }}
                          {...sortable.attributes}
                          {...sortable.listeners}
                          onPointerDown={event => {
                            if (selectionMode) return
                            event.stopPropagation()
                            onTilePointerDown(event, entry.id)
                          }}
                          onClickCapture={handleGridClickCapture}
                        >
                          {entry.item.kind === 'icon' ? (
                            <div className="relative">
                              <div
                                className={`transition-opacity duration-[220ms] ${
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
                                  motionProfile="scroll"
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
                              onPointerDown={NOOP}
                              onClickCapture={NOOP}
                              onOpenFolder={onOpenFolder}
                              onLaunchIcon={onLaunchIcon}
                              onResizeFolder={onResizeFolder}
                            />
                          )}
                        </div>
                      )}
                    </SortableGridItem>
                  )
                })}
              </SortableContext>
              <DragOverlay adjustScale={false} dropAnimation={null} zIndex={240}>
                {keyboardDraggedItem ? (
                  <div
                    data-scroll-dragging="true"
                    className="pointer-events-none relative cursor-grabbing"
                    style={{
                      width: `${(keyboardDraggedSpan?.cols ?? 1) * itemWidth + Math.max(0, (keyboardDraggedSpan?.cols ?? 1) - 1) * gridGap}px`,
                      height: `${(keyboardDraggedSpan?.rows ?? 1) * itemHeight + Math.max(0, (keyboardDraggedSpan?.rows ?? 1) - 1) * gridGap}px`,
                    }}
                  >
                    {keyboardDraggedItem.kind === 'icon' ? (
                      <Icon
                        icon={keyboardDraggedItem.icon}
                        selectionKey={keyboardDraggedItem.key}
                        selectionMode={false}
                        selected={false}
                        onToggleSelect={NOOP}
                        motionProfile="scroll"
                      />
                    ) : (
                      <OuterFolderTile
                        folder={keyboardDraggedItem}
                        span={keyboardDraggedSpan ?? { cols: 1, rows: 1 }}
                        slotWidth={itemWidth}
                        slotHeight={itemHeight}
                        gridGap={gridGap}
                        folderPreview={false}
                        folderOpen={false}
                        sharedLayoutActive={false}
                        selectionMode={false}
                        onPointerDown={NOOP}
                        onClickCapture={NOOP}
                        onOpenFolder={NOOP}
                        onLaunchIcon={NOOP}
                        onResizeFolder={NOOP}
                      />
                    )}
                  </div>
                ) : null}
              </DragOverlay>
              {hasAddIconSlot ? (
                <button
                  type="button"
                  data-no-window-drag="true"
                  aria-label={addIconLabel}
                  title={addIconLabel}
                  disabled={addIconDisabled || !onAddIcon}
                  className="icon-item group relative flex flex-col items-center justify-start justify-self-center self-start rounded-2xl border-none px-3 text-muted-foreground shadow-none transition-opacity duration-200 hover:bg-foreground/6 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 active:bg-foreground/10 disabled:pointer-events-none disabled:opacity-45 dark:hover:bg-white/10 dark:active:bg-white/20"
                  style={{
                    gridColumn: addIconCol + 1,
                    gridRow: addIconRow + 1,
                    width: `${itemWidth}px`,
                    height: `${itemHeight}px`,
                    paddingTop: ICON_GRID_TILE_PADDING_Y,
                    paddingBottom: ICON_GRID_TILE_PADDING_Y,
                    rowGap: ICON_GRID_TITLE_GAP,
                    opacity: addIconVisible ? undefined : 0,
                    pointerEvents: addIconVisible ? undefined : 'none',
                  }}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() => {
                    if (activeSection) onAddIcon?.(activeSection.groupId)
                  }}
                >
                  <span
                    className="icon-image flex flex-1 items-center justify-center overflow-hidden"
                    style={{ width: iconConfig.imgSize, height: iconConfig.imgSize }}
                  >
                    <span
                      className="flex shrink-0 items-center justify-center rounded-md border border-dashed border-border/80 bg-foreground/3 transition-colors group-hover:border-foreground/35 group-hover:bg-accent dark:border-white/18 dark:bg-white/4"
                      style={{ width: iconConfig.imgSize, height: iconConfig.imgSize }}
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
      </DndContext>
    </div>
  )
}
