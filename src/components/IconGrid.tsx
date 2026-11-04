import { useWheelPageStep } from './icon-grid/hooks/useWheelPageStep'
import { LayoutGroup } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { DesktopIcon } from '../types'
import { getIconGridRowHeight, ICON_SIZE_CONFIG } from '../types'
import { useIconStore } from '../stores/iconStore'
import type { GridItem, IconItem } from './icon-grid/model'
import { getId } from './icon-grid/model'
import { DRAG_HOLE_ID, getPageCountBySlots } from './icon-grid/domain/slots'
import { useIconGridDragWorkflow } from './icon-grid/hooks/useIconGridDragWorkflow'
import {
  usePagedIconGridLayout,
  type PagedImportPlacementRequest,
} from './icon-grid/hooks/usePagedIconGridLayout'
import {
  usePagedGridReorderAnimationRefs,
  usePagedGridReorderAnimations,
} from './icon-grid/hooks/usePagedGridReorderAnimations'
import { useFolderGridMeasurement } from './icon-grid/hooks/useFolderGridMeasurement'
import {
  FOLDER_MODAL_MAX_HEIGHT,
  FOLDER_MODAL_MAX_WIDTH,
  FOLDER_PREVIEW_EASING,
} from './icon-grid/views/folderVisualPolicy'
import { resolveDockDisplaySlots, resolveOuterItemIds } from './icon-grid/domain/dock'
import { getPageAnchorEntries } from './icon-grid/domain/topLevelLayout'
import { useGridItemResizeController } from './icon-grid/hooks/useGridItemResizeController'
import {
  applyMultiOuterDropFromSession,
  applyOuterDropFromSession,
} from './icon-grid/domain/dropPolicy'
import { DragOverlays } from './icon-grid/views/DragOverlays'
import { OuterGridView } from './icon-grid/views/OuterGridView'
import { resolveGridPreviewFootprint } from './icon-grid/domain/gridPreviewFootprint'
import { EdgePageHints } from './icon-grid/views/EdgePageHints'
import { FolderModalView } from './icon-grid/views/FolderModalView'
import { DockBar } from './icon-grid/views/DockBar'
import { useDockKeyboardReorder } from './icon-grid/hooks/useDockKeyboardReorder'
import { reconcileHotseatEntries } from './icon-grid/domain/hotseatLayout'
import {
  dissolveFolderInTopLevelLayout,
  getFolderChildSelectionsByIds,
} from './icon-grid/domain/folderPolicy'
import { DragAnnouncementLiveRegion } from './icon-grid/views/DragAnnouncementLiveRegion'
import { useGridGeometryKey } from './icon-grid/hooks/useGridGeometryKey'
import { getPagedGridGeometrySuffix, getPagedGridInsets } from './icon-grid/domain/pagedGridMetrics'
import { usePageBounds } from './icon-grid/hooks/usePageBounds'
import {
  extractDraggedIconsFromSourceFolders,
  filterItemsByIds,
} from './icon-grid/domain/gridItems'
import {
  DRAG_LONG_PRESS_MS,
  DRAG_PENDING_MOVE_TOLERANCE,
  EVASION_REARM_DISTANCE,
  FOLDER_SHARED_LAYOUT_WINDOW_MS,
  GRID_GAP,
  OUTER_DRAG_RULES,
  PAGINATION_ACTIVE_WIDTH,
  PAGINATION_DOT_GAP,
  PAGINATION_DOT_SIZE,
  REORDER_ANIMATION_MS,
  SIDE_ARROW_OFFSET,
} from './icon-grid/constants'

interface IconGridProps {
  icons: DesktopIcon[]
  layoutResetToken: number
  importPlacementRequest?: PagedImportPlacementRequest | null
  /** 翻页指示器距容器底部的像素值；传 0 时按 Dock 开关用默认间距。 */
  paginationBottom?: number
  /** 布局预览期间锁住网格：除翻页外的指针交互全部失效。 */
  interactionLocked?: boolean
}

const EVASION_COOLDOWN_MS = 200

