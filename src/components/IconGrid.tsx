import { LayoutGroup } from 'framer-motion'
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { DesktopIcon } from '../types'
import { getIconGridLayoutRowHeight, getIconGridRowHeight, ICON_SIZE_CONFIG } from '../types'
import { useIconStore } from '../stores/iconStore'
import type { FolderItem, FolderSize, GridItem, IconItem } from './icon-grid/model'
import { getGridItemSpan, getId } from './icon-grid/model'
import { compactEmptyPages, DRAG_HOLE_ID } from './icon-grid/domain/slots'
import { clampNumber } from './icon-grid/domain/geometry'
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
import {
  buildPersistedItemCoordinates,
  canPlaceItemAtAnchorIndex,
  findBestResizeAnchorIndex,
  getFootprintIndices,
  getPageAnchorEntries,
  normalizeOuterSlots,
  resizeSlotPages,
} from './icon-grid/domain/topLevelLayout'
import {
  applyMultiOuterDropFromSession,
  applyOuterDropFromSession,
} from './icon-grid/domain/dropPolicy'
import { DragOverlays } from './icon-grid/views/DragOverlays'
import { OuterGridView } from './icon-grid/views/OuterGridView'
import { EdgeGlow } from './icon-grid/views/EdgeGlow'
import { FolderModalView } from './icon-grid/views/FolderModalView'
import { DockBar } from './icon-grid/views/DockBar'
import {
  dissolveFolderInTopLevelLayout,
  getFolderChildSelectionsByIds,
} from './icon-grid/domain/folderPolicy'
import {
  buildGridGeometryKey as buildGeometryKey,
  getLayoutNormalizationMetrics,
} from './icon-grid/domain/gridGeometry'
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
  FOLDER_SHARED_LAYOUT_WINDOW_MS,
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
  importPlacementRequest?: PagedImportPlacementRequest | null
}

const EVASION_DWELL_MS = 100
const EVASION_COOLDOWN_MS = 200

