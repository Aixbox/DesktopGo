import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import type { DesktopIcon } from '../types'
import { ICON_SIZE_CONFIG } from '../types'
import { useIconStore } from '../stores/iconStore'
import type { GridItem, IconItem } from './icon-grid/model'
import { getId } from './icon-grid/model'
import {
  DRAG_HOLE_ID,
  areSlotsEqual,
  normalizeOuterSlots,
} from './icon-grid/domain/slots'
import { clampNumber } from './icon-grid/domain/geometry'
import { hydrateItems, readLayout, serializeItems, writeLayout } from './icon-grid/services/layoutStore'
import { useIconGridDragWorkflow } from './icon-grid/hooks/useIconGridDragWorkflow'
import {
  FOLDER_MODAL_MAX_HEIGHT,
  FOLDER_MODAL_MAX_WIDTH,
  FOLDER_PREVIEW_EASING,
} from './icon-grid/views/FolderVisuals'
import { DragOverlays } from './icon-grid/views/DragOverlays'
import { OuterGridView } from './icon-grid/views/OuterGridView'
import { FolderModalView } from './icon-grid/views/FolderModalView'

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
const DRAG_LONG_PRESS_MS = 150
const DRAG_MOVE_THRESHOLD = 7
const EVASION_REARM_DISTANCE = 14
const EVASION_COOLDOWN_MS = 80
const REORDER_ANIMATION_MS = 220
const REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

const FALLBACK_ICON_ROW_HEIGHT = {
  large: 130,
  medium: 112,
  small: 96,
} as const

const fitCount = (container: number, item: number) => {
  if (item <= 0 || container <= item) return 1
  return Math.floor((container - item) / (item + GRID_GAP)) + 1
}

