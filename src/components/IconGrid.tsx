import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { DesktopIcon } from '../types'
import { getIconGridLayoutRowHeight, getIconGridRowHeight, ICON_SIZE_CONFIG } from '../types'
import { useIconStore } from '../stores/iconStore'
import type { FolderSize, GridItem, IconItem, PersistedLayout } from './icon-grid/model'
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
import {
  FOLDER_MODAL_MAX_HEIGHT,
  FOLDER_MODAL_MAX_WIDTH,
  FOLDER_PREVIEW_EASING,
} from './icon-grid/views/FolderVisuals'
import { DOCK_GAP, resolveDockDisplaySlots, resolveOuterItemIds } from './icon-grid/domain/dock'
import {
  canPlaceItemAtAnchorIndex,
  getFootprintIndices,
  getPageAnchorEntries,
  normalizeOuterSlots,
} from './icon-grid/domain/topLevelLayout'
import { DragOverlays } from './icon-grid/views/DragOverlays'
import { OuterGridView } from './icon-grid/views/OuterGridView'
import { FolderModalView } from './icon-grid/views/FolderModalView'
import { DockBar } from './icon-grid/views/DockBar'
import { getFolderChildrenById } from './icon-grid/domain/folderPolicy'

interface IconGridProps {
  icons: DesktopIcon[]
}

const GRID_GAP = 8
const PAGINATION_OFFSET = 14
const PAGINATION_DOT_SIZE = 8
const PAGINATION_DOT_GAP = 10
const PAGINATION_ACTIVE_WIDTH = 18
const SIDE_ARROW_OFFSET = 66
const DRAG_EDGE_SWITCH_ZONE = 72
const DRAG_EDGE_SWITCH_MS = 600
const WHEEL_PAGE_DELTA_THRESHOLD = 54
const WHEEL_PAGE_COOLDOWN_MS = 180
const DRAG_LONG_PRESS_MS = 300
const DRAG_PENDING_MOVE_TOLERANCE = 7
const EVASION_REARM_DISTANCE = 14
const EVASION_COOLDOWN_MS = 80
const REORDER_ANIMATION_MS = 220
const REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const fitCount = (container: number, item: number) => {
  if (item <= 0 || container <= item) return 1
  return Math.floor((container - item) / (item + GRID_GAP)) + 1
}

const filterItemsByIds = (items: GridItem[], ids: string[]): GridItem[] => {
  const idSet = new Set(ids)
  return items.filter(item => idSet.has(getId(item)))
}

const getLayoutNormalizationMetrics = (
  items: GridItem[],
  columns: number,
  pageSize: number
): { columns: number; pageSize: number } => {
  const minColumns = items.some(item => getGridItemSpan(item).cols > 1) ? 2 : 1
  const minRows = items.some(item => getGridItemSpan(item).rows > 1) ? 2 : 1
  const safeColumns = Math.max(minColumns, columns)
  return {
    columns: safeColumns,
    pageSize: Math.max(pageSize, safeColumns * minRows),
  }
}

