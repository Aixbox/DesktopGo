import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AppWindow } from 'lucide-react'
import type { DesktopIcon } from '../types'
import { ICON_SIZE_CONFIG } from '../types'
import { buildIconSelectionKey, useIconStore } from '../stores/iconStore'
import { Icon } from './Icon'

interface IconGridProps {
  icons: DesktopIcon[]
}

type HoverZone = 'left' | 'right' | 'up' | 'down' | 'center'

type IconItem = {
  kind: 'icon'
  key: string
  icon: DesktopIcon
}

type FolderItem = {
  kind: 'folder'
  id: string
  name: string
  children: IconItem[]
}

type GridItem = IconItem | FolderItem
type DragContext = 'outer' | 'folder'

type PersistedItem =
  | {
      type: 'icon'
      key: string
    }
  | {
      type: 'folder'
      id: string
      name: string
      children: string[]
    }

interface DragState {
  context: DragContext
  sourceFolderId: string | null
  pointerId: number
  draggingId: string
  draggingItem: GridItem
  pointerX: number
  pointerY: number
  offsetX: number
  offsetY: number
  workingOrder: Array<string | null>
  hoverTargetId: string | null
  hoverZone: HoverZone | null
  centerStartedAt: number | null
  folderPreviewTargetId: string | null
  lastEvasionSignature: string | null
  lastEvasionTriggerPointer: { x: number; y: number } | null
  lastEvasionAt: number | null
  initialCenters: Record<string, { x: number; y: number }>
}

interface PendingDrag {
  context: DragContext
  sourceFolderId: string | null
  pointerId: number
  itemId: string
  startX: number
  startY: number
  offsetX: number
  offsetY: number
}

interface FolderCreatePreviewProps {
  active: boolean
  icon: DesktopIcon
  imgSize: number
}

interface FolderDropFlight {
  id: number
  icon: DesktopIcon
  startX: number
  startY: number
  startSize: number
  endX: number
  endY: number
  endSize: number
  animate: boolean
}

const GRID_GAP = 8
const PAGINATION_OFFSET = 14
const PAGINATION_DOT_SIZE = 8
const PAGINATION_DOT_GAP = 10
const PAGINATION_ACTIVE_WIDTH = 18
const DRAG_LONG_PRESS_MS = 150
const DRAG_MOVE_THRESHOLD = 7
const FOLDER_DWELL_MS = 300
const CENTER_RATIO = 0.45
const LAYOUT_KEY = 'desktopgo.launchpad.layout.v1'
const EVASION_REARM_DISTANCE = 14
const EVASION_COOLDOWN_MS = 80
const REORDER_ANIMATION_MS = 220
const REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

const FOLDER_PREVIEW_PADDING = 4
const FOLDER_PREVIEW_GAP = 2
const FOLDER_PREVIEW_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const FOLDER_PREVIEW_TOP_OFFSET = 12
const FOLDER_SURFACE_CLASS =
  'relative h-full w-full overflow-hidden rounded-xl bg-[linear-gradient(145deg,rgba(20,31,52,0.92),rgba(8,12,22,0.9))] shadow-[0_12px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-md'
const FOLDER_MODAL_MAX_WIDTH = 620
const FOLDER_MODAL_MAX_HEIGHT = 480

const getFolderPreviewSlotSize = (imgSize: number): number =>
  Math.max(8, Math.floor((imgSize - FOLDER_PREVIEW_PADDING * 2 - FOLDER_PREVIEW_GAP) / 2))

const FALLBACK_ICON_ROW_HEIGHT = {
  large: 130,
  medium: 112,
  small: 96,
} as const

const fitCount = (container: number, item: number) => {
  if (item <= 0 || container <= item) return 1
  return Math.floor((container - item) / (item + GRID_GAP)) + 1
}

const getId = (item: GridItem): string => (item.kind === 'icon' ? item.key : `folder:${item.id}`)

