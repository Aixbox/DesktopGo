import { useLayoutEffect, useMemo } from 'react'
import type { FolderItem, GridItem, IconItem, ScrollGroupMeta } from '../model'
import { getGridItemSpan } from '../model'
import type { DragState } from '../state/types'
import { DRAG_HOLE_ID } from '../domain/slots'
import {
  canPlaceItemAtAnchorIndex,
  getFootprintIndices,
  getPageAnchorEntries,
} from '../domain/topLevelLayout'
import { compactOuterSlotsWithinPages } from './scrollTopLevelLayout'
import { buildScrollGroupDragPreviewOrder, buildScrollGroupEntries } from './scrollGroupLayout'
import type { ScrollGridSection } from '../views/scrollableOuterGridTypes'
import { GRID_GAP } from '../constants'

const EMPTY_SCROLL_RENDER_ORDER: Array<string | null> = []
const EMPTY_SCROLL_GRID_SECTIONS: ScrollGridSection[] = []

interface UseScrollableIconGridViewModelParams {
  launchpadGridViewMode: 'paged' | 'scroll'
  dragState: DragState | null
  renderOrder: Array<string | null>
  outerViewItemById: Map<string, GridItem>
  currentPage: number
  pageSize: number
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  pageCount: number
  scrollGroups: ScrollGroupMeta[]
  scrollSidebarDragActive: boolean
  captureRenderedScrollPreview: (groupId: string, itemIds: string[], draggingIds: string[]) => void
  hiddenOuterItemIds: string[]
  outerItemIds: string[]
  openFolder: FolderItem | null
  itemById: Map<string, GridItem>
  draggedFolderChildSelections: Map<string, IconItem[]>
}