export function IconGrid({ icons }: IconGridProps) {
  const {
    iconSize,
    dockEnabled,
    selectionMode,
    selectedIconKeys,
    toggleSelectIcon,
    unselectIcons,
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
  const folderTileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dockSlotRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dockItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevPageEntriesRef = useRef<Array<string | null>>([])
  const prevPageRef = useRef<number>(0)
  const prevFolderEntriesRef = useRef<Array<string | null>>([])
  const prevDockEntriesRef = useRef<Array<string | null>>([])
  const tileAnimationTimerRef = useRef<Map<string, number>>(new Map())
  const folderTileAnimationTimerRef = useRef<Map<string, number>>(new Map())
  const dockTileAnimationTimerRef = useRef<Map<string, number>>(new Map())
  const hydratedRef = useRef(false)
  const persistedLayoutRef = useRef<PersistedLayout | null>(null)
  const persistedLayoutLoadedRef = useRef(false)
  const persistedLayoutLoadPromiseRef = useRef<Promise<PersistedLayout | null> | null>(null)
  const layoutWriteQueueRef = useRef<Promise<void>>(Promise.resolve())
  const itemsRef = useRef<GridItem[]>([])
  const outerSlotsRef = useRef<Array<string | null>>([])
  const dockKeysRef = useRef<Array<string | null>>([])
  const currentPageRef = useRef(0)
  const pageSizeRef = useRef(1)
  const wheelDeltaRef = useRef(0)
  const wheelCooldownUntilRef = useRef(0)

  const columnWidth = ICON_SIZE_CONFIG[iconSize].columnWidth
  const layoutRowHeight = getIconGridLayoutRowHeight(iconSize)
  const rowHeight = getIconGridRowHeight(iconSize)

  const [columns, setColumns] = useState(1)
  const [rows, setRows] = useState(1)
  const [currentPage, setCurrentPage] = useState(0)
  const [hoverPage, setHoverPage] = useState<number | null>(null)
  const [itemWidth, setItemWidth] = useState<number>(columnWidth)
  const [itemHeight, setItemHeight] = useState<number>(rowHeight)
  const [items, setItems] = useState<GridItem[]>([])
  const [outerSlots, setOuterSlots] = useState<Array<string | null>>([])
  const [dockKeys, setDockKeys] = useState<Array<string | null>>([])
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [folderItemWidth, setFolderItemWidth] = useState<number>(columnWidth)
  const [folderItemHeight, setFolderItemHeight] = useState<number>(rowHeight)
  const [folderColumns, setFolderColumns] = useState<number>(1)

  useEffect(() => {
    let cancelled = false

    const hydrate = async () => {
      if (!hydratedRef.current && icons.length === 0) return

      let persisted: PersistedLayout | null = null
      if (hydratedRef.current) {
        persisted = {
          items: serializeItems(itemsRef.current),
          slots: outerSlotsRef.current,
          dockKeys: dockKeysRef.current,
        }
      } else {
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
      const nextDockKeys = dockEnabled ? hydrateDockKeys(nextItemIds, persisted?.dockKeys) : []
      const nextOuterItemIds = resolveOuterItemIds(nextItemIds, nextDockKeys)
      const outerItems = filterItemsByIds(nextItems, nextOuterItemIds)
      const layoutMetrics = getLayoutNormalizationMetrics(
        outerItems,
        Math.max(1, columns),
        pageSizeRef.current
      )
      const normalizedNextSlots = normalizeOuterSlots(
        persisted?.slots,
        outerItems,
        layoutMetrics.pageSize,
        layoutMetrics.columns
      )
      const compactedNextSlots = compactEmptyPages(normalizedNextSlots, layoutMetrics.pageSize)
      itemsRef.current = nextItems
      outerSlotsRef.current = compactedNextSlots
      dockKeysRef.current = nextDockKeys
      setItems(nextItems)
      setOuterSlots(compactedNextSlots)
      setDockKeys(nextDockKeys)
      hydratedRef.current = true
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [dockEnabled, icons])

  useEffect(() => {
    itemsRef.current = items
    outerSlotsRef.current = outerSlots
    dockKeysRef.current = dockKeys
    if (!hydratedRef.current) return

    const nextItems = items
    const nextSlots = outerSlots
    const nextDockKeys = dockKeys
    layoutWriteQueueRef.current = layoutWriteQueueRef.current
      .then(() => writeLayout(nextItems, nextSlots, nextDockKeys))
      .catch(e => {
        console.error('Failed to persist launchpad layout:', e)
      })
  }, [dockKeys, items, outerSlots])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    if (!openFolderId) return
    const exists = items.some(item => item.kind === 'folder' && item.id === openFolderId)
    if (!exists) {
      setOpenFolderId(null)
    }
  }, [openFolderId, items])

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

  const folderItemById = useMemo(() => {
    const map = new Map<string, IconItem>()
    if (!openFolder) return map
    openFolder.children.forEach(child => map.set(child.key, child))
    return map
  }, [openFolder])

  const itemIds = useMemo(() => items.map(getId), [items])
  const folderOrder = useMemo(
    () => openFolder?.children.map(child => child.key) ?? [],
    [openFolder]
  )
  const selectedSet = useMemo(() => new Set(selectedIconKeys), [selectedIconKeys])
  const iconConfig = ICON_SIZE_CONFIG[iconSize]
  const activeDockKeys = dockEnabled ? dockKeys : []
  const outerItemIds = useMemo(
    () => resolveOuterItemIds(itemIds, activeDockKeys),
    [activeDockKeys, itemIds]
  )
  const pageSize = Math.max(1, columns * rows)

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
  } = useIconGridDragWorkflow({
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
    openFolderId,
    setOpenFolderId,
  })
  const folderRenderOrder =
    dragState && dragState.context === 'folder' ? dragState.workingOrder : folderOrder
  const hiddenDockDraggingId =
    dragState?.draggingId && activeDockKeys.includes(dragState.draggingId)
      ? dragState.draggingId
      : null
  const dockWorkingOrder =
    dragState?.context === 'dock' && hiddenDockDraggingId
      ? dragState.workingOrder.map(slot => (slot === DRAG_HOLE_ID ? null : slot))
      : null
  const dockRenderSlots = useMemo(
    () =>
      resolveDockDisplaySlots({
        dockKeys: activeDockKeys,
        draggingKey: hiddenDockDraggingId,
        previewIndex: dragState?.context === 'dock' ? (dragState.dockPreviewIndex ?? null) : null,
        workingOrder: dockWorkingOrder,
        showPlaceholderWhenEmpty: true,
      }),
    [
      activeDockKeys,
      hiddenDockDraggingId,
      dragState?.context,
      dragState?.dockPreviewIndex,
      dockWorkingOrder,
    ]
  )

  const outerViewItemById = useMemo(() => {
    if (!dragState || dragState.context !== 'outer' || !dragState.sourceFolderId) {
      return itemById
    }
    const draggingIconIdSet = new Set(dragState.draggingIds)
    if (draggingIconIdSet.size === 0) return itemById

    const sourceFolderEntryId = `folder:${dragState.sourceFolderId}`
    const sourceFolder = itemById.get(sourceFolderEntryId)
    if (!sourceFolder || sourceFolder.kind !== 'folder') return itemById

    const nextChildren = sourceFolder.children.filter(child => !draggingIconIdSet.has(child.key))
    const next = new Map(itemById)
    if (nextChildren.length === 0) {
      next.delete(sourceFolderEntryId)
      return next
    }
    next.set(sourceFolderEntryId, { ...sourceFolder, children: nextChildren })
    return next
  }, [itemById, dragState])

  const renderOrder = useMemo(() => {
    if (dragState?.context === 'outer') {
      return dragState.workingOrder
    }
    const baseOrder = frozenOuterOrder ?? outerSlots
    if (dragState?.context === 'dock' && dragState.draggingId) {
      return baseOrder.map(slot => (slot === dragState.draggingId ? null : slot))
    }
    return baseOrder
  }, [dragState, frozenOuterOrder, outerSlots])

  useEffect(() => {
    if (!openFolderId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (dragRef.current?.context === 'folder') return
      setOpenFolderId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dragRef, openFolderId])

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
      const resolvedRows =
        !dockEnabled && nextRowGridHeight <= height ? baseRows + 1 : baseRows
      setItemWidth(tileWidth)
      setItemHeight(tileHeight)
      setColumns(Math.max(hasWideItems ? 2 : 1, fitCount(width, tileWidth)))
      setRows(resolvedRows)
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
  }, [columnWidth, dockEnabled, layoutRowHeight, rowHeight, items.length, currentPage])

  useEffect(() => {
    const container = folderGridContainerRef.current
    if (!container || !openFolder) return

    let raf = 0
    const recalc = () => {
      const width = container.clientWidth
      const first = folderGridRef.current?.querySelector<HTMLElement>('[data-folder-grid-item]')
      const tileWidth = first?.offsetWidth ?? columnWidth
      const tileHeight = first?.offsetHeight ?? rowHeight
      setFolderItemWidth(tileWidth)
      setFolderItemHeight(tileHeight)
      setFolderColumns(fitCount(width, tileWidth))
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
    const outerItems = filterItemsByIds(itemsRef.current, outerItemIds)
    const layoutMetrics = getLayoutNormalizationMetrics(outerItems, Math.max(1, columns), pageSize)
    const normalized = normalizeOuterSlots(
      outerSlotsRef.current,
      outerItems,
      layoutMetrics.pageSize,
      layoutMetrics.columns
    )
    const compacted = compactEmptyPages(normalized, layoutMetrics.pageSize)
    if (areSlotsEqual(compacted, outerSlotsRef.current)) return
    outerSlotsRef.current = compacted
    setOuterSlots(compacted)
  }, [columns, outerItemIds, pageSize])

  useEffect(() => {
    if (!hydratedRef.current || dockEnabled) return
    const hasDockItems = dockKeysRef.current.some(
      (entry): entry is string => typeof entry === 'string'
    )
    if (!hasDockItems) return

    const layoutMetrics = getLayoutNormalizationMetrics(
      itemsRef.current,
      Math.max(1, columns),
      pageSizeRef.current
    )
    const nextOuterSlots = normalizeOuterSlots(
      outerSlotsRef.current,
      itemsRef.current,
      layoutMetrics.pageSize,
      layoutMetrics.columns
    )
    const compactedOuterSlots = compactEmptyPages(nextOuterSlots, layoutMetrics.pageSize)
    outerSlotsRef.current = compactedOuterSlots
    dockKeysRef.current = []
    setOuterSlots(compactedOuterSlots)
    setDockKeys([])
  }, [columns, dockEnabled])

  const outerRenderCount = Math.max(pageSize, renderOrder.length)
  const pageCount = Math.max(1, Math.ceil(outerRenderCount / pageSize))
  useEffect(() => {
    if (currentPage >= pageCount) {
      const nextPage = pageCount - 1
      currentPageRef.current = nextPage
      setCurrentPage(nextPage)
    }
  }, [currentPage, pageCount])
  useEffect(() => {
    if (hoverPage !== null && hoverPage >= pageCount) setHoverPage(null)
  }, [hoverPage, pageCount])

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
    const nextOuterSlots = normalizeOuterSlots(
      outerSlotsRef.current,
      outerItems,
      layoutMetrics.pageSize,
      layoutMetrics.columns
    )
    const compactedOuterSlots = compactEmptyPages(nextOuterSlots, layoutMetrics.pageSize)

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
    const currentPageEntries = pageItems
    if (prevPageRef.current !== currentPage) {
      prevPageRef.current = currentPage
      prevPageEntriesRef.current = currentPageEntries
      return
    }

    const prevIndexMap = new Map<string, number>()
    prevPageEntriesRef.current.forEach((entry, index) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      const id = entry
      prevIndexMap.set(id, index)
    })

    const stepX = itemWidth + GRID_GAP
    const stepY = itemHeight + GRID_GAP
    currentPageEntries.forEach((entry, newIndex) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      const id = entry
      const prevIndex = prevIndexMap.get(id)
      if (prevIndex === undefined || prevIndex === newIndex) return

      const prevRow = Math.floor(prevIndex / columns)
      const prevCol = prevIndex % columns
      const newRow = Math.floor(newIndex / columns)
      const newCol = newIndex % columns
      const deltaX = (prevCol - newCol) * stepX
      const deltaY = (prevRow - newRow) * stepY
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return

      const node = tileRefs.current.get(id)
      if (!node) return

      const existingTimer = tileAnimationTimerRef.current.get(id)
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer)
        tileAnimationTimerRef.current.delete(id)
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
        tileAnimationTimerRef.current.delete(id)
      }, REORDER_ANIMATION_MS + 40)
      tileAnimationTimerRef.current.set(id, timer)
    })

    prevPageEntriesRef.current = currentPageEntries
  }, [pageItems, currentPage, columns, itemWidth, itemHeight])

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
    return () => {
      tileAnimationTimerRef.current.forEach(timer => {
        window.clearTimeout(timer)
      })
      tileAnimationTimerRef.current.clear()
      folderTileAnimationTimerRef.current.forEach(timer => {
        window.clearTimeout(timer)
      })
      folderTileAnimationTimerRef.current.clear()
      dockTileAnimationTimerRef.current.forEach(timer => {
        window.clearTimeout(timer)
      })
      dockTileAnimationTimerRef.current.clear()
      clearEdgeSwitchTimer()
    }
  }, [])

  const gridWidth = columns * itemWidth + Math.max(0, columns - 1) * GRID_GAP
  const gridHeight = rows * itemHeight + Math.max(0, rows - 1) * GRID_GAP
  const ghostItem = dragState ? dragState.draggingItem : null
  const activeHiddenDragIds = useMemo(
    () => (dragState?.context === 'outer' ? dragState.draggingIds : []),
    [dragState]
  )
  const mergedHiddenOuterItemIds = useMemo(
    () => Array.from(new Set([...hiddenOuterItemIds, ...activeHiddenDragIds])),
    [activeHiddenDragIds, hiddenOuterItemIds]
  )
  const multiDragStackItems = useMemo(() => {
    if (!dragState || dragState.context !== 'outer' || dragState.draggingIds.length <= 1) {
      return []
    }

    const dragItemById = new Map(itemById)
    if (dragState.sourceFolderId) {
      getFolderChildrenById(items, dragState.sourceFolderId).forEach(child => {
        dragItemById.set(child.key, child)
      })
    }

    return dragState.draggingIds.slice(1).flatMap(id => {
      const item = dragItemById.get(id)
      const sourceCenter = dragState.initialCenters[id]
      if (!item || item.kind !== 'icon' || !sourceCenter) {
        return []
      }
      return [{ id, icon: item.icon, sourceCenter }]
    })
  }, [dragState, itemById, items])
  const canGoLeft = currentPage > 0
  const canGoRight = currentPage < pageCount - 1

  return (
    <div
      className={`relative h-full w-full px-16 pt-24 ${dockEnabled ? 'pb-32' : 'pb-12'}`}
      onWheel={handleWheelPageSwitch}
    >
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
          previewFootprint={previewFootprint}
          iconConfig={iconConfig}
          selectionMode={selectionMode}
          selectedSet={selectedSet}
          onToggleSelectIcon={toggleSelectIcon}
          onTilePointerDown={handleTilePointerDown}
          onTileClickCapture={handleTileClickCapture}
          onOpenFolder={setOpenFolderId}
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
          itemById={itemById}
          dockPreviewIndex={dragState?.dockPreviewIndex ?? null}
          dragContext={dragState?.context ?? null}
          dragFolderPreviewTargetId={dragState?.folderPreviewTargetId ?? null}
          folderPreviewFreezeTargetId={folderPreviewFreezeTargetId}
          folderCreateTransitionTargetId={folderCreateTransitionTargetId}
          iconImageSize={iconConfig.imgSize}
          selectionMode={selectionMode}
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
          onLaunchIcon={path => {
            void launchApp(path)
          }}
          onOpenFolder={setOpenFolderId}
          onRemoveItem={key => {
            setDockKeys(current => current.filter(entry => entry !== key))
          }}
        />
      ) : null}

      <FolderModalView
        openFolder={openFolder}
        dragContext={dragState?.context === 'dock' ? null : (dragState?.context ?? null)}
        selectionMode={selectionMode}
        selectedSet={selectedSet}
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
          setOpenFolderId(null)
        }}
        onPanelPointerDown={event => {
          event.stopPropagation()
        }}
        onPanelClick={event => {
          event.stopPropagation()
        }}
        onClose={() => setOpenFolderId(null)}
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
        stackedIcons={multiDragStackItems}
        folderDropFlight={folderDropFlight}
        multiDropFlight={multiDropFlight}
        reorderAnimationMs={REORDER_ANIMATION_MS}
        folderPreviewEasing={FOLDER_PREVIEW_EASING}
      />
    </div>
  )
}