const makeFolderId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `folder-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const readLayout = (): PersistedItem[] | null => {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { version: number; items: PersistedItem[] }
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return null
    return parsed.items
  } catch {
    return null
  }
}

const writeLayout = (items: GridItem[]) => {
  const payload = {
    version: 1,
    items: items.map<PersistedItem>(item =>
      item.kind === 'icon'
        ? { type: 'icon', key: item.key }
        : { type: 'folder', id: item.id, name: item.name, children: item.children.map(child => child.key) }),
  }
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(payload))
}

const hydrateItems = (icons: DesktopIcon[], persisted: PersistedItem[] | null): GridItem[] => {
  const iconMap = new Map<string, IconItem>()
  icons.forEach(icon => {
    const key = buildIconSelectionKey(icon)
    iconMap.set(key, { kind: 'icon', key, icon })
  })

  const consumed = new Set<string>()
  const result: GridItem[] = []

  if (persisted) {
    persisted.forEach(item => {
      if (item.type === 'icon') {
        if (consumed.has(item.key)) return
        const iconItem = iconMap.get(item.key)
        if (!iconItem) return
        consumed.add(item.key)
        result.push(iconItem)
        return
      }

      const children: IconItem[] = []
      item.children.forEach(key => {
        if (consumed.has(key)) return
        const iconItem = iconMap.get(key)
        if (!iconItem) return
        consumed.add(key)
        children.push(iconItem)
      })

      if (children.length >= 2) {
        result.push({
          kind: 'folder',
          id: item.id || makeFolderId(),
          name: item.name || 'New Folder',
          children,
        })
      } else if (children.length === 1) {
        result.push(children[0])
      }
    })
  }

  icons.forEach(icon => {
    const key = buildIconSelectionKey(icon)
    if (!consumed.has(key)) {
      result.push({ kind: 'icon', key, icon })
    }
  })

  return result
}

const findFolderIndexById = (items: GridItem[], folderId: string): number =>
  items.findIndex(item => item.kind === 'folder' && item.id === folderId)

const getFolderChildrenById = (items: GridItem[], folderId: string): IconItem[] => {
  const index = findFolderIndexById(items, folderId)
  if (index < 0) return []
  const item = items[index]
  return item && item.kind === 'folder' ? item.children : []
}

const replaceFolderChildren = (items: GridItem[], folderId: string, nextChildren: IconItem[]): GridItem[] => {
  const index = findFolderIndexById(items, folderId)
  if (index < 0) return items
  const current = items[index]
  if (!current || current.kind !== 'folder') return items

  const next = [...items]
  if (nextChildren.length >= 2) {
    next[index] = { ...current, children: nextChildren }
    return next
  }

  if (nextChildren.length === 1) {
    next[index] = nextChildren[0]
    return next
  }

  next.splice(index, 1)
  return next
}

const classifyZone = (rect: DOMRect, x: number, y: number): HoverZone => {
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const dx = x - centerX
  const dy = y - centerY
  const halfW = (rect.width * CENTER_RATIO) / 2
  const halfH = (rect.height * CENTER_RATIO) / 2

  if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) return 'center'
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'up' : 'down'
}

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const moveEmptyToIndex = (order: Array<string | null>, targetIndex: number): Array<string | null> => {
  const emptyIndex = order.indexOf(null)
  if (emptyIndex < 0) return order
  const boundedIndex = clampNumber(targetIndex, 0, order.length - 1)
  if (boundedIndex === emptyIndex) return order

  const next = [...order]
  next.splice(emptyIndex, 1)
  const insertIndex = clampNumber(boundedIndex, 0, next.length)
  next.splice(insertIndex, 0, null)
  return next
}

function FolderCreatePreview({ active, icon, imgSize }: FolderCreatePreviewProps) {
  const slotSize = getFolderPreviewSlotSize(imgSize)
  const startSize = Math.max(slotSize, Math.floor(imgSize * 0.84))
  const startOffset = (imgSize - startSize) / 2

  const itemStyle = {
    width: `${active ? slotSize : startSize}px`,
    height: `${active ? slotSize : startSize}px`,
    transform: `translate3d(${active ? FOLDER_PREVIEW_PADDING : startOffset}px, ${active ? FOLDER_PREVIEW_PADDING : startOffset}px, 0)`,
    opacity: active ? 1 : 0,
    transition: `transform ${REORDER_ANIMATION_MS}ms ${FOLDER_PREVIEW_EASING}, width ${REORDER_ANIMATION_MS}ms ${FOLDER_PREVIEW_EASING}, height ${REORDER_ANIMATION_MS}ms ${FOLDER_PREVIEW_EASING}, opacity 140ms ease-out`,
  } as const

  const frameStyle = {
    width: `${imgSize}px`,
    height: `${imgSize}px`,
  } as const

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2"
      style={frameStyle}
      aria-hidden="true"
    >
      <div
        className={`${FOLDER_SURFACE_CLASS} transition-all duration-200 ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="absolute left-0 top-0 overflow-hidden rounded-[5px]" style={itemStyle}>
          {icon.icon_base64 ? (
            <img
              src={icon.icon_base64}
              alt={icon.name}
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <AppWindow className="h-full w-full text-foreground/70" />
          )}
        </div>
      </div>
    </div>
  )
}

interface FolderIconVisualProps {
  icons: DesktopIcon[]
  imgSize: number
}