export function useScrollableIconGridViewModel({
  launchpadGridViewMode,
  dragState,
  renderOrder,
  outerViewItemById,
  currentPage,
  pageSize,
  columns,
  rows,
  itemWidth,
  itemHeight,
  pageCount,
  scrollGroups,
  scrollSidebarDragActive,
  captureRenderedScrollPreview,
  hiddenOuterItemIds,
  outerItemIds,
  openFolder,
  itemById,
  draggedFolderChildSelections,
}: UseScrollableIconGridViewModelParams) {
  const outerViewItems = useMemo(() => Array.from(outerViewItemById.values()), [outerViewItemById])
  const pageAnchorEntries = useMemo(
    () => getPageAnchorEntries(renderOrder, outerViewItems, currentPage, pageSize, columns),
    [columns, currentPage, outerViewItems, pageSize, renderOrder]
  )
  const scrollRenderOrder = useMemo(() => {
    if (launchpadGridViewMode !== 'scroll') return EMPTY_SCROLL_RENDER_ORDER
    return dragState?.context === 'outer'
      ? renderOrder
      : compactOuterSlotsWithinPages(renderOrder, outerViewItems, pageSize, columns, pageCount)
  }, [
    columns,
    dragState?.context,
    launchpadGridViewMode,
    outerViewItems,
    pageCount,
    pageSize,
    renderOrder,
  ])
  const externalScrollPreviewItemIds = useMemo(() => {
    if (launchpadGridViewMode !== 'scroll' || dragState?.context !== 'outer') return null
    const activeGroup = scrollGroups[currentPage]
    if (!activeGroup) return null
    if (scrollSidebarDragActive) return activeGroup.itemIds
    return buildScrollGroupDragPreviewOrder({
      groupItemIds: activeGroup.itemIds,
      workingOrder: dragState.scrollGroupOrder ?? dragState.workingOrder,
      draggingIds: dragState.draggingIds,
      availableIds: new Set(outerViewItemById.keys()),
    })
  }, [
    currentPage,
    dragState,
    launchpadGridViewMode,
    outerViewItemById,
    scrollGroups,
    scrollSidebarDragActive,
  ])

  useLayoutEffect(() => {
    if (
      launchpadGridViewMode !== 'scroll' ||
      dragState?.context !== 'outer' ||
      !externalScrollPreviewItemIds
    ) {
      return
    }
    const activeGroup = scrollGroups[currentPage]
    if (!activeGroup) return
    captureRenderedScrollPreview(
      activeGroup.id,
      externalScrollPreviewItemIds,
      dragState.draggingIds
    )
  }, [
    captureRenderedScrollPreview,
    currentPage,
    dragState,
    externalScrollPreviewItemIds,
    launchpadGridViewMode,
    scrollGroups,
  ])

  const scrollGridSections = useMemo<ScrollGridSection[]>(() => {
    if (launchpadGridViewMode !== 'scroll') return EMPTY_SCROLL_GRID_SECTIONS
    return scrollGroups.map((group, index) => {
      const itemIds =
        index === currentPage && externalScrollPreviewItemIds
          ? externalScrollPreviewItemIds
          : group.itemIds
      return {
        index,
        groupId: group.id,
        itemCount: group.itemIds.length,
        entries:
          index === currentPage ? buildScrollGroupEntries(itemIds, outerViewItemById, columns) : [],
        meta: group,
        previewItems: group.itemIds
          .map(id => outerViewItemById.get(id))
          .filter((item): item is GridItem => Boolean(item))
          .slice(0, 4),
      }
    })
  }, [
    columns,
    currentPage,
    externalScrollPreviewItemIds,
    launchpadGridViewMode,
    outerViewItemById,
    scrollGroups,
  ])
  const activeScrollGridSection =
    launchpadGridViewMode === 'scroll'
      ? (scrollGridSections.find(section => section.index === currentPage) ??
        scrollGridSections[0] ??
        null)
      : null
  const pageItems = useMemo(() => {
    const sourceOrder = launchpadGridViewMode === 'scroll' ? scrollRenderOrder : renderOrder
    const start = currentPage * pageSize
    const currentSlice = [...sourceOrder.slice(start, start + pageSize)]
    if (currentSlice.length < pageSize) {
      currentSlice.push(...Array.from({ length: pageSize - currentSlice.length }, () => null))
    }
    return currentSlice
  }, [currentPage, launchpadGridViewMode, pageSize, renderOrder, scrollRenderOrder])
  const previewFootprint = useMemo(() => {
    if (dragState?.context !== 'outer') return null
    if (dragState.previewSlotIndex === null || dragState.folderPreviewTargetId) return null
    const span = getGridItemSpan(dragState.draggingItem)
    if (span.cols > 1 || span.rows > 1) return null
    if (
      !canPlaceItemAtAnchorIndex(
        renderOrder,
        outerViewItems,
        dragState.previewSlotIndex,
        span,
        columns,
        pageSize
      )
    ) {
      return null
    }
    const indices = getFootprintIndices(dragState.previewSlotIndex, span, columns, pageSize)
    if (!indices) return null
    const pageStart = currentPage * pageSize
    const pageEnd = pageStart + pageSize
    if (indices.some(index => index < pageStart || index >= pageEnd)) return null
    const localIndex = dragState.previewSlotIndex - pageStart
    return { row: Math.floor(localIndex / columns), col: localIndex % columns, span }
  }, [columns, currentPage, dragState, outerViewItems, pageSize, renderOrder])
  const pagedActiveHiddenDragIds = useMemo(() => {
    if (!dragState) return []
    const outerItemIdSet = new Set(outerItemIds)
    return dragState.draggingIds.filter(id => outerItemIdSet.has(id))
  }, [dragState, outerItemIds])
  const scrollActiveHiddenDragIds = useMemo(() => {
    if (!dragState) return []
    if (dragState.context === 'outer') return dragState.draggingIds
    const renderedOuterIdSet = new Set(
      renderOrder.filter(
        (slot): slot is string => typeof slot === 'string' && slot !== DRAG_HOLE_ID
      )
    )
    const outerItemIdSet = new Set(outerItemIds)
    return dragState.draggingIds.filter(id => renderedOuterIdSet.has(id) || outerItemIdSet.has(id))
  }, [dragState, outerItemIds, renderOrder])
  const activeHiddenDragIds =
    launchpadGridViewMode === 'scroll' ? scrollActiveHiddenDragIds : pagedActiveHiddenDragIds
  const mergedHiddenOuterItemIds = useMemo(
    () => Array.from(new Set([...hiddenOuterItemIds, ...activeHiddenDragIds])),
    [activeHiddenDragIds, hiddenOuterItemIds]
  )
  const hiddenFolderItemIds = useMemo(() => {
    if (!openFolder || !dragState) return new Set<string>()
    const openFolderChildIdSet = new Set(openFolder.children.map(child => child.key))
    return new Set(dragState.draggingIds.filter(id => openFolderChildIdSet.has(id)))
  }, [dragState, openFolder])
  const multiDragStackItems = useMemo(() => {
    if (!dragState || dragState.draggingIds.length <= 1 || dragState.draggingItem.kind !== 'icon') {
      return []
    }
    const dragItemById = new Map(itemById)
    draggedFolderChildSelections.forEach(children => {
      children.forEach(child => dragItemById.set(child.key, child))
    })
    return dragState.draggingIds.slice(1).flatMap(id => {
      const item = dragItemById.get(id)
      const sourceCenter = dragState.initialCenters[id]
      if (!item || item.kind !== 'icon' || !sourceCenter) return []
      return [{ id, icon: item.icon, sourceCenter }]
    })
  }, [dragState, draggedFolderChildSelections, itemById])

  return {
    activeScrollGridSection,
    canGoLeft: currentPage > 0,
    canGoRight: currentPage < pageCount - 1,
    ghostItem: dragState ? dragState.draggingItem : null,
    gridHeight: rows * itemHeight + Math.max(0, rows - 1) * GRID_GAP,
    gridWidth: columns * itemWidth + Math.max(0, columns - 1) * GRID_GAP,
    hiddenFolderItemIds,
    mergedHiddenOuterItemIds,
    multiDragStackItems,
    pageAnchorEntries,
    pageItems,
    previewFootprint,
    scrollGridSections,
  }
}
