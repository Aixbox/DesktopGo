import { LayoutGroup } from 'framer-motion'
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { DesktopIcon } from '../types'
import { getIconGridLayoutRowHeight, getIconGridRowHeight, ICON_SIZE_CONFIG } from '../types'
import { useIconStore } from '../stores/iconStore'
import type { FolderItem, FolderSize, GridItem, IconItem, PersistedLayout } from './icon-grid/model'
import { getGridItemSpan, getId } from './icon-grid/model'
import { compactEmptyPages, DRAG_HOLE_ID, areSlotsEqual } from './icon-grid/domain/slots'
import { clampNumber } from './icon-grid/domain/geometry'
import {
  hydrateDockKeys,
  hydrateItems,
  readLayout,
  serializeItems,
  writeLayout,
} from './icon-grid/services/layoutStore'
import { useIconGridDragWorkflow } from './icon-grid/hooks/useIconGridDragWorkflow'
import { createLayoutDimensionsTracker } from './icon-grid/state/layoutDimensionsTracker'
import {
  FOLDER_MODAL_MAX_HEIGHT,
  FOLDER_MODAL_MAX_WIDTH,
  FOLDER_PREVIEW_EASING,
} from './icon-grid/views/folderVisualPolicy'
import { DOCK_GAP, resolveDockDisplaySlots, resolveOuterItemIds } from './icon-grid/domain/dock'
import {
  buildPersistedItemCoordinates,
  canPlaceItemAtAnchorIndex,
  findBestResizeAnchorIndex,
  getFootprintIndices,
  getPageAnchorEntries,
  normalizeOuterSlots,
  repairPathologicallySparsePages,
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
import { getFolderChildSelectionsByIds } from './icon-grid/domain/folderPolicy'
import {
  resolveLayoutHydrationSource,
  shouldResetPersistedLayoutCache,
} from './icon-grid/domain/layoutHydrationPolicy'
import {
  buildGridGeometryKey as buildGeometryKey,
  fitGridItemCount as fitCount,
  getDefaultFolderColumnCount,
  getLayoutNormalizationMetrics,
  isSuspiciousSingleCellPageGeometry,
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
  IMPORT_HIGHLIGHT_MS,
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
  importPlacementRequest?: {
    token: number
    iconKeys: string[]
    targetGroupId?: string
  } | null
}

const EVASION_DWELL_MS = 100
const EVASION_COOLDOWN_MS = 200
const REORDER_EASING = 'ease'

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
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const folderPanelRef = useRef<HTMLDivElement>(null)
  const folderGridContainerRef = useRef<HTMLDivElement>(null)
  const folderGridRef = useRef<HTMLDivElement>(null)
  const dockContainerRef = useRef<HTMLDivElement>(null)
  const dockGridRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const pendingGridFlipPositionsRef = useRef<Map<string, { left: number; top: number }> | null>(
    null
  )
  const gridFlipAnimationsRef = useRef<Map<string, Animation>>(new Map())
  const folderTileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dockSlotRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dockItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevFolderEntriesRef = useRef<Array<string | null>>([])
  const prevDockEntriesRef = useRef<Array<string | null>>([])
  const folderTileAnimationTimerRef = useRef<Map<string, number>>(new Map())
  const dockTileAnimationTimerRef = useRef<Map<string, number>>(new Map())
  const importHighlightTimerRef = useRef<number | null>(null)
  const hydratedRef = useRef(false)
  const layoutBaselineRef = useRef(false)
  const persistedDimsRef = useRef<{ pageSize: number; columns: number } | null>(null)
  const persistedCoordinatesRef = useRef<PersistedLayout['coordinates']>(undefined)
  // 已锁定的几何：记录锁定时的 geometryKey 与对应列数/行数。
  // 当前 geometryKey 与之一致时，测量回调丢弃实测值，保持锁定几何。
  const lockedGeometryRef = useRef<{ key: string; columns: number; rows: number } | null>(null)
  const persistedGeometryKeyRef = useRef<string | null>(null)
  const persistedLayoutRef = useRef<PersistedLayout | null>(null)
  const persistedScrollGroupsRef = useRef<PersistedLayout['scrollGroups']>(undefined)
  const persistedLayoutLoadedRef = useRef(false)
  const persistedLayoutLoadPromiseRef = useRef<Promise<PersistedLayout | null> | null>(null)
  const hydratedLayoutResetTokenRef = useRef(layoutResetToken)
  const persistedLayoutResetTokenRef = useRef<number | null>(null)
  const layoutWriteQueueRef = useRef<Promise<void>>(Promise.resolve())
  const appliedImportPlacementTokenRef = useRef<number | null>(null)
  const itemsRef = useRef<GridItem[]>([])
  const outerSlotsRef = useRef<Array<string | null>>([])
  const dockKeysRef = useRef<Array<string | null>>([])
  const currentPageRef = useRef(0)
  const pageSizeRef = useRef(1)
  const layoutReadyRef = useRef(false)
  const wheelDeltaRef = useRef(0)
  const wheelCooldownUntilRef = useRef(0)
  const folderSharedLayoutTimerRef = useRef<number | null>(null)
  const folderCloseRafRef = useRef<number | null>(null)

  const columnWidth = ICON_SIZE_CONFIG[iconSize].columnWidth
  const layoutRowHeight = getIconGridLayoutRowHeight(iconSize)
  const rowHeight = getIconGridRowHeight(iconSize)
  const geometryKey = buildGeometryKey(windowMode, iconSize, dockEnabled)
  const readLayoutHydrationEnvironment = useEffectEvent(() => ({ dockEnabled, geometryKey }))

  const [columns, setColumns] = useState(1)
  const [rows, setRows] = useState(1)
  // 水合完成后自增，强制几何测量回调重跑一次，从而应用持久化/锁定几何。
  const [layoutHydrationTick, setLayoutHydrationTick] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [hoverPage, setHoverPage] = useState<number | null>(null)
  const [itemWidth, setItemWidth] = useState<number>(columnWidth)
  const [itemHeight, setItemHeight] = useState<number>(rowHeight)
  const [items, setItems] = useState<GridItem[]>([])
  const [importHighlightIds, setImportHighlightIds] = useState<string[]>([])
  const [outerSlots, setOuterSlots] = useState<Array<string | null>>([])
  const [dockKeys, setDockKeys] = useState<Array<string | null>>([])
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [activeFolderSharedLayoutId, setActiveFolderSharedLayoutId] = useState<string | null>(null)
  const [folderItemWidth, setFolderItemWidth] = useState<number>(columnWidth)
  const [folderItemHeight, setFolderItemHeight] = useState<number>(rowHeight)
  const [folderColumns, setFolderColumns] = useState<number>(() =>
    getDefaultFolderColumnCount(columnWidth, FOLDER_MODAL_MAX_WIDTH)
  )
  const [layoutDimensionsTracker] = useState(() =>
    createLayoutDimensionsTracker({ pageSize: Math.max(1, columns * rows), columns })
  )

  const clearImportHighlightTimer = () => {
    if (importHighlightTimerRef.current === null) return
    window.clearTimeout(importHighlightTimerRef.current)
    importHighlightTimerRef.current = null
  }

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

  const primeFolderLayoutDefaults = () => {
    setFolderItemWidth(columnWidth)
    setFolderItemHeight(rowHeight)
    setFolderColumns(getDefaultFolderColumnCount(columnWidth, FOLDER_MODAL_MAX_WIDTH))
  }

  const openFolderWithAnimation = (folderId: string) => {
    cancelPendingFolderClose()
    primeFolderLayoutDefaults()
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

  useEffect(() => {
    let cancelled = false
    const hydrationEnvironment = readLayoutHydrationEnvironment()

    const hydrate = async () => {
      if (!hydratedRef.current && icons.length === 0) return

      let persisted: PersistedLayout | null = null
      // 设置页重置布局后，不能继续复用旧内存态，否则下一次写回会把旧排序重新覆盖回来。
      const hydrationSource = resolveLayoutHydrationSource({
        hydrated: hydratedRef.current,
        hydratedResetToken: hydratedLayoutResetTokenRef.current,
        currentResetToken: layoutResetToken,
      })

      if (hydrationSource === 'memory') {
        const layoutDimensions = layoutDimensionsTracker.read()
        persisted = {
          items: serializeItems(itemsRef.current),
          slots: outerSlotsRef.current,
          dockKeys: dockKeysRef.current,
          pageSize: layoutDimensions.pageSize,
          columns: layoutDimensions.columns,
          coordinates: buildPersistedItemCoordinates(
            outerSlotsRef.current,
            itemsRef.current,
            layoutDimensions.pageSize,
            layoutDimensions.columns
          ),
          geometryKey: persistedGeometryKeyRef.current ?? undefined,
        }
      } else {
        if (
          shouldResetPersistedLayoutCache({
            cachedResetToken: persistedLayoutResetTokenRef.current,
            currentResetToken: layoutResetToken,
          })
        ) {
          persistedLayoutRef.current = null
          persistedLayoutLoadedRef.current = false
          persistedLayoutLoadPromiseRef.current = null
          persistedLayoutResetTokenRef.current = layoutResetToken
        }
        if (!persistedLayoutLoadedRef.current) {
          if (!persistedLayoutLoadPromiseRef.current) {
            persistedLayoutLoadPromiseRef.current = readLayout()
          }
          persistedLayoutRef.current = await persistedLayoutLoadPromiseRef.current
          persistedLayoutLoadedRef.current = true
        }
        if (cancelled) return
        persisted = persistedLayoutRef.current
      }

      const nextItems = hydrateItems(icons, persisted?.items ?? null)
      const nextItemIds = nextItems.map(getId)
      const nextDockKeys = hydrationEnvironment.dockEnabled
        ? hydrateDockKeys(nextItemIds, persisted?.dockKeys)
        : []

      const rawSlots = (persisted?.slots ?? []).map(key =>
        key ? key.replace(/^(desktop|customapp):/, '') : null
      )
      const hasDims =
        persisted?.pageSize && persisted?.columns && persisted.pageSize > 1 && persisted.columns > 1
      persistedDimsRef.current = hasDims
        ? { pageSize: persisted!.pageSize!, columns: persisted!.columns! }
        : null
      persistedCoordinatesRef.current = persisted?.coordinates
      persistedGeometryKeyRef.current = persisted?.geometryKey ?? null
      persistedScrollGroupsRef.current = persisted?.scrollGroups
      // 若持久化的几何标识与当前一致，且存有有效列数/行数，则直接锁定该几何，
      // 让测量回调不再用实测值覆盖它——这正是抵御 DPI/分辨率切换的关键。
      // 仅在从持久化水合时重建锁；内存水合（icons 刷新）保留会话内已建立的锁，
      // 避免把 DPI 漂移期的实测值重新锁入。
      if (hydrationSource !== 'memory') {
        if (
          hasDims &&
          persisted?.geometryKey &&
          persisted.geometryKey === hydrationEnvironment.geometryKey
        ) {
          const lockedColumns = persisted!.columns!
          const lockedRows = Math.max(1, Math.round(persisted!.pageSize! / lockedColumns))
          lockedGeometryRef.current = {
            key: persisted!.geometryKey!,
            columns: lockedColumns,
            rows: lockedRows,
          }
        } else {
          lockedGeometryRef.current = null
        }
      }
      layoutBaselineRef.current = false

      itemsRef.current = nextItems
      outerSlotsRef.current = rawSlots
      dockKeysRef.current = nextDockKeys
      setItems(nextItems)
      setOuterSlots(rawSlots)
      setDockKeys(nextDockKeys)
      hydratedRef.current = true
      hydratedLayoutResetTokenRef.current = layoutResetToken
      // 强制几何测量回调重跑，使锁定几何（若有）在本次水合后立即生效。
      setLayoutHydrationTick(tick => tick + 1)
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [icons, layoutDimensionsTracker, layoutResetToken])

  useEffect(() => {
    return () => {
      clearImportHighlightTimer()
    }
  }, [])

  useEffect(() => {
    itemsRef.current = items
    outerSlotsRef.current = outerSlots
    dockKeysRef.current = dockKeys
    if (!hydratedRef.current || !layoutBaselineRef.current) return

    const nextItems = items
    const nextSlots = outerSlots
    const nextDockKeys = dockKeys
    const layoutDimensions = layoutDimensionsTracker.read()
    const nextPageSize = layoutDimensions.pageSize
    const nextColumns = layoutDimensions.columns
    if (nextPageSize === 1 && nextColumns === 1) {
      return
    }
    const nextGeometryKey = lockedGeometryRef.current?.key ?? geometryKey
    layoutWriteQueueRef.current = layoutWriteQueueRef.current
      .then(() =>
        writeLayout(
          nextItems,
          nextSlots,
          nextDockKeys,
          nextPageSize,
          nextColumns,
          nextGeometryKey,
          persistedScrollGroupsRef.current
        )
      )
      .catch(e => {
        console.error('Failed to persist launchpad layout:', e)
      })
  }, [dockKeys, geometryKey, items, layoutDimensionsTracker, outerSlots])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

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

  const itemIds = useMemo(() => items.map(getId), [items])
  const itemLayoutSignature = useMemo(
    () =>
      items.map(item => (item.kind === 'folder' ? `${item.id}:${item.size}` : item.key)).join('|'),
    [items]
  )
  const folderOrder = useMemo(
    () => openFolder?.children.map(child => child.key) ?? [],
    [openFolder]
  )
  const selectedSet = useMemo(() => new Set(selectedIconKeys), [selectedIconKeys])
  const iconConfig = ICON_SIZE_CONFIG[iconSize]
  const activeDockKeys = useMemo(() => (dockEnabled ? dockKeys : []), [dockEnabled, dockKeys])
  const outerItemIds = useMemo(
    () => resolveOuterItemIds(itemIds, activeDockKeys),
    [activeDockKeys, itemIds]
  )
  const pageSize = Math.max(1, columns * rows)

  const capturePagedGridItemPositions = useCallback(() => {
    const positions = new Map<string, { left: number; top: number }>()
    tileRefs.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect()
      positions.set(id, { left: rect.left, top: rect.top })
    })
    pendingGridFlipPositionsRef.current = positions

    // Preserve the current visual positions above, then remove old transforms so the next
    // layout measurement sees the actual destination rects.
    gridFlipAnimationsRef.current.forEach(animation => animation.cancel())
    gridFlipAnimationsRef.current.clear()
  }, [])

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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let raf = 0
    const recalc = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      const tileWidth = columnWidth
      const tileHeight = rowHeight
      const hasWideItems = itemsRef.current.some(item => getGridItemSpan(item).cols > 1)
      const hasTallItems = itemsRef.current.some(item => getGridItemSpan(item).rows > 1)
      const minRows = hasTallItems ? 2 : 1
      const baseRows = Math.max(minRows, fitCount(height, layoutRowHeight))
      const nextRowGridHeight = (baseRows + 1) * tileHeight + baseRows * GRID_GAP
      const resolvedRows = !dockEnabled && nextRowGridHeight <= height ? baseRows + 1 : baseRows
      const nextColumns = Math.max(hasWideItems ? 2 : 1, fitCount(width, tileWidth))
      const nextPageSize = Math.max(1, nextColumns * resolvedRows)

      const locked = lockedGeometryRef.current
      const isLockedForCurrentGeometry = locked !== null && locked.key === geometryKey

      let finalColumns: number
      let finalRows: number
      if (isLockedForCurrentGeometry) {
        // 几何已锁定：丢弃实测值（DPI/分辨率切换会让实测值漂移甚至瞬时归零），
        // 始终沿用锁定的列数/行数，保证图标位置绝对不动。
        finalColumns = locked!.columns
        finalRows = locked!.rows
      } else {
        // 未锁定（首次运行，或窗口模式/图标大小/Dock 主动变更）：采用实测值。
        // 此时实测的异常单格几何应被忽略，避免把坏值锁进去。
        if (
          isSuspiciousSingleCellPageGeometry({
            columns: nextColumns,
            rows: resolvedRows,
            pageSize: nextPageSize,
          })
        ) {
          return
        }
        finalColumns = nextColumns
        finalRows = resolvedRows
        lockedGeometryRef.current = { key: geometryKey, columns: finalColumns, rows: finalRows }
      }

      setItemWidth(tileWidth)
      setItemHeight(tileHeight)
      setColumns(finalColumns)
      setRows(finalRows)
      layoutReadyRef.current = true
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(recalc)
    }

    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    if (gridRef.current) observer.observe(gridRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [
    columnWidth,
    dockEnabled,
    layoutRowHeight,
    rowHeight,
    itemLayoutSignature,
    currentPage,
    geometryKey,
    layoutHydrationTick,
  ])

  useEffect(() => {
    const container = folderGridContainerRef.current
    if (!container || !openFolder) return

    let raf = 0
    const recalc = () => {
      const first = folderGridRef.current?.querySelector<HTMLElement>('[data-folder-grid-item]')
      const tileWidth = first?.offsetWidth ?? columnWidth
      const tileHeight = first?.offsetHeight ?? rowHeight
      setFolderItemWidth(tileWidth)
      setFolderItemHeight(tileHeight)
      // Use max available width (panel max minus padding) to calculate columns,
      // so panel can then shrink to fit the actual column count.
      setFolderColumns(getDefaultFolderColumnCount(tileWidth, FOLDER_MODAL_MAX_WIDTH))
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(recalc)
    }

    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    if (folderGridRef.current) observer.observe(folderGridRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [openFolder, folderRenderOrder.length, columnWidth, rowHeight])

  useEffect(() => {
    pageSizeRef.current = pageSize
  }, [pageSize])

  useEffect(() => {
    if (!hydratedRef.current || !layoutReadyRef.current) return
    const outerItems = filterItemsByIds(itemsRef.current, outerItemIds)
    const layoutMetrics = getLayoutNormalizationMetrics(outerItems, Math.max(1, columns), pageSize)
    const previousDimensions = layoutDimensionsTracker.read()
    layoutDimensionsTracker.update({
      pageSize: layoutMetrics.pageSize,
      columns: layoutMetrics.columns,
    })
    const currentCoordinates = buildPersistedItemCoordinates(
      outerSlotsRef.current,
      outerItems,
      previousDimensions.pageSize,
      previousDimensions.columns
    )

    let result: Array<string | null>
    if (!layoutBaselineRef.current) {
      const dims = persistedDimsRef.current
      if (dims) {
        result = resizeSlotPages(
          outerSlotsRef.current,
          outerItems,
          dims.pageSize,
          layoutMetrics.pageSize,
          dims.columns,
          layoutMetrics.columns,
          persistedCoordinatesRef.current ?? null
        )
      } else {
        result = normalizeOuterSlots(
          outerSlotsRef.current,
          outerItems,
          layoutMetrics.pageSize,
          layoutMetrics.columns
        )
      }
      layoutBaselineRef.current = true
    } else {
      result = resizeSlotPages(
        outerSlotsRef.current,
        outerItems,
        previousDimensions.pageSize,
        layoutMetrics.pageSize,
        previousDimensions.columns,
        layoutMetrics.columns,
        currentCoordinates
      )
    }
    const repaired = repairPathologicallySparsePages(
      result,
      outerItems,
      layoutMetrics.pageSize,
      layoutMetrics.columns
    )
    const compacted = compactEmptyPages(repaired, layoutMetrics.pageSize)

    if (areSlotsEqual(compacted, outerSlotsRef.current)) return
    outerSlotsRef.current = compacted
    setOuterSlots(compacted)
  }, [columns, dockEnabled, layoutDimensionsTracker, outerItemIds, pageSize])

  useEffect(() => {
    if (!hydratedRef.current || !layoutBaselineRef.current || dockEnabled) return
    const dockItemIds = dockKeysRef.current.filter(
      (entry): entry is string => typeof entry === 'string'
    )
    if (dockItemIds.length === 0) return

    const layoutMetrics = getLayoutNormalizationMetrics(
      itemsRef.current,
      Math.max(1, columns),
      pageSizeRef.current
    )
    const safePageSize = Math.max(1, layoutMetrics.pageSize)
    const safeColumns = Math.max(1, layoutMetrics.columns)
    const currentSlots = outerSlotsRef.current

    const remainder = currentSlots.length % safePageSize
    const padded =
      remainder > 0
        ? [...currentSlots, ...Array.from({ length: safePageSize - remainder }, () => null)]
        : [...currentSlots]

    const newPage: Array<string | null> = Array.from({ length: safePageSize }, () => null)
    const itemById = new Map(itemsRef.current.map(item => [getId(item), item]))
    let nextSlot = 0
    for (const id of dockItemIds) {
      const item = itemById.get(id)
      if (!item) continue
      const span = getGridItemSpan(item)
      for (let i = nextSlot; i < safePageSize; i += 1) {
        const indices = getFootprintIndices(i, span, safeColumns, safePageSize)
        if (indices && indices.every(idx => !newPage[idx])) {
          newPage[i] = id
          nextSlot = i + 1
          break
        }
      }
    }

    const nextOuterSlots = [...padded, ...newPage]
    const compactedOuterSlots = compactEmptyPages(nextOuterSlots, safePageSize)
    outerSlotsRef.current = compactedOuterSlots
    dockKeysRef.current = []
    setOuterSlots(compactedOuterSlots)
    setDockKeys([])
  }, [columns, dockEnabled])

  useEffect(() => {
    const request = importPlacementRequest
    if (!request || request.iconKeys.length === 0) return
    if (appliedImportPlacementTokenRef.current === request.token) return
    if (!hydratedRef.current || !layoutReadyRef.current || !layoutBaselineRef.current) return

    const outerItems = filterItemsByIds(itemsRef.current, outerItemIds)
    if (outerItems.length === 0) {
      appliedImportPlacementTokenRef.current = request.token
      return
    }

    const outerItemIdSet = new Set(outerItemIds)
    const importedIds = request.iconKeys.filter(id => outerItemIdSet.has(id))
    if (importedIds.length === 0) {
      appliedImportPlacementTokenRef.current = request.token
      return
    }

    const importedIdSet = new Set(importedIds)
    const layoutDimensions = layoutDimensionsTracker.read()
    const safeColumns = Math.max(1, layoutDimensions.columns || columns)
    const safePageSize = Math.max(1, layoutDimensions.pageSize || pageSize)
    const activePage = clampNumber(currentPageRef.current, 0, Number.MAX_SAFE_INTEGER)
    const currentPageStart = activePage * safePageSize
    const currentPageEnd = currentPageStart + safePageSize
    let workingSlots: Array<string | null> = outerSlotsRef.current.map(slot =>
      typeof slot === 'string' && importedIdSet.has(slot) ? null : slot
    )
    const preferredAnchorById = new Map<string, number>()
    const displacedIdSet = new Set<string>()
    let tailFillIndex = currentPageEnd - 1

    for (const id of importedIds) {
      const item = outerItems.find(entry => getId(entry) === id)
      if (!item) continue

      const span = getGridItemSpan(item)
      let placed = false
      for (let anchorIndex = currentPageStart; anchorIndex < currentPageEnd; anchorIndex += 1) {
        if (
          !canPlaceItemAtAnchorIndex(
            workingSlots,
            outerItems,
            anchorIndex,
            span,
            safeColumns,
            safePageSize
          )
        ) {
          continue
        }

        preferredAnchorById.set(id, anchorIndex)
        workingSlots[anchorIndex] = id
        placed = true
        break
      }
      if (placed) continue

      if (span.cols > 1 || span.rows > 1) continue

      while (tailFillIndex >= currentPageStart) {
        const occupant = workingSlots[tailFillIndex]
        if (typeof occupant === 'string' && importedIdSet.has(occupant)) {
          tailFillIndex -= 1
          continue
        }
        if (typeof occupant === 'string') {
          displacedIdSet.add(occupant)
        }
        preferredAnchorById.set(id, tailFillIndex)
        workingSlots[tailFillIndex] = id
        tailFillIndex -= 1
        placed = true
        break
      }
    }

    const fallbackOriginAnchorById = new Map<string, number>()
    displacedIdSet.forEach(id => {
      fallbackOriginAnchorById.set(id, currentPageEnd)
    })

    if (displacedIdSet.size > 0) {
      let nextPageVacant = 0
      for (let i = currentPageEnd; i < currentPageEnd + safePageSize; i += 1) {
        const slot = workingSlots[i]
        if (slot === undefined || slot === null) nextPageVacant += 1
      }
      if (displacedIdSet.size > nextPageVacant) {
        workingSlots = [
          ...workingSlots.slice(0, currentPageEnd),
          ...Array.from({ length: safePageSize }, () => null as string | null),
          ...workingSlots.slice(currentPageEnd),
        ]
      }
    }

    const nextSlots = compactEmptyPages(
      normalizeOuterSlots(workingSlots, outerItems, safePageSize, safeColumns, {
        preferredAnchorById,
        fallbackOriginAnchorById:
          fallbackOriginAnchorById.size > 0 ? fallbackOriginAnchorById : undefined,
        spillStrategy: 'row-major-forward',
      }),
      safePageSize
    )
    const currentPageHasImported = nextSlots
      .slice(currentPageStart, currentPageEnd)
      .some(slot => typeof slot === 'string' && importedIdSet.has(slot))
    const firstImportedAnchorIndex = nextSlots.findIndex(
      slot => typeof slot === 'string' && importedIdSet.has(slot)
    )
    const targetPage =
      firstImportedAnchorIndex >= 0
        ? Math.floor(firstImportedAnchorIndex / safePageSize)
        : activePage

    appliedImportPlacementTokenRef.current = request.token
    outerSlotsRef.current = nextSlots
    setOuterSlots(nextSlots)
    setImportHighlightIds(importedIds)
    clearImportHighlightTimer()
    importHighlightTimerRef.current = window.setTimeout(() => {
      setImportHighlightIds(current => {
        const next = current.filter(id => !importedIdSet.has(id))
        return next.length === current.length ? current : next
      })
      importHighlightTimerRef.current = null
    }, IMPORT_HIGHLIGHT_MS)

    if (!currentPageHasImported && targetPage !== currentPageRef.current) {
      currentPageRef.current = targetPage
      setCurrentPage(targetPage)
    }
  }, [columns, importPlacementRequest, layoutDimensionsTracker, outerItemIds, pageSize])

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

  useLayoutEffect(() => {
    const previousPositions = pendingGridFlipPositionsRef.current
    pendingGridFlipPositionsRef.current = null
    if (!previousPositions) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Read all destination rects before starting any animation so layout reads and writes stay
    // separated. This is the same FLIP ordering used by WeTab's Vue TransitionGroup.
    const movedItems: Array<{
      id: string
      node: HTMLDivElement
      deltaX: number
      deltaY: number
    }> = []
    previousPositions.forEach((previous, id) => {
      if (activeDragIdSet.has(id)) return
      const node = tileRefs.current.get(id)
      if (!node) return
      const next = node.getBoundingClientRect()
      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
      movedItems.push({ id, node, deltaX, deltaY })
    })

    movedItems.forEach(({ id, node, deltaX, deltaY }) => {
      node.style.willChange = 'transform'
      const animation = node.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        {
          duration: REORDER_ANIMATION_MS,
          easing: REORDER_EASING,
        }
      )
      const clearAnimation = () => {
        if (gridFlipAnimationsRef.current.get(id) !== animation) return
        gridFlipAnimationsRef.current.delete(id)
        node.style.willChange = ''
      }
      animation.onfinish = clearAnimation
      animation.oncancel = clearAnimation
      gridFlipAnimationsRef.current.set(id, animation)
    })
  }, [activeDragIdSet, pageItems])

  useLayoutEffect(() => {
    if (!openFolder) {
      prevFolderEntriesRef.current = []
      return
    }

    const currentEntries = folderRenderOrder
    const prevIndexMap = new Map<string, number>()
    prevFolderEntriesRef.current.forEach((entry, index) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      prevIndexMap.set(entry, index)
    })

    const stepX = folderItemWidth + GRID_GAP
    const stepY = folderItemHeight + GRID_GAP
    currentEntries.forEach((entry, newIndex) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      const prevIndex = prevIndexMap.get(entry)
      if (prevIndex === undefined || prevIndex === newIndex) return

      const prevRow = Math.floor(prevIndex / folderColumns)
      const prevCol = prevIndex % folderColumns
      const newRow = Math.floor(newIndex / folderColumns)
      const newCol = newIndex % folderColumns
      const deltaX = (prevCol - newCol) * stepX
      const deltaY = (prevRow - newRow) * stepY
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return

      const node = folderTileRefs.current.get(entry)
      if (!node) return

      const existingTimer = folderTileAnimationTimerRef.current.get(entry)
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer)
        folderTileAnimationTimerRef.current.delete(entry)
      }

      node.style.transition = 'none'
      node.style.willChange = 'transform'
      node.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0px)`
      void node.offsetWidth
      node.style.transition = `transform ${REORDER_ANIMATION_MS}ms ${REORDER_EASING}`
      node.style.transform = 'translate3d(0px, 0px, 0px)'

      const timer = window.setTimeout(() => {
        node.style.transition = ''
        node.style.transform = ''
        node.style.willChange = ''
        folderTileAnimationTimerRef.current.delete(entry)
      }, REORDER_ANIMATION_MS + 40)
      folderTileAnimationTimerRef.current.set(entry, timer)
    })

    prevFolderEntriesRef.current = currentEntries
  }, [openFolder, folderRenderOrder, folderColumns, folderItemWidth, folderItemHeight])

  useLayoutEffect(() => {
    const currentEntries = dockRenderSlots
    const prevIndexMap = new Map<string, number>()
    prevDockEntriesRef.current.forEach((entry, index) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      prevIndexMap.set(entry, index)
    })

    const dockButtonSize = Math.max(iconConfig.imgSize + 12, 52)
    const stepX = dockButtonSize + DOCK_GAP
    currentEntries.forEach((entry, newIndex) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      const prevIndex = prevIndexMap.get(entry)
      if (prevIndex === undefined || prevIndex === newIndex) return

      const deltaX = (prevIndex - newIndex) * stepX
      if (Math.abs(deltaX) < 0.5) return

      const node = dockItemRefs.current.get(entry)
      if (!node) return

      const existingTimer = dockTileAnimationTimerRef.current.get(entry)
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer)
        dockTileAnimationTimerRef.current.delete(entry)
      }

      node.style.transition = 'none'
      node.style.willChange = 'transform'
      node.style.transform = `translate3d(${deltaX}px, 0px, 0px)`
      void node.offsetWidth
      node.style.transition = `transform ${REORDER_ANIMATION_MS}ms ${REORDER_EASING}`
      node.style.transform = 'translate3d(0px, 0px, 0px)'

      const timer = window.setTimeout(() => {
        node.style.transition = ''
        node.style.transform = ''
        node.style.willChange = ''
        dockTileAnimationTimerRef.current.delete(entry)
      }, REORDER_ANIMATION_MS + 40)
      dockTileAnimationTimerRef.current.set(entry, timer)
    })

    prevDockEntriesRef.current = currentEntries
  }, [dockRenderSlots, iconConfig.imgSize])

  useEffect(() => {
    const gridFlipAnimations = gridFlipAnimationsRef.current
    const folderTileAnimationTimers = folderTileAnimationTimerRef.current
    const dockTileAnimationTimers = dockTileAnimationTimerRef.current
    return () => {
      gridFlipAnimations.forEach(animation => animation.cancel())
      gridFlipAnimations.clear()
      folderTileAnimationTimers.forEach(timer => {
        window.clearTimeout(timer)
      })
      folderTileAnimationTimers.clear()
      dockTileAnimationTimers.forEach(timer => {
        window.clearTimeout(timer)
      })
      dockTileAnimationTimers.clear()
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
