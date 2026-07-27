import { LayoutGroup } from 'framer-motion'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { DesktopIcon } from '../types'
import { getIconGridLayoutRowHeight, getIconGridRowHeight, ICON_SIZE_CONFIG } from '../types'
import { useIconStore } from '../stores/iconStore'
import { getId, type GridItem, type IconItem } from './icon-grid/model'
import { DRAG_HOLE_ID } from './icon-grid/domain/slots'
import { clampNumber } from './icon-grid/domain/geometry'
import type { DragState } from './icon-grid/state/types'
import { useScrollableIconGridDragWorkflow } from './icon-grid/scroll/useScrollableIconGridDragWorkflow'
import {
  useScrollableIconGridLayout,
  type ScrollImportPlacementRequest,
} from './icon-grid/scroll/useScrollableIconGridLayout'
import { useScrollableGridReorderAnimations } from './icon-grid/scroll/useScrollableGridReorderAnimations'
import { useScrollGroupController } from './icon-grid/scroll/useScrollGroupController'
import { useScrollableIconGridViewModel } from './icon-grid/scroll/useScrollableIconGridViewModel'
import {
  useScrollableFolderController,
  useScrollableFolderKeyboardDismiss,
} from './icon-grid/scroll/useScrollableFolderController'
import {
  FOLDER_MODAL_MAX_HEIGHT,
  FOLDER_MODAL_MAX_WIDTH,
  FOLDER_PREVIEW_EASING,
} from './icon-grid/views/folderVisualPolicy'
import { resolveDockDisplaySlots, resolveOuterItemIds } from './icon-grid/domain/dock'
import {
  buildScrollGroupDragPreviewOrder,
  commitScrollFolderCreation,
  commitScrollGroupDragResult,
  resolveScrollSidebarGhostSize,
} from './icon-grid/scroll/scrollGroupLayout'
import {
  applyMultiOuterDropFromSession,
  applyOuterDropFromSession,
} from './icon-grid/scroll/scrollDropPolicy'
import { DragOverlays } from './icon-grid/views/DragOverlays'
import { OuterGridView } from './icon-grid/views/OuterGridView'
import { ScrollableOuterGridView } from './icon-grid/views/ScrollableOuterGridView'
import { EdgeGlow } from './icon-grid/views/EdgeGlow'
import { FolderModalView } from './icon-grid/views/FolderModalView'
import { DockBar } from './icon-grid/views/DockBar'
import { getFolderChildSelectionsByIds } from './icon-grid/domain/folderPolicy'
import { buildGridGeometryKey as buildGeometryKey } from './icon-grid/domain/gridGeometry'
import {
  extractDraggedIconsFromSourceFolders,
  filterItemsByIds,
} from './icon-grid/domain/gridItems'
import {
  DRAG_EDGE_SWITCH_MS,
  DRAG_EDGE_SWITCH_ZONE,
  DRAG_LONG_PRESS_MS,
  DRAG_PENDING_MOVE_TOLERANCE,
  EVASION_REARM_DISTANCE,
  GRID_GAP,
  PAGINATION_ACTIVE_WIDTH,
  PAGINATION_DOT_GAP,
  PAGINATION_DOT_SIZE,
  PAGINATION_OFFSET,
  REORDER_ANIMATION_MS,
  SIDE_ARROW_OFFSET,
  WHEEL_PAGE_COOLDOWN_MS,
  WHEEL_PAGE_DELTA_THRESHOLD,
} from './icon-grid/constants'

interface IconGridProps {
  icons: DesktopIcon[]
  layoutResetToken: number
  sidebarCompact?: boolean
  onToggleSidebarCompact?: () => void
  addIconDisabled?: boolean
  onAddIcon?: (targetGroupId: string) => void
  importPlacementRequest?: ScrollImportPlacementRequest | null
}

const EVASION_COOLDOWN_MS = 120
const getOccupiedPageCountForSlots = (slots: Array<string | null>, pageSize: number) => {
  const safePageSize = Math.max(1, pageSize)
  let lastOccupiedIndex = -1
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const slot = slots[index]
    if (typeof slot !== 'string' || slot === DRAG_HOLE_ID) continue
    lastOccupiedIndex = index
    break
  }
  return Math.max(1, Math.ceil((lastOccupiedIndex + 1) / safePageSize))
}