export function IconGrid({
  icons,
  layoutResetToken,
  importPlacementRequest,
  paginationBottom = 0,
  interactionLocked = false,
}: IconGridProps) {
  const {
    iconSize,
    windowMode,
    windowGeometryPending,
    titleLineCount,
    dockEnabled,
    selectionMode,
    selectedIconKeys,
    toggleSelectIcon,
    unselectIcons,
    clearSelection,
    launchApp,
  } = useIconStore()
  const folderPanelRef = useRef<HTMLDivElement>(null)
  const dockContainerRef = useRef<HTMLDivElement>(null)
  const dockGridRef = useRef<HTMLDivElement>(null)
  const dockSlotRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const folderSharedLayoutTimerRef = useRef<number | null>(null)
  const folderCloseRafRef = useRef<number | null>(null)

  const columnWidth = ICON_SIZE_CONFIG[iconSize].columnWidth
  const rowHeight = getIconGridRowHeight(iconSize, titleLineCount)
  const gridInsets = getPagedGridInsets(iconSize, dockEnabled)
  const geometryKey = useGridGeometryKey(
    windowMode,
    iconSize,
    dockEnabled,
    getPagedGridGeometrySuffix(titleLineCount)
  )
  const [hoverPage, setHoverPage] = useState<number | null>(null)
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [activeFolderSharedLayoutId, setActiveFolderSharedLayoutId] = useState<string | null>(null)
  const reorderAnimationRefs = usePagedGridReorderAnimationRefs()
  const { tileRefs, folderTileRefs, dockItemRefs, capturePagedGridItemPositions } =
    reorderAnimationRefs
  const {
    containerRef,
    gridRef,
    itemsRef,
    outerSlotsRef,
    dockKeysRef,
    hotseatEntriesRef,
    currentPageRef,
    pageSizeRef,
    columns,
    rows,
    currentPage,
    setCurrentPage,
    itemWidth,
    itemHeight,
    items,
    setItems,
    importHighlightIds,
    outerSlots,
    setOuterSlots,
    dockKeys,
    setDockKeys,
    hotseatEntries,
    setHotseatEntries,
    layoutDimensionsTracker,
    activeDockKeys,
    outerItemIds,
    pageSize,
    layoutReady,
    handleResizeWidget,
    folderLayoutProfile,
  } = usePagedIconGridLayout({
    icons,
    layoutResetToken,
    importPlacementRequest,
    dockEnabled,
    geometryKey,
    columnWidth,
    rowHeight,
    iconSize,
    windowGeometryPending,
    onBeforeLayoutChange: capturePagedGridItemPositions,
  })

  const clearFolderSharedLayoutTimer = () => {
    if (folderSharedLayoutTimerRef.current === null) return
    window.clearTimeout(folderSharedLayoutTimerRef.current)
    folderSharedLayoutTimerRef.current = null
  }

  const cancelPendingFolderClose = () => {
    if (folderCloseRafRef.current === null) return
    window.cancelAnimationFrame(folderCloseRafRef.current)
    folderCloseRafRef.current = null
  }

  const scheduleFolderSharedLayoutRelease = (folderId: string) => {
    clearFolderSharedLayoutTimer()
    folderSharedLayoutTimerRef.current = window.setTimeout(() => {
      setActiveFolderSharedLayoutId(current => (current === folderId ? null : current))
      folderSharedLayoutTimerRef.current = null
    }, FOLDER_SHARED_LAYOUT_WINDOW_MS)
  }
  const openFolderWithAnimation = (folderId: string) => {
    cancelPendingFolderClose()
    resetFolderGridMeasurement()
    setActiveFolderSharedLayoutId(folderId)
    setOpenFolderId(folderId)
    scheduleFolderSharedLayoutRelease(folderId)
  }

  const closeFolderWithAnimation = () => {
    if (!openFolderId) return

    cancelPendingFolderClose()
    clearFolderSharedLayoutTimer()
    const folderId = openFolderId
    setActiveFolderSharedLayoutId(folderId)
    folderCloseRafRef.current = window.requestAnimationFrame(() => {
      folderCloseRafRef.current = null
      setOpenFolderId(current => (current === folderId ? null : current))
      scheduleFolderSharedLayoutRelease(folderId)
    })
  }
  const closeFolderFromKeyboard = useEffectEvent(closeFolderWithAnimation)

  const closeFolderImmediately = () => {
    cancelPendingFolderClose()
    clearFolderSharedLayoutTimer()
    setActiveFolderSharedLayoutId(null)
    setOpenFolderId(null)
  }
  const itemById = useMemo(() => {
    const map = new Map<string, GridItem>()
    items.forEach(item => map.set(getId(item), item))
    return map
  }, [items])
  const itemResize = useGridItemResizeController({
    items,
    itemsRef,
    setItems,
    outerSlotsRef,
    setOuterSlots,
    dockKeysRef,
    dockEnabled,
    columns,
    pageSizeRef,
    layoutDimensionsTracker,
    onBeforeLayoutChange: capturePagedGridItemPositions,
  })
  const { plan: folderResizePreviewPlan, renderItemById } = itemResize
  const dockKeyboard = useDockKeyboardReorder({
    dockKeys,
    setDockKeys,
    hotseatEntries,
    setHotseatEntries,
  })

  const openFolder = useMemo(() => {
    if (!openFolderId) return null
    const found = items.find(item => item.kind === 'folder' && item.id === openFolderId)
    return found && found.kind === 'folder' ? found : null
  }, [items, openFolderId])
  const visibleOpenFolderId = openFolder?.id ?? null
  const visibleActiveFolderSharedLayoutId = visibleOpenFolderId ? activeFolderSharedLayoutId : null

  const folderItemById = useMemo(() => {
    const map = new Map<string, IconItem>()
    if (!openFolder) return map
    openFolder.children.forEach(child => map.set(child.key, child))
    return map
  }, [openFolder])

  const folderOrder = useMemo(
    () => openFolder?.children.map(child => child.key) ?? [],
    [openFolder]
  )
  const {
    folderGridContainerRef,
    folderGridRef,
    folderItemWidth,
    folderItemHeight,
    folderColumns,
    resetFolderGridMeasurement,
  } = useFolderGridMeasurement({
    open: openFolder !== null,
    renderOrderLength: folderOrder.length,
    columnWidth,
    rowHeight,
  })
  const selectedSet = useMemo(() => new Set(selectedIconKeys), [selectedIconKeys])
  const iconConfig = ICON_SIZE_CONFIG[iconSize]
  const {
    dragState,
    dragRef,
    dragPointerRef,
    folderDropFlight,
    multiDropFlight,
    dropImpact,
    folderPreviewFreezeTargetId,
    folderCreateTransitionTargetId,
    hiddenOuterItemIds,
    frozenOuterOrder,
    keyboard: keyboardWorkflow,
    handleTilePointerDown,
    handleFolderTilePointerDown,
    handleDockItemPointerDown,
    handleTileClickCapture,
    clearOuterDragInteractionForPageSwitch,
    syncDockDragPreview,
    edgePaging,
    clearEdgeSwitchTimer,
  } = useIconGridDragWorkflow({
    config: {
      gridGap: GRID_GAP,
      dragLongPressMs: DRAG_LONG_PRESS_MS,
      dragPendingMoveTolerance: DRAG_PENDING_MOVE_TOLERANCE,
      evasionRearmDistance: EVASION_REARM_DISTANCE,
      evasionCooldownMs: EVASION_COOLDOWN_MS,
      evasionDwellMs: OUTER_DRAG_RULES.evasionDwellMs,
      reorderAnimationMs: REORDER_ANIMATION_MS,
    },
    selectionMode,
    selectedIconKeys,
    unselectIcons,
    iconConfig,
    columns,
    rows,
    itemWidth,
    itemHeight,
    folderColumns,
    folderItemWidth,
    folderItemHeight,
    folderLayoutProfile,
    itemById,
    containerRef,
    gridRef,
    folderPanelRef,
    folderGridRef,
    onBeforeOuterPreviewChange: capturePagedGridItemPositions,
    onOpenFolder: openFolderWithAnimation,
    dockContainerRef,
    dockGridRef,
    tileRefs,
    folderTileRefs,
    dockSlotRefs,
    dockItemRefs,
    itemsRef,
    setItems,
    outerSlotsRef,
    dockKeysRef,
    hotseatEntriesRef,
    setOuterSlots,
    setDockKeys,
    setHotseatEntries,
    currentPageRef,
    setCurrentPage,
    pageSizeRef,
    pageCount: getPageCountBySlots(outerSlots, pageSize, layoutReady),
    openFolderId: visibleOpenFolderId,
    setOpenFolderId,
  })
  const activeDragIdSet = useMemo(() => new Set(dragState?.draggingIds ?? []), [dragState])
  const isSingleDragActive = dragState !== null && dragState.draggingIds.length === 1
  const folderRenderOrder =
    dragState && dragState.context === 'folder' ? dragState.workingOrder : folderOrder
  const hiddenDockDraggingIds = useMemo(
    () =>
      activeDockKeys.filter(
        (key): key is string => typeof key === 'string' && activeDragIdSet.has(key)
      ),
    [activeDockKeys, activeDragIdSet]
  )
  const dockWorkingOrder =
    dragState?.context === 'dock' && hiddenDockDraggingIds.length > 0
      ? dragState.workingOrder.map(slot => (slot === DRAG_HOLE_ID ? null : slot))
      : null
  const dockRenderSlots = useMemo(
    () =>
      resolveDockDisplaySlots({
        dockKeys: activeDockKeys,
        draggingKeys: hiddenDockDraggingIds,
        previewIndex: dragState?.context === 'dock' ? (dragState.dockPreviewIndex ?? null) : null,
        workingOrder: dockWorkingOrder,
        showPlaceholderWhenEmpty: true,
      }),
    [
      activeDockKeys,
      hiddenDockDraggingIds,
      dragState?.context,
      dragState?.dockPreviewIndex,
      dockWorkingOrder,
    ]
  )
  const draggedFolderChildSelections = useMemo(
    () =>
      dragState
        ? getFolderChildSelectionsByIds(items, dragState.draggingIds)
        : new Map<string, IconItem[]>(),
    [dragState, items]
  )
  const outerViewItemById = useMemo(() => {
    if (!dragState || draggedFolderChildSelections.size === 0) {
      return renderItemById
    }
    const draggingIconIdSet = new Set(dragState.draggingIds)
    if (draggingIconIdSet.size === 0) return renderItemById
    const next = new Map(renderItemById)
    draggedFolderChildSelections.forEach((_children, folderId) => {
      const folderEntryId = `folder:${folderId}`
      const folder = next.get(folderEntryId)
      if (!folder || folder.kind !== 'folder') return
      const nextChildren = folder.children.filter(child => !draggingIconIdSet.has(child.key))
      if (nextChildren.length === 0) {
        next.delete(folderEntryId)
        return
      }
      next.set(folderEntryId, { ...folder, children: nextChildren })
    })
    return next
  }, [dragState, draggedFolderChildSelections, renderItemById])
  const outerPreviewSpillOrder = useMemo(() => {
    if (!dragState || dragState.context !== 'outer') return null
    if (dragState.folderPreviewTargetId !== null) return null
    if (dragState.previewSlotIndex === null) return null
    const baseForPreview = extractDraggedIconsFromSourceFolders(items, dragState.draggingIds)
    const previewBaseItemIdSet = new Set(
      resolveOuterItemIds(baseForPreview.map(getId), activeDockKeys)
    )
    dragState.draggingIds.forEach(id => {
      previewBaseItemIdSet.add(id)
    })
    const previewBaseItems = filterItemsByIds(baseForPreview, Array.from(previewBaseItemIdSet))
    const projected =
      dragState.draggingIds.length > 1
        ? applyMultiOuterDropFromSession({
            base: previewBaseItems,
            session: dragState,
            pageSize,
            columns,
            resolveNearestSlotIndexByContext: () => dragState.previewSlotIndex,
            mode: 'paged',
            sourceSlots: outerSlots,
          })
        : applyOuterDropFromSession({
            base: previewBaseItems,
            session: dragState,
            pageSize,
            columns,
            resolveNearestSlotIndexByContext: () => dragState.previewSlotIndex,
            mode: 'paged',
            sourceSlots: outerSlots,
          })
    const draggingIdSet = new Set(dragState.draggingIds)
    const normalizedWorkingOrder = dragState.workingOrder.map(slot => {
      if (slot === DRAG_HOLE_ID) return null
      if (typeof slot === 'string' && draggingIdSet.has(slot)) return null
      return slot
    })
    const anchorIndex = dragState.previewSlotIndex
    const pageStart = Math.floor(anchorIndex / pageSize) * pageSize
    const pageEnd = pageStart + pageSize
    const nextLength = Math.max(projected.slots.length, normalizedWorkingOrder.length, pageEnd)
    const nextOrder = Array.from(
      { length: nextLength },
      (_, index) => projected.slots[index] ?? null
    )
    const currentPageIds = new Set<string>()

    for (let index = pageStart; index < pageEnd; index += 1) {
      const slot = normalizedWorkingOrder[index] ?? null
      nextOrder[index] = slot
      if (typeof slot === 'string') {
        currentPageIds.add(slot)
      }
    }
    for (let index = 0; index < nextOrder.length; index += 1) {
      if (index >= pageStart && index < pageEnd) continue
      const slot = nextOrder[index]
      if (typeof slot === 'string' && (currentPageIds.has(slot) || draggingIdSet.has(slot))) {
        nextOrder[index] = null
      }
    }

    return nextOrder
  }, [activeDockKeys, columns, dragState, items, outerSlots, pageSize])

  const renderOrder = useMemo(() => {
    if (dragState?.context === 'outer') {
      return outerPreviewSpillOrder ?? dragState.workingOrder
    }
    const baseOrder = frozenOuterOrder ?? folderResizePreviewPlan?.slots ?? outerSlots
    if (dragState?.context === 'dock' && dragState.draggingIds.length > 0) {
      const dragIdSet = new Set(dragState.draggingIds)
      return baseOrder.map(slot => (slot && dragIdSet.has(slot) ? null : slot))
    }
    return baseOrder
  }, [dragState, folderResizePreviewPlan, frozenOuterOrder, outerPreviewSpillOrder, outerSlots])

  useEffect(() => {
    if (!visibleOpenFolderId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (dragRef.current?.context === 'folder') {
        event.preventDefault()
        return
      }
      event.preventDefault()
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      closeFolderFromKeyboard()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dragRef, visibleOpenFolderId])

  const pageCount = getPageCountBySlots(renderOrder, pageSize, layoutReady)
  usePageBounds(currentPage, pageCount, hoverPage, setCurrentPage, setHoverPage, currentPageRef)

  const stepPageByWheelDelta = useWheelPageStep({
    pageCount,
    currentPageRef,
    setCurrentPage,
    clearEdgeSwitchTimer,
    clearOuterDragInteractionForPageSwitch,
  })

  const handleWheelPageSwitch = (event: ReactWheelEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('[data-dock]')) return

    const isOuterDrag = dragState?.context === 'outer'
    if (openFolder && !isOuterDrag) return
    if (dragState && dragState.context !== 'outer') return

    const primaryDelta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
    if (Math.abs(primaryDelta) < 0.1) return
    event.preventDefault()
    stepPageByWheelDelta(primaryDelta, isOuterDrag)
  }

  const handleDissolveFolder = (folderId: string) => {
    const result = dissolveFolderInTopLevelLayout(
      itemsRef.current,
      outerSlotsRef.current,
      dockKeysRef.current,
      folderId,
      { columns: Math.max(1, columns), pageSize: Math.max(1, pageSizeRef.current) }
    )
    if (!result) return

    itemsRef.current = result.items
    outerSlotsRef.current = result.outerSlots
    dockKeysRef.current = result.dockKeys
    setItems(result.items)
    setOuterSlots(result.outerSlots)
    setDockKeys(result.dockKeys)
    if (openFolderId === folderId) {
      closeFolderImmediately()
    }
  }

  const pageItems = useMemo(() => {
    const start = currentPage * pageSize
    const currentSlice = [...renderOrder.slice(start, start + pageSize)]
    if (currentSlice.length < pageSize) {
      currentSlice.push(...Array.from({ length: pageSize - currentSlice.length }, () => null))
    }
    return currentSlice
  }, [renderOrder, currentPage, pageSize])
  const pageAnchorEntries = useMemo(
    () =>
      getPageAnchorEntries(
        renderOrder,
        Array.from(outerViewItemById.values()),
        currentPage,
        pageSize,
        columns
      ),
    [columns, currentPage, outerViewItemById, pageSize, renderOrder]
  )
  const previewFootprint = useMemo(() => {
    if (dragState?.context !== 'outer') return null
    return resolveGridPreviewFootprint({
      anchorIndex: dragState.previewSlotIndex,
      currentPage,
      columns,
      folderPreviewTargetId: dragState.folderPreviewTargetId,
      item: dragState.draggingItem,
      items: Array.from(outerViewItemById.values()),
      pageSize,
      slots: renderOrder,
    })
  }, [columns, currentPage, dragState, outerViewItemById, pageSize, renderOrder])

  usePagedGridReorderAnimations({
    animationRefs: reorderAnimationRefs,
    activeDragIdSet,
    pageItems,
    itemWidth,
    itemHeight,
    openFolder,
    folderRenderOrder,
    folderColumns,
    folderItemWidth,
    folderItemHeight,
    dropImpact,
  })
  useEffect(() => {
    return () => {
      clearFolderSharedLayoutTimer()
      cancelPendingFolderClose()
      clearEdgeSwitchTimer()
    }
  }, [clearEdgeSwitchTimer])

  const gridWidth = columns * itemWidth + Math.max(0, columns - 1) * GRID_GAP
  const gridHeight = rows * itemHeight + Math.max(0, rows - 1) * GRID_GAP
  const ghostItem = dragState ? dragState.draggingItem : null
  const activeHiddenDragIds = useMemo(() => {
    if (!dragState) {
      return []
    }
    const outerItemIdSet = new Set(outerItemIds)
    return dragState.draggingIds.filter(id => outerItemIdSet.has(id))
  }, [dragState, outerItemIds])
  const mergedHiddenOuterItemIds = useMemo(
    () => Array.from(new Set([...hiddenOuterItemIds, ...activeHiddenDragIds])),
    [activeHiddenDragIds, hiddenOuterItemIds]
  )
  const hiddenFolderItemIds = useMemo(() => {
    if (!openFolder || !dragState) {
      return new Set<string>()
    }
    const openFolderChildIdSet = new Set(openFolder.children.map(child => child.key))
    return new Set(dragState.draggingIds.filter(id => openFolderChildIdSet.has(id)))
  }, [dragState, openFolder])
  const multiDragStackItems = useMemo(() => {
    if (!dragState || dragState.draggingIds.length <= 1 || dragState.draggingItem.kind !== 'icon') {
      return []
    }

    const dragItemById = new Map(itemById)
    draggedFolderChildSelections.forEach(children => {
      children.forEach(child => {
        dragItemById.set(child.key, child)
      })
    })

    return dragState.draggingIds.slice(1).flatMap(id => {
      const item = dragItemById.get(id)
      const sourceCenter = dragState.initialCenters[id]
      if (!item || item.kind !== 'icon' || !sourceCenter) {
        return []
      }
      return [{ id, icon: item.icon, size: item.size, sourceCenter }]
    })
  }, [dragState, draggedFolderChildSelections, itemById])
  const canGoLeft = layoutReady && currentPage > 0
  const canGoRight = currentPage < pageCount - 1
  return (
    <LayoutGroup id="folder-shell-layout">
      <div
        data-edge-paging-viewport
        aria-busy={!layoutReady}
        data-single-item-dragging={isSingleDragActive ? 'true' : 'false'}
        className="relative h-full w-full overflow-x-clip"
        style={{
          paddingInline: gridInsets.horizontal,
          paddingTop: `var(--paged-grid-top, ${gridInsets.top}px)`,
          paddingBottom: `var(--paged-grid-bottom, ${gridInsets.bottom}px)`,
        }}
        onWheel={handleWheelPageSwitch}
      >
        <DragAnnouncementLiveRegion
          dragState={dragState}
          itemById={itemById}
          folderLayoutProfile={folderLayoutProfile}
          pageSize={pageSize}
        />
        <EdgePageHints
          drag={dragState}
          page={currentPage}
          pageSize={pageSize}
          containerRef={containerRef}
          folderOpen={!!openFolder}
          paging={edgePaging}
        />
        <div
          ref={containerRef}
          className="flex h-full w-full items-start justify-center"
          style={{ visibility: layoutReady ? 'visible' : 'hidden' }}
        >
          <OuterGridView
            edgePaging={edgePaging}
            gridRef={gridRef}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            columns={columns}
            rows={rows}
            itemWidth={itemWidth}
            itemHeight={itemHeight}
            gridGap={GRID_GAP}
            pageCellCount={pageSize}
            currentPage={currentPage}
            pageAnchorEntries={pageAnchorEntries}
            pageOrder={renderOrder}
            dragContext={dragState?.context === 'dock' ? null : (dragState?.context ?? null)}
            dragPreviewSlotIndex={
              dragState?.context === 'outer'
                ? (dragState.previewSlotIndex ?? null)
                : (dragState?.previewSlotIndex ?? null)
            }
            dragFolderPreviewTargetId={dragState?.folderPreviewTargetId ?? null}
            folderPreviewFreezeTargetId={folderPreviewFreezeTargetId}
            folderCreateTransitionTargetId={folderCreateTransitionTargetId}
            hiddenOuterItemIds={mergedHiddenOuterItemIds}
            highlightedOuterItemIds={importHighlightIds}
            {...keyboardWorkflow}
            previewFootprint={previewFootprint}
            iconConfig={iconConfig}
            selectionMode={selectionMode}
            selectedSet={selectedSet}
            openFolderId={visibleOpenFolderId}
            activeFolderSharedLayoutId={visibleActiveFolderSharedLayoutId}
            onToggleSelectIcon={toggleSelectIcon}
            onTilePointerDown={handleTilePointerDown}
            onTileClickCapture={handleTileClickCapture}
            onOpenFolder={openFolderWithAnimation}
            onLaunchIcon={path => {
              void launchApp(path)
            }}
            {...itemResize.folderResizeProps}
            onResizeWidget={handleResizeWidget}
            onDissolveFolder={handleDissolveFolder}
            bindTileRef={(id, node) => {
              if (node) tileRefs.current.set(id, node)
              else tileRefs.current.delete(id)
            }}
            reorderAnimationMs={REORDER_ANIMATION_MS}
          />
        </div>

        {/* 左右翻页按钮：垂直居中于容器（翻的是整个网格，不应跟随网格内容高度），
            水平贴网格内容左右缘外 sideArrowOffset 处（网格居中，位置用 calc 推导）。 */}
        {canGoLeft ? (
          <button
            type="button"
            aria-label="Previous page"
            className="absolute top-1/2 z-[55] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/78 text-foreground/80 shadow-[0_8px_24px_rgba(15,23,42,0.1)] backdrop-blur-sm transition-colors hover:bg-background/92 dark:border-white/25 dark:bg-black/35 dark:text-white/85 dark:hover:bg-black/55"
            style={{ left: `calc(50% - ${gridWidth / 2 + SIDE_ARROW_OFFSET}px)` }}
            onClick={() => {
              const nextPage = Math.max(0, currentPage - 1)
              currentPageRef.current = nextPage
              setCurrentPage(nextPage)
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        {canGoRight ? (
          <button
            type="button"
            aria-label="Next page"
            className="absolute top-1/2 z-[55] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/78 text-foreground/80 shadow-[0_8px_24px_rgba(15,23,42,0.1)] backdrop-blur-sm transition-colors hover:bg-background/92 dark:border-white/25 dark:bg-black/35 dark:text-white/85 dark:hover:bg-black/55"
            style={{ right: `calc(50% - ${gridWidth / 2 + SIDE_ARROW_OFFSET}px)` }}
            onClick={() => {
              const nextPage = Math.min(pageCount - 1, currentPage + 1)
              currentPageRef.current = nextPage
              setCurrentPage(nextPage)
            }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}

        {/* 分页指示器：按 Dock 实际顶边预留间隔；网格底部另留安全距离，
            不随网格内容高度（行数/图标尺寸）浮动。
            paginationBottom 非 0 时以它为准：布局抽屉展开时指示器要抬到抽屉上方。 */}
        <div
          data-pagination
          className="absolute left-1/2 z-[55] -translate-x-1/2 px-3 py-1.5"
          style={{
            bottom:
              paginationBottom > 0
                ? paginationBottom
                : `var(--paged-pagination-bottom, ${gridInsets.paginationBottom}px)`,
          }}
          onMouseLeave={() => setHoverPage(null)}
        >
          <div className="flex items-center" style={{ columnGap: `${PAGINATION_DOT_GAP}px` }}>
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
                  onMouseEnter={() => setHoverPage(index)}
                  onClick={() => {
                    currentPageRef.current = index
                    setCurrentPage(index)
                  }}
                  className={`relative rounded-full transition-all duration-250 ease-out ${
                    isCurrent
                      ? 'bg-foreground/88 shadow-[0_0_10px_rgba(15,23,42,0.25)] dark:bg-white/95 dark:shadow-[0_0_10px_rgba(255,255,255,0.75)]'
                      : isHovered
                        ? 'bg-foreground/45 dark:bg-white/55'
                        : 'bg-foreground/25 hover:bg-foreground/35 dark:bg-white/35 dark:hover:bg-white/45'
                  }`}
                  style={{
                    width: `${shouldExpand ? PAGINATION_ACTIVE_WIDTH : PAGINATION_DOT_SIZE}px`,
                    height: `${PAGINATION_DOT_SIZE}px`,
                  }}
                />
              )
            })}
          </div>
        </div>

        {dockEnabled ? (
          <DockBar
            displaySlots={dockRenderSlots}
            hotseatEntries={hotseatEntries}
            itemById={outerViewItemById}
            dockPreviewIndex={dragState?.dockPreviewIndex ?? null}
            dragContext={dragState?.context ?? null}
            dragFolderPreviewTargetId={dragState?.folderPreviewTargetId ?? null}
            folderPreviewFreezeTargetId={folderPreviewFreezeTargetId}
            folderCreateTransitionTargetId={folderCreateTransitionTargetId}
            dragPointerRef={dragPointerRef}
            iconImageSize={iconConfig.imgSize}
            iconTileWidth={itemWidth}
            iconTileHeight={itemHeight}
            selectionMode={selectionMode}
            selectedSet={selectedSet}
            onToggleSelectIcon={toggleSelectIcon}
            openFolderId={visibleOpenFolderId}
            activeFolderSharedLayoutId={visibleActiveFolderSharedLayoutId}
            bindDockContainerRef={node => {
              dockContainerRef.current = node
            }}
            bindDockGridRef={node => {
              dockGridRef.current = node
            }}
            bindDockSlotRef={(index, node) => {
              if (node) dockSlotRefs.current.set(index, node)
              else dockSlotRefs.current.delete(index)
            }}
            bindDockItemRef={(id, node) => {
              if (node) dockItemRefs.current.set(id, node)
              else dockItemRefs.current.delete(id)
            }}
            onDockItemPointerDown={handleDockItemPointerDown}
            onDockKeyboardKeyDown={dockKeyboard.handleKeyDown}
            dockKeyboardActiveId={dockKeyboard.activeId}
            onDockItemClickCapture={handleTileClickCapture}
            onDockAutoScroll={syncDockDragPreview}
            onLaunchIcon={path => {
              void launchApp(path)
            }}
            onOpenFolder={openFolderWithAnimation}
            onRemoveItem={key => {
              const nextDockKeys = dockKeys.filter(entry => entry !== key)
              setDockKeys(nextDockKeys)
              setHotseatEntries(reconcileHotseatEntries(hotseatEntries, nextDockKeys))
            }}
          />
        ) : null}

        {/* 布局预览的遮罩：挡住图标、Dock、文件夹弹层的所有指针事件。
            必须留在根节点内部——滚轮翻页的 onWheel 挂在根上，遮罩放到外层
            会把 wheel 拦在网格子树外面，剩按钮能翻、滚轮失效。
            顶部留 64px 给窗口控制按钮（最小化/关闭不是布局功能，得能按）；
            翻页按钮与指示器 z-[55] 在遮罩之上，点击照常可用。 */}
        {interactionLocked ? (
          <div
            data-layout-preview-shield
            className="absolute inset-x-0 bottom-0 top-16 z-50 cursor-default"
            onContextMenu={event => {
              event.preventDefault()
              event.stopPropagation()
            }}
          />
        ) : null}

        <FolderModalView
          openFolder={openFolder}
          activeFolderSharedLayoutId={visibleActiveFolderSharedLayoutId}
          dragContext={dragState?.context === 'dock' ? null : (dragState?.context ?? null)}
          selectionMode={selectionMode}
          selectedSet={selectedSet}
          hiddenItemIds={hiddenFolderItemIds}
          onToggleSelectIcon={toggleSelectIcon}
          folderPanelRef={folderPanelRef}
          folderGridContainerRef={folderGridContainerRef}
          folderGridRef={folderGridRef}
          folderColumns={folderColumns}
          folderItemWidth={folderItemWidth}
          folderItemHeight={folderItemHeight}
          folderRenderOrder={folderRenderOrder}
          folderItemById={folderItemById}
          bindFolderTileRef={(id, node) => {
            if (node) folderTileRefs.current.set(id, node)
            else folderTileRefs.current.delete(id)
          }}
          onBackdropClose={event => {
            event.stopPropagation()
            if (event.target !== event.currentTarget) return
            if (dragState?.context === 'folder') return
            closeFolderWithAnimation()
          }}
          onPanelPointerDown={event => {
            event.stopPropagation()
          }}
          onPanelClick={event => {
            event.stopPropagation()
            if (selectionMode) {
              clearSelection()
            }
          }}
          onClose={closeFolderWithAnimation}
          onRenameFolder={(folderId, name) => {
            const nextItems = itemsRef.current.map(item =>
              item.kind === 'folder' && item.id === folderId ? { ...item, name } : item
            )
            itemsRef.current = nextItems
            setItems(nextItems)
          }}
          onActivateIcon={icon => {
            void launchApp(icon.icon.path).finally(() => {
              closeFolderImmediately()
            })
          }}
          onFolderTilePointerDown={handleFolderTilePointerDown}
          onTileClickCapture={handleTileClickCapture}
          maxModalWidth={FOLDER_MODAL_MAX_WIDTH}
          maxModalHeight={FOLDER_MODAL_MAX_HEIGHT}
        />

        <DragOverlays
          dragPointerRef={dragPointerRef}
          ghostItem={ghostItem}
          iconImageSize={iconConfig.imgSize}
          slotWidth={itemWidth}
          slotHeight={itemHeight}
          gridGap={GRID_GAP}
          dragSessionId={dragState?.dragStartedAt ?? null}
          compactPreview={false}
          stackedIcons={multiDragStackItems}
          folderDropFlight={folderDropFlight}
          multiDropFlight={multiDropFlight}
          reorderAnimationMs={REORDER_ANIMATION_MS}
          folderPreviewEasing={FOLDER_PREVIEW_EASING}
        />
      </div>
    </LayoutGroup>
  )
}