export function IconGrid({ icons, layoutResetToken, importPlacementRequest }: IconGridProps) {
  const {
    iconSize,
    windowMode,
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
  const wheelDeltaRef = useRef(0)
  const wheelCooldownUntilRef = useRef(0)
  const folderSharedLayoutTimerRef = useRef<number | null>(null)
  const folderCloseRafRef = useRef<number | null>(null)

  const columnWidth = ICON_SIZE_CONFIG[iconSize].columnWidth
  const layoutRowHeight = getIconGridLayoutRowHeight(iconSize)
  const rowHeight = getIconGridRowHeight(iconSize)
  const geometryKey = buildGeometryKey(windowMode, iconSize, dockEnabled)
  const [hoverPage, setHoverPage] = useState<number | null>(null)
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [activeFolderSharedLayoutId, setActiveFolderSharedLayoutId] = useState<string | null>(null)
  const {
    containerRef,
    gridRef,
    itemsRef,
    outerSlotsRef,
    dockKeysRef,
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
    setDockKeys,
    layoutDimensionsTracker,
    activeDockKeys,
    outerItemIds,
    pageSize,
  } = usePagedIconGridLayout({
    icons,
    layoutResetToken,
    importPlacementRequest,
    dockEnabled,
    geometryKey,
    columnWidth,
    rowHeight,
    layoutRowHeight,
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
  const reorderAnimationRefs = usePagedGridReorderAnimationRefs()
  const { tileRefs, folderTileRefs, dockItemRefs, capturePagedGridItemPositions } =
    reorderAnimationRefs

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
    syncDockDragPreview,
    dragEdgeDirection,
  } = useIconGridDragWorkflow({
    config: {
      gridGap: GRID_GAP,
      dragEdgeSwitchZone: DRAG_EDGE_SWITCH_ZONE,
      dragEdgeSwitchMs: DRAG_EDGE_SWITCH_MS,
      dragLongPressMs: DRAG_LONG_PRESS_MS,
      dragPendingMoveTolerance: DRAG_PENDING_MOVE_TOLERANCE,
      evasionRearmDistance: EVASION_REARM_DISTANCE,
      evasionCooldownMs: EVASION_COOLDOWN_MS,
      evasionDwellMs: EVASION_DWELL_MS,
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
    folderOrderLength: folderOrder.length,
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
  }, [dragState, draggedFolderChildSelections, itemById])

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
    const baseOrder = frozenOuterOrder ?? outerSlots
    if (dragState?.context === 'dock' && dragState.draggingIds.length > 0) {
      const dragIdSet = new Set(dragState.draggingIds)
      return baseOrder.map(slot => (slot && dragIdSet.has(slot) ? null : slot))
    }
    return baseOrder
  }, [dragState, frozenOuterOrder, outerPreviewSpillOrder, outerSlots])

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

  const outerRenderCount = Math.max(pageSize, renderOrder.length)
  const pageCount = Math.max(1, Math.ceil(outerRenderCount / pageSize))
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

  const handleResizeFolder = (folderId: string, size: FolderSize) => {
    const resizedFolderEntryId = `folder:${folderId}`
    const prevItems = itemsRef.current
    const prevOuterItemIds = resolveOuterItemIds(
      prevItems.map(getId),
      dockEnabled ? dockKeysRef.current : []
    )
    const prevOuterItems = filterItemsByIds(prevItems, prevOuterItemIds)
    const prevFolder = prevItems.find(
      (item): item is FolderItem => item.kind === 'folder' && item.id === folderId
    )
    if (!prevFolder || prevFolder.size === size) return

    const nextItems = itemsRef.current.map(item =>
      item.kind === 'folder' && item.id === folderId ? { ...item, size } : item
    )
    const nextDockKeys = dockKeysRef.current
    const nextOuterItemIds = resolveOuterItemIds(
      nextItems.map(getId),
      dockEnabled ? nextDockKeys : []
    )
    const outerItems = filterItemsByIds(nextItems, nextOuterItemIds)
    const layoutMetrics = getLayoutNormalizationMetrics(
      outerItems,
      Math.max(1, columns),
      pageSizeRef.current
    )
    const safePS = Math.max(1, layoutMetrics.pageSize)
    const safeCols = Math.max(1, layoutMetrics.columns)

    const layoutDimensions = layoutDimensionsTracker.read()
    const baseOuterSlots =
      layoutDimensions.pageSize === safePS && layoutDimensions.columns === safeCols
        ? [...outerSlotsRef.current]
        : resizeSlotPages(
            outerSlotsRef.current,
            prevOuterItems,
            layoutDimensions.pageSize,
            safePS,
            layoutDimensions.columns,
            safeCols,
            buildPersistedItemCoordinates(
              outerSlotsRef.current,
              prevOuterItems,
              layoutDimensions.pageSize,
              layoutDimensions.columns
            )
          )

    const originalAnchorIndex = baseOuterSlots.indexOf(resizedFolderEntryId)
    const preferredAnchorIndex =
      originalAnchorIndex >= 0
        ? findBestResizeAnchorIndex({
            slots: baseOuterSlots,
            items: prevOuterItems,
            itemId: resizedFolderEntryId,
            currentAnchorIndex: originalAnchorIndex,
            currentSpan: getGridItemSpan(prevFolder),
            nextSpan: getGridItemSpan({ ...prevFolder, size }),
            columns: safeCols,
            pageSize: safePS,
          })
        : null
    const preferredAnchorById =
      preferredAnchorIndex !== null &&
      preferredAnchorIndex < Math.max(safePS, baseOuterSlots.length)
        ? new Map([[resizedFolderEntryId, preferredAnchorIndex]])
        : undefined

    let effectiveBaseOuterSlots: Array<string | null> = baseOuterSlots
    const finalAnchorIndex = preferredAnchorIndex ?? originalAnchorIndex
    if (finalAnchorIndex >= 0) {
      const newSpan = getGridItemSpan({ ...prevFolder, size })
      const footprint = getFootprintIndices(finalAnchorIndex, newSpan, safeCols, safePS)
      if (footprint) {
        const footprintSet = new Set(footprint)
        const folderPageStart = Math.floor(finalAnchorIndex / safePS) * safePS
        const folderPageEnd = folderPageStart + safePS

        let displacedCount = 0
        for (let i = folderPageStart; i < folderPageEnd; i += 1) {
          if (!footprintSet.has(i)) continue
          const slot = effectiveBaseOuterSlots[i]
          if (slot && slot !== resizedFolderEntryId) displacedCount += 1
        }

        let nextPageVacant = 0
        for (let i = folderPageEnd; i < folderPageEnd + safePS; i += 1) {
          const slot = effectiveBaseOuterSlots[i]
          if (slot === undefined || slot === null) nextPageVacant += 1
        }

        if (displacedCount > nextPageVacant) {
          effectiveBaseOuterSlots = [
            ...effectiveBaseOuterSlots.slice(0, folderPageEnd),
            ...Array.from({ length: safePS }, () => null as string | null),
            ...effectiveBaseOuterSlots.slice(folderPageEnd),
          ]
        }
      }
    }

    const nextOuterSlots = normalizeOuterSlots(
      effectiveBaseOuterSlots,
      outerItems,
      safePS,
      safeCols,
      {
        preferredAnchorById,
        spillStrategy: 'row-major-forward',
      }
    )

    const compactedOuterSlots = compactEmptyPages(nextOuterSlots, safePS)

    itemsRef.current = nextItems
    outerSlotsRef.current = compactedOuterSlots
    setItems(nextItems)
    setOuterSlots(compactedOuterSlots)
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
    if (dragState.previewSlotIndex === null || dragState.folderPreviewTargetId) return null
    const span = getGridItemSpan(dragState.draggingItem)
    if (span.cols > 1 || span.rows > 1) return null
    if (
      !canPlaceItemAtAnchorIndex(
        renderOrder,
        Array.from(outerViewItemById.values()),
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
    return {
      row: Math.floor(localIndex / columns),
      col: localIndex % columns,
      span,
    }
  }, [columns, currentPage, dragState, outerViewItemById, pageSize, renderOrder])

  usePagedGridReorderAnimations({
    animationRefs: reorderAnimationRefs,
    activeDragIdSet,
    pageItems,
    openFolder,
    folderRenderOrder,
    folderColumns,
    folderItemWidth,
    folderItemHeight,
    dockRenderSlots,
    dockIconImageSize: iconConfig.imgSize,
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
      return [{ id, icon: item.icon, sourceCenter }]
    })
  }, [dragState, draggedFolderChildSelections, itemById])
  const canGoLeft = currentPage > 0
  const canGoRight = currentPage < pageCount - 1

  return (
    <LayoutGroup id="folder-shell-layout">
      <div
        className={`relative h-full w-full px-16 pt-24 ${dockEnabled ? 'pb-32' : 'pb-12'}`}
        onWheel={handleWheelPageSwitch}
      >
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
            onDissolveFolder={handleDissolveFolder}
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

        {dockEnabled ? (
          <DockBar
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