export function ScrollableIconGrid({
  icons,
  layoutResetToken,
  sidebarCompact = false,
  onToggleSidebarCompact = () => {},
  addIconDisabled = false,
  onAddIcon,
  importPlacementRequest,
}: IconGridProps) {
  const {
    iconSize,
    windowMode,
    launchpadGridViewMode,
    dockEnabled,
    selectionMode,
    selectedIconKeys,
    toggleSelectIcon,
    unselectIcons,
    clearSelection,
    launchApp,
  } = useIconStore()
  const dockContainerRef = useRef<HTMLDivElement>(null)
  const dockGridRef = useRef<HTMLDivElement>(null)
  const scrollGridPageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const externalScrollPreviewSnapshotRef = useRef<{
    groupId: string
    itemIds: string[]
    draggingIds: string[]
  } | null>(null)
  const folderTileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dockSlotRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dockItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const wheelDeltaRef = useRef(0)
  const wheelCooldownUntilRef = useRef(0)

  const columnWidth = ICON_SIZE_CONFIG[iconSize].columnWidth
  const layoutRowHeight = getIconGridLayoutRowHeight(iconSize)
  const rowHeight = getIconGridRowHeight(iconSize)
  const geometryKey =
    launchpadGridViewMode === 'scroll'
      ? `${buildGeometryKey(windowMode, iconSize, dockEnabled)}:scroll`
      : buildGeometryKey(windowMode, iconSize, dockEnabled)
  const {
    activeDockKeys,
    captureScrollGridItemPositions,
    columns,
    containerRef,
    currentPage,
    currentPageRef,
    dockKeysRef,
    gridRef,
    importHighlightIds,
    itemHeight,
    items,
    itemsRef,
    itemWidth,
    layoutDimensionsTracker,
    outerItemIds,
    outerSlots,
    outerSlotsRef,
    pageSize,
    pageSizeRef,
    rows,
    scrollGridPendingFlipPositionsRef,
    scrollGroups,
    scrollGroupsRef,
    setCurrentPage,
    setDockKeys,
    setItems,
    setOuterSlots,
    setScrollGroups,
  } = useScrollableIconGridLayout({
    icons,
    layoutResetToken,
    importPlacementRequest,
    dockEnabled,
    launchpadGridViewMode,
    geometryKey,
    columnWidth,
    rowHeight,
    layoutRowHeight,
    sidebarCompact,
    tileRefs,
  })
  const [hoverPage, setHoverPage] = useState<number | null>(null)
  const scrollGroupCount = Math.max(1, scrollGroups.length)

  const itemById = useMemo(() => {
    const map = new Map<string, GridItem>()
    items.forEach(item => map.set(getId(item), item))
    return map
  }, [items])

  const {
    closeFolderImmediately,
    closeFolderWithAnimation,
    folderColumns,
    folderGridContainerRef,
    folderGridRef,
    folderItemById,
    folderItemHeight,
    folderItemWidth,
    folderOrder,
    folderPanelRef,
    handleResizeFolder,
    openFolder,
    openFolderWithAnimation,
    setOpenFolderId,
    visibleActiveFolderSharedLayoutId,
    visibleOpenFolderId,
  } = useScrollableFolderController({
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
    columnWidth,
    rowHeight,
  })
  const selectedSet = useMemo(() => new Set(selectedIconKeys), [selectedIconKeys])
  const iconConfig = ICON_SIZE_CONFIG[iconSize]
  const captureFinishedScrollDrag = useCallback(
    (
      session: DragState,
      _folderCreateTargetId: string | null,
      sourceFolderReplacementId: string | null
    ) => {
      if (launchpadGridViewMode !== 'scroll') return
      const snapshot = externalScrollPreviewSnapshotRef.current
      const currentGroups = scrollGroupsRef.current
      const snapshotMatchesSession = Boolean(
        snapshot &&
        snapshot.draggingIds.length === session.draggingIds.length &&
        snapshot.draggingIds.every((id, index) => id === session.draggingIds[index])
      )
      const fallbackGroup = currentGroups[currentPageRef.current]
      const targetGroupId = (snapshotMatchesSession ? snapshot?.groupId : null) ?? fallbackGroup?.id
      if (!targetGroupId) return
      const targetGroup = currentGroups.find(group => group.id === targetGroupId)
      if (!targetGroup) return

      const availableItemIds = resolveOuterItemIds(
        itemsRef.current.map(getId),
        dockEnabled ? dockKeysRef.current : []
      )
      const fallbackPreviewItemIds = buildScrollGroupDragPreviewOrder({
        groupItemIds: targetGroup.itemIds,
        workingOrder: session.scrollGroupOrder ?? session.workingOrder,
        draggingIds: session.draggingIds,
        availableIds: new Set([
          ...availableItemIds,
          ...targetGroup.itemIds,
          ...session.draggingIds,
        ]),
      })
      const sourceFolderEntryId = session.sourceFolderId ? `folder:${session.sourceFolderId}` : null
      const replacementById =
        sourceFolderEntryId && !availableItemIds.includes(sourceFolderEntryId)
          ? { [sourceFolderEntryId]: sourceFolderReplacementId }
          : undefined
      const nextGroups = commitScrollGroupDragResult({
        groups: currentGroups,
        targetGroupId,
        previewItemIds:
          snapshotMatchesSession && snapshot ? snapshot.itemIds : fallbackPreviewItemIds,
        availableItemIds,
        draggingIds: session.draggingIds,
        replacementById,
      })
      externalScrollPreviewSnapshotRef.current = null
      if (nextGroups === currentGroups) return
      captureScrollGridItemPositions()
      scrollGroupsRef.current = nextGroups
      setScrollGroups(nextGroups)
    },
    [
      captureScrollGridItemPositions,
      currentPageRef,
      dockEnabled,
      dockKeysRef,
      itemsRef,
      launchpadGridViewMode,
      scrollGroupsRef,
      setScrollGroups,
    ]
  )

  const captureRenderedScrollPreview = useCallback(
    (groupId: string, itemIds: string[], draggingIds: string[]) => {
      externalScrollPreviewSnapshotRef.current = {
        groupId,
        itemIds,
        draggingIds,
      }
    },
    []
  )

  const commitCreatedFolderToScrollGroup = useCallback(
    (session: DragState, createdFolderId: string, targetId: string) => {
      if (launchpadGridViewMode !== 'scroll') return
      const currentGroups = scrollGroupsRef.current
      const nextGroups = commitScrollFolderCreation({
        groups: currentGroups,
        previewItemIds: session.scrollGroupOrder,
        sourceIds: session.draggingIds,
        targetId,
        folderId: createdFolderId,
      })
      externalScrollPreviewSnapshotRef.current = null
      if (nextGroups === currentGroups) return
      captureScrollGridItemPositions()
      const targetPosition = scrollGridPendingFlipPositionsRef.current?.get(targetId)
      if (targetPosition) {
        scrollGridPendingFlipPositionsRef.current?.set(createdFolderId, targetPosition)
      }
      scrollGroupsRef.current = nextGroups
      setScrollGroups(nextGroups)
    },
    [
      captureScrollGridItemPositions,
      launchpadGridViewMode,
      scrollGridPendingFlipPositionsRef,
      scrollGroupsRef,
      setScrollGroups,
    ]
  )

  const {
    dragState,
    dragRef,
    dragPointerRef,
    folderDropFlight,
    multiDropFlight,
    folderPreviewFreezeTargetId,
    folderCreateTransitionTargetId,
    hiddenOuterItemIds,
    frozenOuterOrder,
    handleTilePointerDown,
    handleFolderTilePointerDown,
    handleDockItemPointerDown,
    handleTileClickCapture,
    clearEdgeSwitchTimer,
    clearOuterDragInteractionForPageSwitch,
    retargetOuterDragToScrollGroup,
    syncOuterDragPreview,
    syncDockDragPreview,
    dragEdgeDirection,
  } = useScrollableIconGridDragWorkflow({
    config: {
      gridGap: GRID_GAP,
      dragEdgeSwitchZone: DRAG_EDGE_SWITCH_ZONE,
      dragEdgeSwitchMs: DRAG_EDGE_SWITCH_MS,
      dragLongPressMs: DRAG_LONG_PRESS_MS,
      dragPendingMoveTolerance: DRAG_PENDING_MOVE_TOLERANCE,
      evasionRearmDistance: EVASION_REARM_DISTANCE,
      evasionCooldownMs: EVASION_COOLDOWN_MS,
      reorderAnimationMs: REORDER_ANIMATION_MS,
    },
    selectionMode,
    selectedIconKeys,
    unselectIcons,
    iconConfig,
    columns,
    rows,
    outerDropMode: launchpadGridViewMode === 'scroll' ? 'compact-page' : 'paged',
    getOuterMinPageCount: launchpadGridViewMode === 'scroll' ? () => scrollGroupCount : undefined,
    itemWidth,
    itemHeight,
    folderColumns,
    folderItemWidth,
    folderItemHeight,
    folderOrderLength: folderOrder.length,
    itemById,
    containerRef,
    gridRef,
    folderPanelRef,
    folderGridRef,
    getOuterGridElementAtPoint:
      launchpadGridViewMode === 'scroll'
        ? (x, y) => {
            const activePageIndex = currentPageRef.current
            const activeElement = scrollGridPageRefs.current.get(activePageIndex)
            if (activeElement) {
              const rect = activeElement.getBoundingClientRect()
              if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return { element: activeElement, pageIndex: activePageIndex }
              }
            }

            const entries = Array.from(scrollGridPageRefs.current.entries()).sort(
              ([a], [b]) => a - b
            )
            for (const [pageIndex, element] of entries) {
              const rect = element.getBoundingClientRect()
              if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
              return { element, pageIndex }
            }
            return null
          }
        : undefined,
    getActiveScrollGroupItemIds:
      launchpadGridViewMode === 'scroll'
        ? () => scrollGroupsRef.current[currentPageRef.current]?.itemIds ?? []
        : undefined,
    onBeforeOuterPreviewChange: captureScrollGridItemPositions,
    onOuterDragFinished: captureFinishedScrollDrag,
    onFolderCreateCommitted: commitCreatedFolderToScrollGroup,
    onOpenFolder: openFolderWithAnimation,
    onCloseFolder: closeFolderWithAnimation,
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
    setOuterSlots,
    setDockKeys,
    currentPageRef,
    setCurrentPage,
    pageSizeRef,
    openFolderId: visibleOpenFolderId,
    setOpenFolderId,
  })
  const activeDragIdSet = useMemo(() => new Set(dragState?.draggingIds ?? []), [dragState])
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
  useScrollableFolderKeyboardDismiss({
    openFolderId: visibleOpenFolderId,
    dragRef,
    onClose: closeFolderWithAnimation,
  })

  const draggedFolderChildSelections = useMemo(
    () =>
      dragState
        ? getFolderChildSelectionsByIds(items, dragState.draggingIds)
        : new Map<string, IconItem[]>(),
    [dragState, items]
  )

  const outerViewItemById = useMemo(() => {
    if (!dragState || draggedFolderChildSelections.size === 0) {
      return itemById
    }
    const draggingIconIdSet = new Set(dragState.draggingIds)
    if (draggingIconIdSet.size === 0) return itemById

    const next = new Map(itemById)
    draggedFolderChildSelections.forEach((children, folderId) => {
      children.forEach(child => {
        next.set(child.key, child)
      })

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
  }, [dragState, draggedFolderChildSelections, itemById])

  const outerPreviewSpillOrder = useMemo(() => {
    if (!dragState || dragState.context !== 'outer') return null
    if (launchpadGridViewMode === 'scroll') {
      return dragState.workingOrder.map(slot => (slot === DRAG_HOLE_ID ? null : slot))
    }
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
  }, [activeDockKeys, columns, dragState, items, launchpadGridViewMode, outerSlots, pageSize])

  const renderOrder = useMemo(() => {
    if (dragState?.context === 'outer') {
      return outerPreviewSpillOrder ?? dragState.workingOrder
    }
    const baseOrder = frozenOuterOrder ?? outerSlots
    if (dragState?.context === 'dock' && dragState.draggingIds.length > 0) {
      const dragIdSet = new Set(dragState.draggingIds)
      return baseOrder.map(slot => (slot && dragIdSet.has(slot) ? null : slot))
    }
    return baseOrder
  }, [dragState, frozenOuterOrder, outerPreviewSpillOrder, outerSlots])

  useEffect(() => {
    scrollGridPageRefs.current.clear()
  }, [launchpadGridViewMode, pageSize, scrollGroupCount])

  const outerRenderCount = Math.max(pageSize, renderOrder.length)
  const layoutPageCount =
    launchpadGridViewMode === 'scroll'
      ? getOccupiedPageCountForSlots(renderOrder, pageSize)
      : Math.max(1, Math.ceil(outerRenderCount / pageSize))
  const pageCount =
    launchpadGridViewMode === 'scroll' ? Math.max(1, scrollGroupCount) : layoutPageCount
  if (currentPage >= pageCount) setCurrentPage(pageCount - 1)
  if (hoverPage !== null && hoverPage >= pageCount) setHoverPage(null)

  const handleWheelPageSwitch = (event: ReactWheelEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('[data-dock]')) return

    const isOuterDrag = dragState?.context === 'outer'
    if (openFolder && !isOuterDrag) return
    if (dragState && dragState.context !== 'outer') return
    if (pageCount <= 1) return

    const primaryDelta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
    if (Math.abs(primaryDelta) < 0.1) return
    event.preventDefault()

    const now = performance.now()
    if (now < wheelCooldownUntilRef.current) return

    if (
      wheelDeltaRef.current !== 0 &&
      Math.sign(wheelDeltaRef.current) !== Math.sign(primaryDelta)
    ) {
      wheelDeltaRef.current = 0
    }
    wheelDeltaRef.current += primaryDelta
    if (Math.abs(wheelDeltaRef.current) < WHEEL_PAGE_DELTA_THRESHOLD) return

    const direction = wheelDeltaRef.current > 0 ? 1 : -1
    wheelDeltaRef.current = 0
    wheelCooldownUntilRef.current = now + WHEEL_PAGE_COOLDOWN_MS

    const nextPage = clampNumber(currentPageRef.current + direction, 0, pageCount - 1)
    if (nextPage === currentPageRef.current) return
    clearEdgeSwitchTimer()

    if (isOuterDrag) {
      clearOuterDragInteractionForPageSwitch()
    }

    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
  }

  const {
    handleAddScrollGroup,
    handleCommitScrollGroupItemOrder,
    handleDeleteScrollGroup,
    handleEditScrollGroup,
    handleMergeScrollGroupItems,
    handleMoveScrollGroupItem,
    handleMoveScrollGroupItemToDock,
    handleReorderScrollGroup,
    handleScrollGridActivePageChange,
    scrollSidebarDragActive,
    scrollSidebarHoveredGroupId,
  } = useScrollGroupController({
    launchpadGridViewMode,
    dragState,
    dragPointerRef,
    containerRef,
    pageCount,
    currentPageRef,
    setCurrentPage,
    scrollGroupsRef,
    setScrollGroups,
    itemsRef,
    setItems,
    dockKeysRef,
    setDockKeys,
    externalScrollPreviewSnapshotRef,
    retargetOuterDragToScrollGroup,
    syncOuterDragPreview,
  })
  const {
    activeScrollGridSection,
    canGoLeft,
    canGoRight,
    ghostItem,
    gridHeight,
    gridWidth,
    hiddenFolderItemIds,
    mergedHiddenOuterItemIds,
    multiDragStackItems,
    pageAnchorEntries,
    pageItems,
    previewFootprint,
    scrollGridSections,
  } = useScrollableIconGridViewModel({
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
  })

  useScrollableGridReorderAnimations({
    tileRefs,
    folderTileRefs,
    dockItemRefs,
    pageItems,
    currentPage,
    columns,
    itemWidth,
    itemHeight,
    launchpadGridViewMode,
    openFolder,
    folderRenderOrder,
    folderColumns,
    folderItemWidth,
    folderItemHeight,
    dockRenderSlots,
    dockIconImageSize: iconConfig.imgSize,
  })

  useEffect(() => () => clearEdgeSwitchTimer(), [clearEdgeSwitchTimer])

  return (
    <LayoutGroup id="folder-shell-layout">
      <div
        className={
          launchpadGridViewMode === 'scroll'
            ? 'scroll-grid-shell relative h-full w-full'
            : `relative h-full w-full px-16 pt-24 ${dockEnabled ? 'pb-32' : 'pb-12'}`
        }
        onWheel={launchpadGridViewMode === 'paged' ? handleWheelPageSwitch : undefined}
      >
        {launchpadGridViewMode === 'scroll' ? (
          <ScrollableOuterGridView
            containerRef={containerRef}
            dockEnabled={dockEnabled}
            sidebarCompact={sidebarCompact}
            onToggleSidebarCompact={onToggleSidebarCompact}
            gridWidth={gridWidth}
            columns={columns}
            itemWidth={itemWidth}
            itemHeight={itemHeight}
            gridGap={GRID_GAP}
            sections={scrollGridSections}
            activeSection={activeScrollGridSection}
            currentPage={currentPage}
            dragHoveredGroupId={scrollSidebarHoveredGroupId}
            dragContext={dragState?.context === 'dock' ? null : (dragState?.context ?? null)}
            dragFolderPreviewTargetId={dragState?.folderPreviewTargetId ?? null}
            folderPreviewFreezeTargetId={folderPreviewFreezeTargetId}
            folderCreateTransitionTargetId={folderCreateTransitionTargetId}
            hiddenOuterItemIds={mergedHiddenOuterItemIds}
            highlightedOuterItemIds={importHighlightIds}
            iconConfig={iconConfig}
            selectionMode={selectionMode}
            selectedSet={selectedSet}
            openFolderId={visibleOpenFolderId}
            activeFolderSharedLayoutId={visibleActiveFolderSharedLayoutId}
            onActivePageChange={handleScrollGridActivePageChange}
            onAddGroup={handleAddScrollGroup}
            onEditGroup={handleEditScrollGroup}
            onReorderGroup={handleReorderScrollGroup}
            onCommitItemOrder={handleCommitScrollGroupItemOrder}
            onMoveItemToGroup={handleMoveScrollGroupItem}
            onMoveItemToDock={handleMoveScrollGroupItemToDock}
            onMergeItems={handleMergeScrollGroupItems}
            addIconDisabled={addIconDisabled}
            onAddIcon={onAddIcon}
            onDeleteGroup={handleDeleteScrollGroup}
            onToggleSelectIcon={toggleSelectIcon}
            onTilePointerDown={handleTilePointerDown}
            onTileClickCapture={handleTileClickCapture}
            onOpenFolder={openFolderWithAnimation}
            onLaunchIcon={path => {
              void launchApp(path)
            }}
            onResizeFolder={handleResizeFolder}
            bindTileRef={(id, node) => {
              if (node) tileRefs.current.set(id, node)
              else tileRefs.current.delete(id)
            }}
            bindGridPageRef={(page, node) => {
              if (node) {
                scrollGridPageRefs.current.set(page, node)
                if (page === currentPageRef.current) {
                  gridRef.current = node
                }
              } else {
                scrollGridPageRefs.current.delete(page)
                if (page === currentPageRef.current) {
                  gridRef.current = null
                }
              }
            }}
            externalGridFlipPositionsRef={scrollGridPendingFlipPositionsRef}
            reorderAnimationMs={REORDER_ANIMATION_MS}
          />
        ) : (
          <>
            <EdgeGlow direction="left" active={dragEdgeDirection === 'left'} />
            <EdgeGlow direction="right" active={dragEdgeDirection === 'right'} />
            <div ref={containerRef} className="flex h-full w-full items-center justify-center">
              <OuterGridView
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
                onResizeFolder={handleResizeFolder}
                bindTileRef={(id, node) => {
                  if (node) tileRefs.current.set(id, node)
                  else tileRefs.current.delete(id)
                }}
                reorderAnimationMs={REORDER_ANIMATION_MS}
                canGoLeft={canGoLeft}
                canGoRight={canGoRight}
                sideArrowOffset={SIDE_ARROW_OFFSET}
                onGoLeft={() => {
                  const nextPage = Math.max(0, currentPage - 1)
                  currentPageRef.current = nextPage
                  setCurrentPage(nextPage)
                }}
                onGoRight={() => {
                  const nextPage = Math.min(pageCount - 1, currentPage + 1)
                  currentPageRef.current = nextPage
                  setCurrentPage(nextPage)
                }}
                paginationOffset={PAGINATION_OFFSET}
                paginationDotGap={PAGINATION_DOT_GAP}
                paginationDotSize={PAGINATION_DOT_SIZE}
                paginationActiveWidth={PAGINATION_ACTIVE_WIDTH}
                pageCount={pageCount}
                hoverPage={hoverPage}
                onHoverPage={setHoverPage}
                onSwitchPage={index => {
                  currentPageRef.current = index
                  setCurrentPage(index)
                }}
              />
            </div>
          </>
        )}

        {dockEnabled ? (
          <DockBar
            alignToContentColumn={launchpadGridViewMode === 'scroll'}
            displaySlots={dockRenderSlots}
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
            onDockItemClickCapture={handleTileClickCapture}
            onDockAutoScroll={syncDockDragPreview}
            onLaunchIcon={path => {
              void launchApp(path)
            }}
            onOpenFolder={openFolderWithAnimation}
            onRemoveItem={key => {
              setDockKeys(current => current.filter(entry => entry !== key))
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
          compactPreview={scrollSidebarDragActive}
          compactPreviewSize={resolveScrollSidebarGhostSize(sidebarCompact ? 56 : 44)}
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
