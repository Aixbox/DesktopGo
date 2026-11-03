import { useCrossPageReorder } from '../hooks/useCrossPageReorder'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable } from '@dnd-kit/sortable'
import {
  Fragment,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { ResizableIcon } from './ResizableIcon'
import type { FolderSize, GridSpan } from '../model'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import { FolderCreatePreview } from './FolderVisuals'
import { OuterFolderTile } from './OuterFolderTile'
import { WidgetTile } from './WidgetTile'

export interface OuterGridPageData {
  page: number
  entries: PageAnchorEntry[]
  dragContext: 'outer' | 'folder' | null
  dragPreviewSlotIndex: number | null
  dragFolderPreviewTargetId: string | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  hiddenOuterItemIds: string[]
  highlightedOuterItemIds: string[]
  previewFootprint: { row: number; col: number; span: GridSpan } | null
}

interface IconConfigLike {
  imgSize: number
  containerWidth: number
}

interface KeyboardSortableGridItemBindings {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setNodeRef: ReturnType<typeof useSortable>['setNodeRef']
}

function KeyboardSortableGridItem({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: (bindings: KeyboardSortableGridItemBindings) => ReactNode
}) {
  const { attributes, listeners, setNodeRef } = useSortable({
    id,
    disabled,
    animateLayoutChanges: () => false,
  })
  return children({ attributes, listeners, setNodeRef })
}

function KeyboardGridCell({
  id,
  disabled,
  itemHeight,
}: {
  id: string
  disabled: boolean
  itemHeight: number
}) {
  const { setNodeRef } = useDroppable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      data-grid-item
      className="h-full w-full rounded-icon-tile border border-transparent bg-transparent"
      style={{ minHeight: `${itemHeight}px` }}
      aria-hidden="true"
    />
  )
}