export function IconGrid({ icons }: IconGridProps) {
  const { iconSize, selectionMode, selectedIconKeys, toggleSelectIcon } = useIconStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const folderPanelRef = useRef<HTMLDivElement>(null)
  const folderGridContainerRef = useRef<HTMLDivElement>(null)
  const folderGridRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const folderTileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevPageEntriesRef = useRef<Array<string | null>>([])
  const prevPageRef = useRef<number>(0)
  const prevFolderEntriesRef = useRef<Array<string | null>>([])
  const tileAnimationTimerRef = useRef<Map<string, number>>(new Map())
  const folderTileAnimationTimerRef = useRef<Map<string, number>>(new Map())
  const hydratedRef = useRef(false)
  const itemsRef = useRef<GridItem[]>([])
  const outerSlotsRef = useRef<Array<string | null>>([])
  const currentPageRef = useRef(0)
  const pageSizeRef = useRef(1)
  const wheelDeltaRef = useRef(0)
  const wheelCooldownUntilRef = useRef(0)

  const columnWidth = ICON_SIZE_CONFIG[iconSize].columnWidth
  const fallbackRowHeight = FALLBACK_ICON_ROW_HEIGHT[iconSize]

  const [columns, setColumns] = useState(1)
  const [rows, setRows] = useState(1)
  const [currentPage, setCurrentPage] = useState(0)
  const [hoverPage, setHoverPage] = useState<number | null>(null)
  const [itemWidth, setItemWidth] = useState<number>(columnWidth)
  const [itemHeight, setItemHeight] = useState<number>(fallbackRowHeight)
  const [items, setItems] = useState<GridItem[]>([])
  const [outerSlots, setOuterSlots] = useState<Array<string | null>>([])
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [folderItemWidth, setFolderItemWidth] = useState<number>(columnWidth)
  const [folderItemHeight, setFolderItemHeight] = useState<number>(fallbackRowHeight)
  const [folderColumns, setFolderColumns] = useState<number>(1)

  useEffect(() => {
    if (!hydratedRef.current && icons.length === 0) return
    const persisted = hydratedRef.current
      ? { items: serializeItems(itemsRef.current), slots: outerSlotsRef.current }
      : readLayout()
    const nextItems = hydrateItems(icons, persisted?.items ?? null)
    const nextItemIds = nextItems.map(getId)
    const nextSlots = normalizeOuterSlots(persisted?.slots, nextItemIds, pageSizeRef.current)
    itemsRef.current = nextItems
    outerSlotsRef.current = nextSlots
    setItems(nextItems)
    setOuterSlots(nextSlots)
    hydratedRef.current = true
  }, [icons])

  useEffect(() => {
    itemsRef.current = items
    outerSlotsRef.current = outerSlots
    if (hydratedRef.current) writeLayout(items, outerSlots)
  }, [items, outerSlots])

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

  const {
    dragState,
    dragRef,
    folderDropFlight,
    folderPreviewFreezeTargetId,
    hiddenOuterItemIds,
    frozenOuterOrder,
    handleTilePointerDown,
    handleFolderTilePointerDown,
    handleTileClickCapture,
    clearEdgeSwitchTimer,
    clearOuterDragInteractionForPageSwitch,
  } = useIconGridDragWorkflow({
    config: {
      gridGap: GRID_GAP,
      dragEdgeSwitchZone: DRAG_EDGE_SWITCH_ZONE,
      dragEdgeSwitchMs: DRAG_EDGE_SWITCH_MS,
      dragLongPressMs: DRAG_LONG_PRESS_MS,
      dragMoveThreshold: DRAG_MOVE_THRESHOLD,
      evasionRearmDistance: EVASION_REARM_DISTANCE,
      evasionCooldownMs: EVASION_COOLDOWN_MS,
      reorderAnimationMs: REORDER_ANIMATION_MS,
    },
    selectionMode,
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
    itemIds,
    containerRef,
    gridRef,
    folderPanelRef,
    folderGridRef,
    tileRefs,
    folderTileRefs,
    itemsRef,
    setItems,
    outerSlotsRef,
    setOuterSlots,
    currentPageRef,
    setCurrentPage,
    pageSizeRef,
    setOpenFolderId,
  })
  const renderOrder =
    dragState && dragState.context === 'outer'
      ? dragState.workingOrder
      : frozenOuterOrder ?? outerSlots
  const folderRenderOrder =
    dragState && dragState.context === 'folder' ? dragState.workingOrder : folderOrder

  const outerViewItemById = useMemo(() => {
    if (!dragState || dragState.context !== 'outer' || !dragState.sourceFolderId) {
      return itemById
    }
    const draggingIconKey =
      dragState.draggingItem.kind === 'icon' ? dragState.draggingItem.key : null
    if (!draggingIconKey) return itemById

    const sourceFolderEntryId = `folder:${dragState.sourceFolderId}`
    const sourceFolder = itemById.get(sourceFolderEntryId)
    if (!sourceFolder || sourceFolder.kind !== 'folder') return itemById

    const nextChildren = sourceFolder.children.filter(child => child.key !== draggingIconKey)
    const next = new Map(itemById)
    next.set(sourceFolderEntryId, { ...sourceFolder, children: nextChildren })
    return next
  }, [itemById, dragState])

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
      const first = gridRef.current?.querySelector<HTMLElement>('[data-grid-item]')
      const tileWidth = first?.offsetWidth ?? columnWidth
      const tileHeight = first?.offsetHeight ?? fallbackRowHeight
      setItemWidth(tileWidth)
      setItemHeight(tileHeight)
      setColumns(fitCount(width, tileWidth))
      setRows(fitCount(height, tileHeight))
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
  }, [columnWidth, fallbackRowHeight, items.length, currentPage])

  useEffect(() => {
    const container = folderGridContainerRef.current
    if (!container || !openFolder) return

    let raf = 0
    const recalc = () => {
      const width = container.clientWidth
      const first = folderGridRef.current?.querySelector<HTMLElement>('[data-folder-grid-item]')
      const tileWidth = first?.offsetWidth ?? columnWidth
      const tileHeight = first?.offsetHeight ?? fallbackRowHeight
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
  }, [openFolder, folderRenderOrder.length, columnWidth, fallbackRowHeight])

  const pageSize = Math.max(1, columns * rows)
  useEffect(() => {
    pageSizeRef.current = pageSize
  }, [pageSize])

  useEffect(() => {
    const normalized = normalizeOuterSlots(outerSlotsRef.current, itemIds, pageSize)
    if (areSlotsEqual(normalized, outerSlotsRef.current)) return
    outerSlotsRef.current = normalized
    setOuterSlots(normalized)
  }, [itemIds, pageSize])

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
  useEffect(() => {
    currentPageRef.current = 0
    setCurrentPage(0)
  }, [items.length, iconSize, pageSize])

  const handleWheelPageSwitch = (event: ReactWheelEvent<HTMLDivElement>) => {
    const isOuterDrag = dragState?.context === 'outer'
    if (openFolder && !isOuterDrag) return
    if (dragState && dragState.context !== 'outer') return
    if (pageCount <= 1) return

    const primaryDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
    if (Math.abs(primaryDelta) < 0.1) return
    event.preventDefault()

    const now = performance.now()
    if (now < wheelCooldownUntilRef.current) return

    if (wheelDeltaRef.current !== 0 && Math.sign(wheelDeltaRef.current) !== Math.sign(primaryDelta)) {
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

  const pageItems = useMemo(() => {
    const start = currentPage * pageSize
    const currentSlice = [...renderOrder.slice(start, start + pageSize)]
    if (currentSlice.length < pageSize) {
      currentSlice.push(...Array.from({ length: pageSize - currentSlice.length }, () => null))
    }
    return currentSlice
  }, [renderOrder, currentPage, pageSize])

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
      clearEdgeSwitchTimer()
    }
  }, [])

  const gridWidth = columns * itemWidth + Math.max(0, columns - 1) * GRID_GAP
  const gridHeight = rows * itemHeight + Math.max(0, rows - 1) * GRID_GAP
  const ghostItem = dragState ? dragState.draggingItem : null
  const canGoLeft = currentPage > 0
  const canGoRight = currentPage < pageCount - 1

  return (
    <div className="relative h-full w-full px-16 pb-20 pt-24" onWheel={handleWheelPageSwitch}>
      <div ref={containerRef} className="flex h-full w-full items-center justify-center">
        <OuterGridView
          gridRef={gridRef}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          columns={columns}
          itemWidth={itemWidth}
          itemHeight={itemHeight}
          pageItems={pageItems}
          pageSize={pageSize}
          currentPage={currentPage}
          itemById={outerViewItemById}
          dragContext={dragState?.context ?? null}
          dragPreviewSlotIndex={dragState?.previewSlotIndex ?? null}
          dragFolderPreviewTargetId={dragState?.folderPreviewTargetId ?? null}
          folderPreviewFreezeTargetId={folderPreviewFreezeTargetId}
          hiddenOuterItemIds={hiddenOuterItemIds}
          iconConfig={iconConfig}
          selectionMode={selectionMode}
          selectedSet={selectedSet}
          onToggleSelectIcon={toggleSelectIcon}
          onTilePointerDown={handleTilePointerDown}
          onTileClickCapture={handleTileClickCapture}
          onOpenFolder={setOpenFolderId}
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

      <FolderModalView
        openFolder={openFolder}
        dragContext={dragState?.context ?? null}
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
        dragPointer={dragState ? { pointerX: dragState.pointerX, pointerY: dragState.pointerY } : null}
        ghostItem={ghostItem}
        iconImageSize={iconConfig.imgSize}
        folderDropFlight={folderDropFlight}
        reorderAnimationMs={REORDER_ANIMATION_MS}
        folderPreviewEasing={FOLDER_PREVIEW_EASING}
      />
    </div>
  )
}

