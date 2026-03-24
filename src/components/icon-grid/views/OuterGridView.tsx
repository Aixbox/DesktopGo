import { ChevronLeft, ChevronRight } from 'lucide-react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
import { Icon } from '../../Icon'
import type { FolderSize, GridSpan } from '../model'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import { FolderCreatePreview } from './FolderVisuals'
import { OuterFolderTile } from './OuterFolderTile'

interface IconConfigLike {
  imgSize: number
  containerWidth: number
}

interface OuterGridViewProps {
  gridRef: RefObject<HTMLDivElement | null>
  gridWidth: number
  gridHeight: number
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  pageCellCount: number
  currentPage: number
  pageAnchorEntries: PageAnchorEntry[]
  dragContext: 'outer' | 'folder' | null
  dragPreviewSlotIndex: number | null
  dragFolderPreviewTargetId: string | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  hiddenOuterItemIds: string[]
  previewFootprint: { row: number; col: number; span: GridSpan } | null
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
  bindTileRef: (id: string, node: HTMLDivElement | null) => void
  reorderAnimationMs: number
  canGoLeft: boolean
  canGoRight: boolean
  sideArrowOffset: number
  onGoLeft: () => void
  onGoRight: () => void
  paginationOffset: number
  paginationDotGap: number
  paginationDotSize: number
  paginationActiveWidth: number
  pageCount: number
  hoverPage: number | null
  onHoverPage: (page: number | null) => void
  onSwitchPage: (page: number) => void
}

export function OuterGridView({
  gridRef,
  gridWidth,
  gridHeight,
  columns,
  rows,
  itemWidth,
  itemHeight,
  gridGap,
  pageCellCount,
  currentPage,
  pageAnchorEntries,
  dragContext,
  dragPreviewSlotIndex,
  dragFolderPreviewTargetId,
  folderPreviewFreezeTargetId,
  folderCreateTransitionTargetId,
  hiddenOuterItemIds,
  previewFootprint,
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
  bindTileRef,
  reorderAnimationMs,
  canGoLeft,
  canGoRight,
  sideArrowOffset,
  onGoLeft,
  onGoRight,
  paginationOffset,
  paginationDotGap,
  paginationDotSize,
  paginationActiveWidth,
  pageCount,
  hoverPage,
  onHoverPage,
  onSwitchPage,
}: OuterGridViewProps) {
  return (
    <div
      className="relative"
      style={{
        width: `${gridWidth}px`,
        height: `${gridHeight}px`,
        maxWidth: '100%',
        maxHeight: '100%',
      }}
    >
      <div
        ref={gridRef}
        className="grid h-full w-full content-start"
        style={{
          gridTemplateColumns: `repeat(${columns}, ${itemWidth}px)`,
          gridTemplateRows: `repeat(${rows}, ${itemHeight}px)`,
          gap: `${gridGap}px`,
        }}
      >
        {Array.from({ length: pageCellCount }, (_, index) => {
          return (
            <div
              key={`cell-${currentPage}-${index}`}
              data-grid-item
              className="h-full w-full rounded-2xl border border-transparent bg-transparent"
              style={{ minHeight: `${itemHeight}px` }}
              aria-hidden="true"
            />
          )
        })}

        {dragContext === 'outer' && dragPreviewSlotIndex !== null && previewFootprint !== null ? (
          <div
            className="pointer-events-none rounded-2xl border border-white/22 bg-white/8"
            style={{
              gridColumn: `${previewFootprint.col + 1} / span ${previewFootprint.span.cols}`,
              gridRow: `${previewFootprint.row + 1} / span ${previewFootprint.span.rows}`,
            }}
            aria-hidden="true"
          />
        ) : null}

        {pageAnchorEntries.map(entry => {
          const hideItem = hiddenOuterItemIds.includes(entry.id)
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

      {canGoLeft ? (
        <button
          data-pagination
          type="button"
          aria-label="Previous page"
          className="absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/55"
          style={{ left: `-${sideArrowOffset}px` }}
          onClick={onGoLeft}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}

      {canGoRight ? (
        <button
          data-pagination
          type="button"
          aria-label="Next page"
          className="absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/55"
          style={{ right: `-${sideArrowOffset}px` }}
          onClick={onGoRight}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}

      <div
        data-pagination
        className="absolute left-1/2 z-10 -translate-x-1/2 px-3 py-1.5"
        style={{ top: `calc(100% + ${paginationOffset}px)` }}
        onMouseLeave={() => onHoverPage(null)}
      >
        <div className="flex items-center" style={{ columnGap: `${paginationDotGap}px` }}>
          {Array.from({ length: pageCount }, (_, index) => {
            const isCurrent = currentPage === index
            const isHovered = hoverPage === index
            const shouldExpand = isCurrent || isHovered
            return (
              <button
                key={index}
                data-pagination
                type="button"
                aria-label={`Switch to page ${index + 1}`}
                onMouseEnter={() => onHoverPage(index)}
                onClick={() => onSwitchPage(index)}
                className={`relative rounded-full transition-all duration-250 ease-out ${
                  isCurrent
                    ? 'bg-white/95 shadow-[0_0_10px_rgba(255,255,255,0.75)]'
                    : isHovered
                      ? 'bg-white/55'
                      : 'bg-white/35 hover:bg-white/45'
                }`}
                style={{
                  width: `${shouldExpand ? paginationActiveWidth : paginationDotSize}px`,
                  height: `${paginationDotSize}px`,
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