interface OuterGridPageLayerProps {
  data: OuterGridPageData
  pageOrder?: Array<string | null>
  interactive: boolean
  gridRef?: Ref<HTMLDivElement>
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  pageCellCount: number
  iconConfig: IconConfigLike
  selectionMode: boolean
  selectedSet: Set<string>
  openFolderId: string | null
  activeFolderSharedLayoutId: string | null
  onToggleSelectIcon: (key: string) => void
  onTilePointerDown: (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => void
  onTileClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onOpenFolder: (folderId: string) => void
  onLaunchIcon: (path: string) => void
  onResizeFolder: (folderId: string, size: FolderSize) => void
  folderResizePreview?: { folderId: string; size: FolderSize } | null
  onPreviewFolderResize?: (folderId: string, size: FolderSize) => void
  onCancelFolderResize?: () => void
  onResizeWidget?: (widgetId: string, spanX: number, spanY: number) => void
  onDissolveFolder: (folderId: string) => void
  bindTileRef: (id: string, node: HTMLDivElement | null) => void
  reorderAnimationMs: number
}

const noop = () => undefined
const EMPTY_ORDER: Array<string | null> = []

export function OuterGridPageLayer({
  data,
  interactive,
  pageOrder = EMPTY_ORDER,
  gridRef,
  columns,
  rows,
  itemWidth,
  itemHeight,
  gridGap,
  pageCellCount,
  iconConfig,
  selectionMode,
  selectedSet,
  openFolderId,
  activeFolderSharedLayoutId,
  onToggleSelectIcon,
  onTilePointerDown,
  onTileClickCapture,
  onOpenFolder,
  onLaunchIcon,
  onResizeFolder,
  folderResizePreview = null,
  onPreviewFolderResize,
  onCancelFolderResize,
  onResizeWidget,
  onDissolveFolder,
  bindTileRef,
  reorderAnimationMs,
}: OuterGridPageLayerProps) {
  const transfers = useCrossPageReorder(
    {
      page: data.page,
      pageSize: pageCellCount,
      columns,
      entries: data.entries,
      order: interactive ? pageOrder : EMPTY_ORDER,
      hiddenIds: data.hiddenOuterItemIds,
    },
    { itemWidth, itemHeight, gap: gridGap }
  )
  const highlightedOuterItemIdSet = useMemo(
    () => new Set(data.highlightedOuterItemIds),
    [data.highlightedOuterItemIds]
  )
  const hiddenOuterItemIdSet = useMemo(
    () => new Set(data.hiddenOuterItemIds),
    [data.hiddenOuterItemIds]
  )
  const occupiedCellIndices = useMemo(() => {
    const occupied = new Set<number>()
    data.entries.forEach(entry => {
      for (let row = entry.row; row < entry.row + entry.span.rows; row += 1) {
        for (let col = entry.col; col < entry.col + entry.span.cols; col += 1) {
          occupied.add(row * columns + col)
        }
      }
    })
    return occupied
  }, [columns, data.entries])

  const renderEntry = (entry: PageAnchorEntry, sortable?: KeyboardSortableGridItemBindings) => {
    const inFlight = transfers.flightIds.has(entry.id)
    const itemInteractive = interactive && !inFlight
    const hideItem = hiddenOuterItemIdSet.has(entry.id)
    const highlightedItem = highlightedOuterItemIdSet.has(entry.id)
    const folderPreview =
      (data.dragContext === 'outer' && data.dragFolderPreviewTargetId === entry.id) ||
      data.folderPreviewFreezeTargetId === entry.id ||
      data.folderCreateTransitionTargetId === entry.id
    const tile = (
      <div
        ref={node => {
          transfers.bindNode(entry.id, node)
          if (!interactive) return
          sortable?.setNodeRef(itemInteractive ? node : null)
          bindTileRef(entry.id, itemInteractive ? node : null)
        }}
        inert={inFlight ? true : undefined}
        aria-hidden={inFlight ? true : undefined}
        data-cross-page-motion={inFlight ? entry.id : undefined}
        {...(itemInteractive ? sortable?.attributes : {})}
        {...(itemInteractive ? sortable?.listeners : {})}
        className={`relative overflow-visible justify-self-center self-start ${
          hideItem ? 'opacity-0' : 'opacity-100 transition-opacity duration-150'
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
            onPointerDown={
              itemInteractive ? event => onTilePointerDown(event, entry.id) : undefined
            }
            onClickCapture={itemInteractive ? onTileClickCapture : undefined}
          >
            <div
              className={`transition-opacity duration-150 ${
                folderPreview ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <ResizableIcon
                item={entry.item}
                span={entry.span}
                slotWidth={itemWidth}
                slotHeight={itemHeight}
                gridGap={gridGap}
                interactive={itemInteractive && !folderPreview}
                selectionMode={selectionMode}
                selected={selectedSet.has(entry.item.key)}
                onToggleSelect={itemInteractive ? onToggleSelectIcon : noop}
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
              span={entry.span}
              gridGap={gridGap}
            />
          </div>
        ) : entry.item.kind === 'folder' ? (
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
            onPointerDown={itemInteractive ? event => onTilePointerDown(event, entry.id) : noop}
            onClickCapture={itemInteractive ? onTileClickCapture : noop}
            onOpenFolder={itemInteractive ? onOpenFolder : noop}
            onLaunchIcon={itemInteractive ? onLaunchIcon : noop}
            onResizeFolder={itemInteractive ? onResizeFolder : noop}
            resizePreviewSize={
              itemInteractive && folderResizePreview?.folderId === entry.item.id
                ? folderResizePreview.size
                : null
            }
            onPreviewFolderResize={itemInteractive ? onPreviewFolderResize : undefined}
            onCancelFolderResize={itemInteractive ? onCancelFolderResize : undefined}
            onDissolveFolder={itemInteractive ? onDissolveFolder : noop}
          />
        ) : (
          <WidgetTile
            widget={entry.item}
            span={entry.span}
            slotWidth={itemWidth}
            slotHeight={itemHeight}
            gridGap={gridGap}
            onResize={itemInteractive ? onResizeWidget : undefined}
          />
        )}
      </div>
    )

    if (!interactive || sortable) return tile
    return (
      <KeyboardSortableGridItem key={entry.id} id={entry.id} disabled={selectionMode || inFlight}>
        {bindings => renderEntry(entry, bindings)}
      </KeyboardSortableGridItem>
    )
  }

  return (
    <div
      ref={gridRef}
      className="grid h-full w-full content-start"
      style={{
        gridTemplateColumns: `repeat(${columns}, ${itemWidth}px)`,
        gridTemplateRows: `repeat(${rows}, ${itemHeight}px)`,
        gap: `${gridGap}px`,
      }}
      aria-hidden={interactive ? undefined : true}
      inert={interactive ? undefined : true}
      data-grid-page={data.page}
    >
      {interactive
        ? Array.from({ length: pageCellCount }, (_, index) => (
            <KeyboardGridCell
              key={`cell-${data.page}-${index}`}
              id={`cell:${data.page}:${index}`}
              disabled={selectionMode || occupiedCellIndices.has(index)}
              itemHeight={itemHeight}
            />
          ))
        : null}

      {interactive &&
      data.dragContext === 'outer' &&
      data.dragPreviewSlotIndex !== null &&
      data.previewFootprint !== null ? (
        <div
          className="pointer-events-none rounded-icon-tile border border-border/60 bg-background/35 dark:border-white/22 dark:bg-white/8"
          style={{
            gridColumn: `${data.previewFootprint.col + 1} / span ${data.previewFootprint.span.cols}`,
            gridRow: `${data.previewFootprint.row + 1} / span ${data.previewFootprint.span.rows}`,
          }}
          aria-hidden="true"
        />
      ) : null}

      {interactive ? (
        <SortableContext
          items={data.entries
            .filter(entry => !transfers.flightIds.has(entry.id))
            .map(entry => entry.id)}
        >
          {transfers.entries.map(entry => renderEntry(entry))}
        </SortableContext>
      ) : (
        data.entries.map(entry => <Fragment key={entry.id}>{renderEntry(entry)}</Fragment>)
      )}
    </div>
  )
}
