import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { Icon } from '../../Icon'
import type { GridItem } from '../model'
import { DRAG_HOLE_ID } from '../domain/slots'
import { FolderCreatePreview, FolderIconVisual } from './FolderVisuals'

interface IconConfigLike {
  imgSize: number
  containerWidth: number
}

interface OuterGridViewProps {
  gridRef: RefObject<HTMLDivElement | null>
  gridWidth: number
  gridHeight: number
  columns: number
  itemWidth: number
  itemHeight: number
  pageItems: Array<string | null>
  pageSize: number
  currentPage: number
  itemById: Map<string, GridItem>
  dragContext: 'outer' | 'folder' | null
  dragPreviewSlotIndex: number | null
  dragFolderPreviewTargetId: string | null
  folderPreviewFreezeTargetId: string | null
  hiddenOuterItemIds: string[]
  iconConfig: IconConfigLike
  selectionMode: boolean
  selectedSet: Set<string>
  onToggleSelectIcon: (key: string) => void
  onTilePointerDown: (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => void
  onTileClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onOpenFolder: (folderId: string) => void
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
  itemWidth,
  itemHeight,
  pageItems,
  pageSize,
  currentPage,
  itemById,
  dragContext,
  dragPreviewSlotIndex,
  dragFolderPreviewTargetId,
  folderPreviewFreezeTargetId,
  hiddenOuterItemIds,
  iconConfig,
  selectionMode,
  selectedSet,
  onToggleSelectIcon,
  onTilePointerDown,
  onTileClickCapture,
  onOpenFolder,
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
    <div className="relative" style={{ width: `${gridWidth}px`, height: `${gridHeight}px`, maxWidth: '100%', maxHeight: '100%' }}>
      <div
        ref={gridRef}
        className="grid h-full w-full content-start justify-items-center gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, ${itemWidth}px)` }}
      >
        {pageItems.map((entry, index) => {
          const globalSlotIndex = currentPage * pageSize + index
          const isOuterDropTarget = dragContext === 'outer' && dragPreviewSlotIndex === globalSlotIndex
          if (entry === null || entry === DRAG_HOLE_ID) {
            const showDropSlot = isOuterDropTarget
            return (
              <div
                key={`${showDropSlot ? 'drop' : 'empty'}-${currentPage}-${index}`}
                data-grid-item
                className={`h-full w-full rounded-2xl ${
                  showDropSlot
                    ? 'border border-white/20 bg-white/8'
                    : 'border border-transparent bg-transparent'
                }`}
                style={{ minHeight: `${itemHeight}px` }}
                aria-hidden="true"
              />
            )
          }

          const item = itemById.get(entry)
          if (!item) return null
          const hideItem = hiddenOuterItemIds.includes(entry)
          const folderPreview =
            (dragContext === 'outer' && dragFolderPreviewTargetId === entry) ||
            folderPreviewFreezeTargetId === entry

          return (
            <div
              key={entry}
              ref={node => {
                bindTileRef(entry, node)
              }}
              data-grid-item
              className={`relative touch-none ${
                isOuterDropTarget ? 'rounded-2xl ring-1 ring-white/35 bg-white/5' : ''
              }`}
              onPointerDown={event => onTilePointerDown(event, entry)}
              onClickCapture={onTileClickCapture}
            >
              {item.kind === 'icon' ? (
                <div
                  className={`transition-opacity duration-150 ${
                    hideItem ? 'opacity-0' : folderPreview ? 'opacity-45' : 'opacity-100'
                  }`}
                >
                  <Icon
                    icon={item.icon}
                    selectionKey={item.key}
                    selectionMode={selectionMode}
                    selected={selectedSet.has(item.key)}
                    onToggleSelect={onToggleSelectIcon}
                  />
                </div>
              ) : (
                <button
                  data-icon
                  type="button"
                  className="relative flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-none p-3"
                  style={{ width: iconConfig.containerWidth }}
                  title={item.name}
                  onClick={event => {
                    event.stopPropagation()
                    if (selectionMode) return
                    onOpenFolder(item.id)
                  }}
                >
                  <FolderIconVisual
                    icons={item.children.map(child => child.icon)}
                    imgSize={iconConfig.imgSize}
                  />
                  <span
                    className="truncate text-center text-[11px] leading-tight text-foreground"
                    style={{ maxWidth: iconConfig.containerWidth - 10 }}
                  >
                    {item.name}
                  </span>
                </button>
              )}

              {item.kind === 'icon' ? (
                <FolderCreatePreview
                  active={folderPreview}
                  icon={item.icon}
                  imgSize={iconConfig.imgSize}
                  reorderAnimationMs={reorderAnimationMs}
                />
              ) : null}
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