function FolderIconVisual({ icons, imgSize }: FolderIconVisualProps) {
  const slotSize = getFolderPreviewSlotSize(imgSize)
  const frameStyle = {
    width: `${imgSize}px`,
    height: `${imgSize}px`,
  } as const

  return (
    <div className="relative" style={frameStyle} aria-hidden="true">
      <div className={FOLDER_SURFACE_CLASS}>
        {icons.slice(0, 4).map((icon, idx) => {
          const row = Math.floor(idx / 2)
          const col = idx % 2
          const left = FOLDER_PREVIEW_PADDING + col * (slotSize + FOLDER_PREVIEW_GAP)
          const top = FOLDER_PREVIEW_PADDING + row * (slotSize + FOLDER_PREVIEW_GAP)
          return (
            <div
              key={`${icon.id}-${idx}`}
              className="absolute overflow-hidden rounded-[5px]"
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${slotSize}px`,
                height: `${slotSize}px`,
              }}
            >
              {icon.icon_base64 ? (
                <img
                  src={icon.icon_base64}
                  alt={icon.name}
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <AppWindow className="h-full w-full text-foreground/70" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
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
  const pendingRef = useRef<PendingDrag | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const beginDragFnRef = useRef<(pending: PendingDrag, x: number, y: number) => void>(() => undefined)
  const onDragMoveFnRef = useRef<(pointerId: number, x: number, y: number) => void>(() => undefined)
  const finishDragFnRef = useRef<(pointerId: number) => void>(() => undefined)
  const clearPendingFnRef = useRef<() => void>(() => undefined)
  const prevPageEntriesRef = useRef<Array<string | null>>([])
  const prevPageRef = useRef<number>(0)
  const prevFolderEntriesRef = useRef<Array<string | null>>([])
  const tileAnimationTimerRef = useRef<Map<string, number>>(new Map())
  const folderTileAnimationTimerRef = useRef<Map<string, number>>(new Map())
  const folderDropFlightTimerRef = useRef<number | null>(null)
  const folderDropFlightIdRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const suppressClickUntilRef = useRef(0)
  const hydratedRef = useRef(false)
  const itemsRef = useRef<GridItem[]>([])

  const columnWidth = ICON_SIZE_CONFIG[iconSize].columnWidth
  const fallbackRowHeight = FALLBACK_ICON_ROW_HEIGHT[iconSize]

  const [columns, setColumns] = useState(1)
  const [rows, setRows] = useState(1)
  const [currentPage, setCurrentPage] = useState(0)
  const [hoverPage, setHoverPage] = useState<number | null>(null)
  const [itemWidth, setItemWidth] = useState<number>(columnWidth)
  const [itemHeight, setItemHeight] = useState<number>(fallbackRowHeight)
  const [items, setItems] = useState<GridItem[]>([])
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [folderItemWidth, setFolderItemWidth] = useState<number>(columnWidth)
  const [folderItemHeight, setFolderItemHeight] = useState<number>(fallbackRowHeight)
  const [folderColumns, setFolderColumns] = useState<number>(1)
  const [folderDropFlight, setFolderDropFlight] = useState<FolderDropFlight | null>(null)
  const [folderPreviewFreezeTargetId, setFolderPreviewFreezeTargetId] = useState<string | null>(null)

  useEffect(() => {
    if (!hydratedRef.current && icons.length === 0) return
    setItems(current => {
      const persisted = hydratedRef.current
        ? current.map<PersistedItem>(item =>
            item.kind === 'icon'
              ? { type: 'icon', key: item.key }
              : { type: 'folder', id: item.id, name: item.name, children: item.children.map(child => child.key) })
        : readLayout()
      return hydrateItems(icons, persisted)
    })
    hydratedRef.current = true
  }, [icons])

  useEffect(() => {
    itemsRef.current = items
    if (hydratedRef.current) writeLayout(items)
  }, [items])

  useEffect(() => {
    dragRef.current = dragState
  }, [dragState])

  useEffect(() => {
    if (!openFolderId) return
    const exists = items.some(item => item.kind === 'folder' && item.id === openFolderId)
    if (!exists) {
      setOpenFolderId(null)
    }
  }, [openFolderId, items])

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
  }, [openFolderId])

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

  const order = useMemo(() => items.map(getId), [items])
  const folderOrder = useMemo(() => openFolder?.children.map(child => child.key) ?? [], [openFolder])
  const renderOrder =
    dragState && dragState.context === 'outer' ? dragState.workingOrder : order
  const folderRenderOrder =
    dragState && dragState.context === 'folder' ? dragState.workingOrder : folderOrder
  const selectedSet = useMemo(() => new Set(selectedIconKeys), [selectedIconKeys])
  const iconConfig = ICON_SIZE_CONFIG[iconSize]

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const clearPending = () => {
    pendingRef.current = null
    clearTimer()
  }

  const collectCenters = (refs: Map<string, HTMLDivElement>) => {
    const centers: Record<string, { x: number; y: number }> = {}
    refs.forEach((node, id) => {
      const rect = node.getBoundingClientRect()
      centers[id] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })
    return centers
  }

  const getFolderMapById = (folderId: string | null, baseItems: GridItem[]) => {
    const map = new Map<string, IconItem>()
    if (!folderId) return map
    getFolderChildrenById(baseItems, folderId).forEach(child => {
      map.set(child.key, child)
    })
    return map
  }

  const resolveDragItemMap = (state: DragState): Map<string, GridItem> => {
    if (state.context === 'folder') {
      const folderMap = getFolderMapById(state.sourceFolderId, itemsRef.current)
      const gridMap = new Map<string, GridItem>()
      folderMap.forEach((item, id) => gridMap.set(id, item))
      return gridMap
    }
    const outerMap = new Map<string, GridItem>()
    itemsRef.current.forEach(item => {
      outerMap.set(getId(item), item)
    })
    return outerMap
  }

  const resolveGridMetrics = (context: DragContext) => {
    if (context === 'folder') {
      return {
        gridElement: folderGridRef.current,
        columns: Math.max(1, folderColumns),
        rows: Math.max(1, Math.ceil(Math.max(1, folderRenderOrder.length) / Math.max(1, folderColumns))),
        itemWidth: folderItemWidth,
        itemHeight: folderItemHeight,
        pageOffset: 0,
      }
    }

    return {
      gridElement: gridRef.current,
      columns: Math.max(1, columns),
      rows: Math.max(1, rows),
      itemWidth,
      itemHeight,
      pageOffset: currentPage * pageSize,
    }
  }

  const findHitByContext = (
    state: DragState,
    x: number,
    y: number,
  ): { targetId: string; zone: HoverZone } | null => {
    const metrics = resolveGridMetrics(state.context)
    const { gridElement, columns: colCount, rows: rowCount, itemWidth: tileW, itemHeight: tileH, pageOffset } =
      metrics
    if (!gridElement || colCount <= 0 || rowCount <= 0) return null

    const rect = gridElement.getBoundingClientRect()
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null

    const stepX = tileW + GRID_GAP
    const stepY = tileH + GRID_GAP
    if (stepX <= 0 || stepY <= 0) return null

    const relX = x - rect.left
    const relY = y - rect.top
    const col = Math.floor(relX / stepX)
    const row = Math.floor(relY / stepY)
    if (col < 0 || col >= colCount || row < 0 || row >= rowCount) return null

    const localX = relX - col * stepX
    const localY = relY - row * stepY
    if (localX < 0 || localX > tileW || localY < 0 || localY > tileH) return null

    const slotIndex = row * colCount + col
    const globalSlotIndex = pageOffset + slotIndex
    const targetId = state.workingOrder[globalSlotIndex]
    if (!targetId || targetId === state.draggingId) return null

    const targetRect = new DOMRect(
      rect.left + col * stepX,
      rect.top + row * stepY,
      tileW,
      tileH,
    )
    return { targetId, zone: classifyZone(targetRect, x, y) }
  }

  const resolveNearestDropOrderByContext = (state: DragState): Array<string | null> => {
    const metrics = resolveGridMetrics(state.context)
    const { gridElement, columns: colCount, rows: rowCount, itemWidth: tileW, itemHeight: tileH, pageOffset } =
      metrics
    if (!gridElement) return state.workingOrder

    const rect = gridElement.getBoundingClientRect()
    const stepX = tileW + GRID_GAP
    const stepY = tileH + GRID_GAP
    if (stepX <= 0 || stepY <= 0 || colCount <= 0 || rowCount <= 0) {
      return state.workingOrder
    }

    const clampedX = clampNumber(state.pointerX, rect.left, rect.right)
    const clampedY = clampNumber(state.pointerY, rect.top, rect.bottom)
    const col = clampNumber(
      Math.round((clampedX - rect.left - tileW / 2) / stepX),
      0,
      Math.max(0, colCount - 1),
    )
    const row = clampNumber(
      Math.round((clampedY - rect.top - tileH / 2) / stepY),
      0,
      Math.max(0, rowCount - 1),
    )
    const slotIndex = row * colCount + col
    const globalSlotIndex = clampNumber(
      pageOffset + slotIndex,
      0,
      Math.max(0, state.workingOrder.length - 1),
    )
    return moveEmptyToIndex(state.workingOrder, globalSlotIndex)
  }

  const moveDragFromFolderToOuter = (state: DragState, x: number, y: number): DragState => {
    if (state.context !== 'folder' || !state.sourceFolderId || state.draggingItem.kind !== 'icon') {
      return { ...state, pointerX: x, pointerY: y }
    }

    const currentItems = itemsRef.current
    const children = getFolderChildrenById(currentItems, state.sourceFolderId)
    const nextChildren = children.filter(child => child.key !== state.draggingId)
    if (nextChildren.length === children.length) {
      return { ...state, pointerX: x, pointerY: y }
    }

    const nextItems = replaceFolderChildren(currentItems, state.sourceFolderId, nextChildren)
    itemsRef.current = nextItems
    setItems(nextItems)
    setOpenFolderId(null)

    const nextOrder: Array<string | null> = [...nextItems.map(getId), null]
    const outerCenters = collectCenters(tileRefs.current)
    outerCenters[state.draggingId] = { x, y }
    const outerState: DragState = {
      ...state,
      context: 'outer',
      sourceFolderId: null,
      pointerX: x,
      pointerY: y,
      workingOrder: nextOrder,
      hoverTargetId: null,
      hoverZone: null,
      centerStartedAt: null,
      folderPreviewTargetId: null,
      lastEvasionSignature: null,
      lastEvasionTriggerPointer: null,
      lastEvasionAt: null,
      initialCenters: outerCenters,
    }
    return {
      ...outerState,
      workingOrder: resolveNearestDropOrderByContext(outerState),
    }
  }

  const beginDrag = (pending: PendingDrag, x: number, y: number) => {
    clearTimer()
    if (folderDropFlightTimerRef.current !== null) {
      window.clearTimeout(folderDropFlightTimerRef.current)
      folderDropFlightTimerRef.current = null
    }
    setFolderDropFlight(null)
    setFolderPreviewFreezeTargetId(null)
    const sourceOrder =
      pending.context === 'folder' && pending.sourceFolderId
        ? getFolderChildrenById(itemsRef.current, pending.sourceFolderId).map(child => child.key)
        : itemsRef.current.map(getId)
    const sourceIndex = sourceOrder.indexOf(pending.itemId)
    if (sourceIndex < 0) {
      clearPending()
      return
    }

    const draggingItem =
      pending.context === 'folder' && pending.sourceFolderId
        ? getFolderMapById(pending.sourceFolderId, itemsRef.current).get(pending.itemId)
        : itemById.get(pending.itemId)
    if (!draggingItem) {
      clearPending()
      return
    }

    const workingOrder: Array<string | null> = [...sourceOrder]
    workingOrder[sourceIndex] = null
    const nextState: DragState = {
      context: pending.context,
      sourceFolderId: pending.sourceFolderId,
      pointerId: pending.pointerId,
      draggingId: pending.itemId,
      draggingItem,
      pointerX: x,
      pointerY: y,
      offsetX: pending.offsetX,
      offsetY: pending.offsetY,
      workingOrder,
      hoverTargetId: null,
      hoverZone: null,
      centerStartedAt: null,
      folderPreviewTargetId: null,
      lastEvasionSignature: null,
      lastEvasionTriggerPointer: null,
      lastEvasionAt: null,
      initialCenters:
        pending.context === 'folder'
          ? collectCenters(folderTileRefs.current)
          : collectCenters(tileRefs.current),
    }
    dragRef.current = nextState
    setDragState(nextState)
    clearPending()
  }

  const onDragMove = (pointerId: number, x: number, y: number) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointerId) return

    let baseState: DragState = { ...current, pointerX: x, pointerY: y }
    if (current.context === 'folder') {
      const panel = folderPanelRef.current
      if (panel) {
        const panelRect = panel.getBoundingClientRect()
        const outsidePanel =
          x < panelRect.left || x > panelRect.right || y < panelRect.top || y > panelRect.bottom
        if (outsidePanel) {
          baseState = moveDragFromFolderToOuter(baseState, x, y)
        }
      }
    }

    const hit = findHitByContext(baseState, x, y)
    if (!hit) {
      const resetState: DragState = {
        ...baseState,
        hoverTargetId: null,
        hoverZone: null,
        centerStartedAt: null,
        folderPreviewTargetId: null,
        lastEvasionSignature: null,
      }
      dragRef.current = resetState
      setDragState(resetState)
      return
    }

    const itemMap = resolveDragItemMap(baseState)
    const source = baseState.draggingItem
    const target = itemMap.get(hit.targetId)
    if (!target) {
      dragRef.current = baseState
      setDragState(baseState)
      return
    }

    const next: DragState = {
      ...baseState,
      hoverTargetId: hit.targetId,
      hoverZone: hit.zone,
    }

    const canFolder = source.kind === 'icon' && target.kind === 'icon'
    const allowFolderCreate = baseState.context === 'outer'
    if (allowFolderCreate && canFolder && hit.zone === 'center') {
      const now = performance.now()
      const sameCenter =
        baseState.hoverTargetId === hit.targetId &&
        baseState.hoverZone === 'center' &&
        baseState.centerStartedAt !== null
      const startAt = sameCenter && baseState.centerStartedAt !== null ? baseState.centerStartedAt : now
      next.centerStartedAt = startAt
      next.folderPreviewTargetId = now - startAt >= FOLDER_DWELL_MS ? hit.targetId : null
      next.lastEvasionSignature = null
      dragRef.current = next
      setDragState(next)
      return
    }

    next.centerStartedAt = null
    next.folderPreviewTargetId = null

    const sourceCenter = baseState.initialCenters[baseState.draggingId]
    const targetCenter = baseState.initialCenters[hit.targetId]
    const horizontal =
      !sourceCenter || !targetCenter
        ? null
        : targetCenter.x > sourceCenter.x
          ? 'right'
          : targetCenter.x < sourceCenter.x
            ? 'left'
            : null

    const sideZone = hit.zone === 'left' || hit.zone === 'right'
    const shouldEvasion = canFolder && sideZone && horizontal === hit.zone
    const targetIndex = baseState.workingOrder.indexOf(hit.targetId)
    if (targetIndex < 0) {
      dragRef.current = next
      setDragState(next)
      return
    }

    let desiredHoleIndex = targetIndex
    if (shouldEvasion) {
      const now = performance.now()
      const signature = `${hit.targetId}:${hit.zone}`
      const movedSinceLastEvasion =
        !baseState.lastEvasionTriggerPointer ||
        Math.hypot(
          x - baseState.lastEvasionTriggerPointer.x,
          y - baseState.lastEvasionTriggerPointer.y,
        ) >= EVASION_REARM_DISTANCE
      const cooledDownSinceLastEvasion =
        baseState.lastEvasionAt === null || now - baseState.lastEvasionAt >= EVASION_COOLDOWN_MS

      const shouldTriggerThisFrame =
        movedSinceLastEvasion &&
        cooledDownSinceLastEvasion &&
        baseState.lastEvasionSignature !== signature

      if (!shouldTriggerThisFrame) {
        next.lastEvasionSignature = baseState.lastEvasionSignature
        next.lastEvasionAt = baseState.lastEvasionAt
        dragRef.current = next
        setDragState(next)
        return
      }

      next.lastEvasionSignature = signature
      next.lastEvasionTriggerPointer = { x, y }
      next.lastEvasionAt = now
    } else {
      next.lastEvasionSignature = null
      next.lastEvasionAt = baseState.lastEvasionAt
      if (hit.zone === 'right' || hit.zone === 'down') {
        desiredHoleIndex = Math.min(baseState.workingOrder.length - 1, targetIndex + 1)
      }
    }

    next.workingOrder = moveEmptyToIndex(baseState.workingOrder, desiredHoleIndex)
    dragRef.current = next
    setDragState(next)
  }

  const applyFolderCreateFromSession = (base: GridItem[], session: DragState): GridItem[] => {
    const map = new Map<string, GridItem>()
    base.forEach(item => map.set(getId(item), item))
    const sourceExistsInBase = map.has(session.draggingId)
    map.set(session.draggingId, session.draggingItem)
    const sourceItem = map.get(session.draggingId)
    const targetId = session.folderPreviewTargetId as string
    const targetItem = map.get(targetId)
    if (!sourceItem || !targetItem || sourceItem.kind !== 'icon' || targetItem.kind !== 'icon') {
      return base
    }

    const orderWithoutDragged = session.workingOrder.filter((id): id is string => id !== null)
    const targetIndex = orderWithoutDragged.indexOf(targetId)
    if (targetIndex < 0) return base

    const nextOrder = orderWithoutDragged.filter(id => id !== targetId)
    const folder: FolderItem = {
      kind: 'folder',
      id: makeFolderId(),
      name: 'New Folder',
      children: [targetItem, sourceItem],
    }
    const folderId = getId(folder)
    map.delete(session.draggingId)
    map.delete(targetId)
    map.set(folderId, folder)
    nextOrder.splice(targetIndex, 0, folderId)
    const nextItems = nextOrder.map(id => map.get(id)).filter((item): item is GridItem => Boolean(item))
    const expectedLength = sourceExistsInBase ? base.length - 1 : base.length
    return nextItems.length === expectedLength ? nextItems : base
  }

  const resolveFolderSecondSlotCenter = (targetId: string): { x: number; y: number; size: number } | null => {
    const targetNode = tileRefs.current.get(targetId)
    if (!targetNode) return null

    const rect = targetNode.getBoundingClientRect()
    const frameSize = iconConfig.imgSize
    const slotSize = getFolderPreviewSlotSize(frameSize)
    const frameLeft = rect.left + (rect.width - frameSize) / 2
    const frameTop = rect.top + FOLDER_PREVIEW_TOP_OFFSET
    const slotLeft = frameLeft + FOLDER_PREVIEW_PADDING + slotSize + FOLDER_PREVIEW_GAP
    const slotTop = frameTop + FOLDER_PREVIEW_PADDING

    return {
      x: slotLeft + slotSize / 2,
      y: slotTop + slotSize / 2,
      size: slotSize,
    }
  }

  const finishDrag = (pointerId: number) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointerId) return

    if (current.context === 'folder') {
      const folderMap = getFolderMapById(current.sourceFolderId, itemsRef.current)
      const target = current.hoverTargetId ? folderMap.get(current.hoverTargetId) : null
      const hasValidHoverTarget = Boolean(current.hoverTargetId && target)
      const dropOrder =
        hasValidHoverTarget && current.hoverTargetId
          ? current.hoverZone === 'center' && current.draggingItem.kind === 'icon' && target?.kind === 'icon'
            ? (() => {
                const targetIndex = current.workingOrder.indexOf(current.hoverTargetId)
                if (targetIndex < 0) return current.workingOrder
                return moveEmptyToIndex(current.workingOrder, targetIndex)
              })()
            : current.workingOrder
          : resolveNearestDropOrderByContext(current)

      setItems(base => {
        if (!current.sourceFolderId || current.draggingItem.kind !== 'icon') return base
        const children = getFolderChildrenById(base, current.sourceFolderId)
        if (children.length === 0) return base
        const map = new Map<string, IconItem>()
        children.forEach(child => map.set(child.key, child))
        map.set(current.draggingId, current.draggingItem)
        const nextOrder = [...dropOrder]
        const emptyIndex = nextOrder.indexOf(null)
        if (emptyIndex < 0) return base
        nextOrder[emptyIndex] = current.draggingId
        const normalized = nextOrder.filter((id): id is string => id !== null)
        const nextChildren = normalized.map(id => map.get(id)).filter((item): item is IconItem => Boolean(item))
        if (nextChildren.length !== children.length) return base
        return replaceFolderChildren(base, current.sourceFolderId, nextChildren)
      })
    } else {
      const outerMap = new Map<string, GridItem>()
      itemsRef.current.forEach(item => outerMap.set(getId(item), item))
      const source = current.draggingItem
      const target = current.hoverTargetId ? outerMap.get(current.hoverTargetId) : null
      const canCreateFolder =
        current.folderPreviewTargetId !== null &&
        current.folderPreviewTargetId === current.hoverTargetId &&
        current.hoverZone === 'center' &&
        source.kind === 'icon' &&
        target?.kind === 'icon'

      if (canCreateFolder) {
        const targetId = current.folderPreviewTargetId as string
        const sourceItem = source.kind === 'icon' ? source : null
        const slotCenter = resolveFolderSecondSlotCenter(targetId)
        if (sourceItem && slotCenter) {
          if (folderDropFlightTimerRef.current !== null) {
            window.clearTimeout(folderDropFlightTimerRef.current)
            folderDropFlightTimerRef.current = null
          }

          const flightId = folderDropFlightIdRef.current + 1
          folderDropFlightIdRef.current = flightId
          setFolderPreviewFreezeTargetId(targetId)
          setFolderDropFlight({
            id: flightId,
            icon: sourceItem.icon,
            startX: current.pointerX,
            startY: current.pointerY,
            startSize: iconConfig.imgSize,
            endX: slotCenter.x,
            endY: slotCenter.y,
            endSize: slotCenter.size,
            animate: false,
          })

          folderDropFlightTimerRef.current = window.setTimeout(() => {
            setItems(base => applyFolderCreateFromSession(base, current))
            setFolderDropFlight(prev => (prev && prev.id === flightId ? null : prev))
            setFolderPreviewFreezeTargetId(prev => (prev === targetId ? null : prev))
            folderDropFlightTimerRef.current = null
          }, REORDER_ANIMATION_MS + 30)
        } else {
          setFolderPreviewFreezeTargetId(null)
          setItems(base => applyFolderCreateFromSession(base, current))
        }
      } else {
        setFolderPreviewFreezeTargetId(null)
        const hasValidHoverTarget = Boolean(current.hoverTargetId && target)
        const dropOrder =
          hasValidHoverTarget && current.hoverTargetId
            ? current.hoverZone === 'center' && source.kind === 'icon' && target?.kind === 'icon'
              ? (() => {
                  const targetIndex = current.workingOrder.indexOf(current.hoverTargetId)
                  if (targetIndex < 0) return current.workingOrder
                  return moveEmptyToIndex(current.workingOrder, targetIndex)
                })()
              : current.workingOrder
            : resolveNearestDropOrderByContext(current)
        setItems(base => {
          const map = new Map<string, GridItem>()
          base.forEach(item => map.set(getId(item), item))
          const hadDraggedInBase = map.has(current.draggingId)
          map.set(current.draggingId, current.draggingItem)
          const nextOrder = [...dropOrder]
          const emptyIndex = nextOrder.indexOf(null)
          if (emptyIndex < 0) return base
          nextOrder[emptyIndex] = current.draggingId
          const normalized = nextOrder.filter((id): id is string => id !== null)
          const nextItems = normalized.map(id => map.get(id)).filter((item): item is GridItem => Boolean(item))
          const expectedLength = hadDraggedInBase ? base.length : base.length + 1
          return nextItems.length === expectedLength ? nextItems : base
        })
      }
    }

    suppressClickUntilRef.current = performance.now() + 300
    dragRef.current = null
    setDragState(null)
  }

  useEffect(() => {
    beginDragFnRef.current = beginDrag
  }, [beginDrag])

  useEffect(() => {
    onDragMoveFnRef.current = onDragMove
  }, [onDragMove])

  useEffect(() => {
    finishDragFnRef.current = finishDrag
  }, [finishDrag])

  useEffect(() => {
    clearPendingFnRef.current = clearPending
  }, [clearPending])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = dragRef.current
      if (current && current.pointerId === event.pointerId) {
        event.preventDefault()
        onDragMoveFnRef.current(event.pointerId, event.clientX, event.clientY)
        return
      }

      const pending = pendingRef.current
      if (!pending || pending.pointerId !== event.pointerId) return
      const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY)
      if (distance > DRAG_MOVE_THRESHOLD) {
        beginDragFnRef.current(pending, event.clientX, event.clientY)
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        finishDragFnRef.current(event.pointerId)
        return
      }
      if (pendingRef.current?.pointerId === event.pointerId) {
        clearPendingFnRef.current()
      }
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null
        setDragState(null)
      }
      if (pendingRef.current?.pointerId === event.pointerId) {
        clearPendingFnRef.current()
      }
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [])

  useEffect(() => () => clearTimer(), [])

  const handleTilePointerDown = (event: ReactPointerEvent<HTMLDivElement>, itemId: string) => {
    if (selectionMode || event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    pendingRef.current = {
      context: 'outer',
      sourceFolderId: null,
      pointerId: event.pointerId,
      itemId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== event.pointerId) return
      beginDrag(pending, pending.startX, pending.startY)
    }, DRAG_LONG_PRESS_MS)
  }

  const handleFolderTilePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    folderId: string,
    itemId: string,
  ) => {
    if (selectionMode || event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    pendingRef.current = {
      context: 'folder',
      sourceFolderId: folderId,
      pointerId: event.pointerId,
      itemId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== event.pointerId) return
      beginDrag(pending, pending.startX, pending.startY)
    }, DRAG_LONG_PRESS_MS)
  }

  const handleTileClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (performance.now() < suppressClickUntilRef.current) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

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
  const outerRenderCount = dragState?.context === 'outer' ? renderOrder.length : items.length
  const pageCount = Math.max(1, Math.ceil(outerRenderCount / pageSize))
  useEffect(() => {
    if (currentPage >= pageCount) setCurrentPage(pageCount - 1)
  }, [currentPage, pageCount])
  useEffect(() => {
    if (hoverPage !== null && hoverPage >= pageCount) setHoverPage(null)
  }, [hoverPage, pageCount])
  useEffect(() => {
    setCurrentPage(0)
  }, [items.length, iconSize, pageSize])

  const pageItems = useMemo(() => {
    const start = currentPage * pageSize
    return renderOrder.slice(start, start + pageSize)
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
      if (entry === null) return
      const id = entry
      prevIndexMap.set(id, index)
    })

    const stepX = itemWidth + GRID_GAP
    const stepY = itemHeight + GRID_GAP
    currentPageEntries.forEach((entry, newIndex) => {
      if (entry === null) return
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
      if (entry === null) return
      prevIndexMap.set(entry, index)
    })

    const stepX = folderItemWidth + GRID_GAP
    const stepY = folderItemHeight + GRID_GAP
    currentEntries.forEach((entry, newIndex) => {
      if (entry === null) return
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
      if (folderDropFlightTimerRef.current !== null) {
        window.clearTimeout(folderDropFlightTimerRef.current)
        folderDropFlightTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!folderDropFlight || folderDropFlight.animate) return
    const raf = requestAnimationFrame(() => {
      setFolderDropFlight(prev => (prev ? { ...prev, animate: true } : prev))
    })
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [folderDropFlight])

  const gridWidth = columns * itemWidth + Math.max(0, columns - 1) * GRID_GAP
  const gridHeight = rows * itemHeight + Math.max(0, rows - 1) * GRID_GAP
  const ghostItem = dragState ? dragState.draggingItem : null

  return (
    <div className="relative h-full w-full px-16 pb-20 pt-24">
      <div ref={containerRef} className="flex h-full w-full items-center justify-center">
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
            className="grid h-full w-full content-start justify-items-center gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, ${itemWidth}px)` }}
          >
            {pageItems.map((entry, index) => {
              if (entry === null) {
                return (
                  <div
                    key={`empty-${currentPage}-${index}`}
                    data-grid-item
                    className="h-full w-full rounded-2xl border border-white/10 bg-white/5"
                    aria-hidden="true"
                  />
                )
              }

              const item = itemById.get(entry)
              if (!item) return null
              const folderPreview =
                (dragState?.context === 'outer' && dragState.folderPreviewTargetId === entry) ||
                folderPreviewFreezeTargetId === entry

              return (
                <div
                  key={entry}
                  ref={node => {
                    if (node) tileRefs.current.set(entry, node)
                    else tileRefs.current.delete(entry)
                  }}
                  data-grid-item
                  className="relative touch-none"
                  onPointerDown={event => handleTilePointerDown(event, entry)}
                  onClickCapture={handleTileClickCapture}
                >
                  {item.kind === 'icon' ? (
                    <div
                      className={`transition-opacity duration-200 ${
                        folderPreview ? 'opacity-45' : 'opacity-100'
                      }`}
                    >
                      <Icon
                        icon={item.icon}
                        selectionKey={item.key}
                        selectionMode={selectionMode}
                        selected={selectedSet.has(item.key)}
                        onToggleSelect={toggleSelectIcon}
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
                        setOpenFolderId(item.id)
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
                    />
                  ) : null}

                </div>
              )
            })}
          </div>

          <div
            data-pagination
            className="absolute left-1/2 z-10 -translate-x-1/2 px-3 py-1.5"
            style={{ top: `calc(100% + ${PAGINATION_OFFSET}px)` }}
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
                    onClick={() => setCurrentPage(index)}
                    className={`relative rounded-full transition-all duration-250 ease-out ${
                      isCurrent
                        ? 'bg-white/95 shadow-[0_0_10px_rgba(255,255,255,0.75)]'
                        : isHovered
                          ? 'bg-white/55'
                          : 'bg-white/35 hover:bg-white/45'
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
        </div>
      </div>

      {openFolder ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
          onPointerDown={event => {
            event.stopPropagation()
            if (event.target !== event.currentTarget) return
            if (dragState?.context === 'folder') return
            setOpenFolderId(null)
          }}
          onClick={event => {
            event.stopPropagation()
          }}
        >
          <div
            data-icon
            ref={folderPanelRef}
            className="relative overflow-hidden rounded-3xl border border-white/15 bg-black/55 p-5 shadow-[0_24px_56px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            style={{
              width: `min(92vw, ${FOLDER_MODAL_MAX_WIDTH}px)`,
              maxHeight: `min(80vh, ${FOLDER_MODAL_MAX_HEIGHT}px)`,
            }}
            onPointerDown={event => {
              event.stopPropagation()
            }}
            onClick={event => {
              event.stopPropagation()
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="truncate text-sm font-medium text-white/90" title={openFolder.name}>
                {openFolder.name}
              </h3>
              <button
                type="button"
                className="rounded-full border border-white/25 px-3 py-1 text-xs text-white/85 transition-colors hover:bg-white/15"
                onClick={() => setOpenFolderId(null)}
              >
                Close
              </button>
            </div>

            <div
              ref={folderGridContainerRef}
              className="overflow-auto"
              style={{ maxHeight: `calc(min(80vh, ${FOLDER_MODAL_MAX_HEIGHT}px) - 88px)` }}
            >
              <div
                ref={folderGridRef}
                className="grid content-start justify-items-center gap-2"
                style={{ gridTemplateColumns: `repeat(${Math.max(1, folderColumns)}, ${folderItemWidth}px)` }}
              >
                {folderRenderOrder.map((entry, index) => {
                  if (entry === null) {
                    return (
                      <div
                        key={`folder-empty-${index}`}
                        data-folder-grid-item
                        className="h-full w-full rounded-2xl border border-white/10 bg-white/5"
                        aria-hidden="true"
                      />
                    )
                  }

                  const item = folderItemById.get(entry)
                  if (!item || !openFolder) return null

                  return (
                    <div
                      key={entry}
                      ref={node => {
                        if (node) folderTileRefs.current.set(entry, node)
                        else folderTileRefs.current.delete(entry)
                      }}
                      data-folder-grid-item
                      className="relative touch-none"
                      onPointerDown={event => handleFolderTilePointerDown(event, openFolder.id, entry)}
                      onClickCapture={handleTileClickCapture}
                    >
                      <Icon
                        icon={item.icon}
                        selectionKey={item.key}
                        selectionMode={selectionMode}
                        selected={selectedSet.has(item.key)}
                        onToggleSelect={toggleSelectIcon}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {dragState && ghostItem ? (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            width: iconConfig.imgSize,
            height: iconConfig.imgSize,
            left: dragState.pointerX - iconConfig.imgSize / 2,
            top: dragState.pointerY - iconConfig.imgSize / 2,
          }}
        >
          <div
            className="flex items-center justify-center"
            style={{ width: iconConfig.imgSize, height: iconConfig.imgSize }}
          >
            {ghostItem.kind === 'icon' ? (
              ghostItem.icon.icon_base64 ? (
                <img
                  src={ghostItem.icon.icon_base64}
                  alt={ghostItem.icon.name}
                  className="object-contain"
                  style={{ width: iconConfig.imgSize, height: iconConfig.imgSize }}
                  draggable={false}
                />
              ) : (
                <AppWindow className="h-8 w-8 text-foreground/70" />
              )
            ) : (
              <FolderIconVisual
                icons={ghostItem.children.map(child => child.icon)}
                imgSize={iconConfig.imgSize}
              />
            )}
          </div>
        </div>
      ) : null}

      {folderDropFlight ? (
        <div
          className="pointer-events-none fixed z-[55]"
          style={{
            left:
              (folderDropFlight.animate ? folderDropFlight.endX : folderDropFlight.startX) -
              (folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize) / 2,
            top:
              (folderDropFlight.animate ? folderDropFlight.endY : folderDropFlight.startY) -
              (folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize) / 2,
            width: folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize,
            height: folderDropFlight.animate ? folderDropFlight.endSize : folderDropFlight.startSize,
            opacity: folderDropFlight.animate ? 0.92 : 1,
            transition: `left ${REORDER_ANIMATION_MS}ms ${FOLDER_PREVIEW_EASING}, top ${REORDER_ANIMATION_MS}ms ${FOLDER_PREVIEW_EASING}, width ${REORDER_ANIMATION_MS}ms ${FOLDER_PREVIEW_EASING}, height ${REORDER_ANIMATION_MS}ms ${FOLDER_PREVIEW_EASING}, opacity ${REORDER_ANIMATION_MS}ms ease-out`,
          }}
        >
          {folderDropFlight.icon.icon_base64 ? (
            <img
              src={folderDropFlight.icon.icon_base64}
              alt={folderDropFlight.icon.name}
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <AppWindow className="h-full w-full text-foreground/70" />
          )}
        </div>
      ) : null}
    </div>
  )
}
