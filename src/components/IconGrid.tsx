import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AppWindow, Folder } from 'lucide-react'
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
  pointerId: number
  draggingId: string
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
  pointerId: number
  itemId: string
  startX: number
  startY: number
  offsetX: number
  offsetY: number
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

export function IconGrid({ icons }: IconGridProps) {
  const { iconSize, selectionMode, selectedIconKeys, toggleSelectIcon } = useIconStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const pendingRef = useRef<PendingDrag | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const beginDragFnRef = useRef<(pending: PendingDrag, x: number, y: number) => void>(() => undefined)
  const onDragMoveFnRef = useRef<(pointerId: number, x: number, y: number) => void>(() => undefined)
  const finishDragFnRef = useRef<(pointerId: number) => void>(() => undefined)
  const clearPendingFnRef = useRef<() => void>(() => undefined)
  const prevPageEntriesRef = useRef<Array<string | null>>([])
  const prevPageRef = useRef<number>(0)
  const tileAnimationTimerRef = useRef<Map<string, number>>(new Map())
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

  const itemById = useMemo(() => {
    const map = new Map<string, GridItem>()
    items.forEach(item => map.set(getId(item), item))
    return map
  }, [items])

  const order = useMemo(() => items.map(getId), [items])
  const renderOrder = dragState ? dragState.workingOrder : order
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

  const collectCenters = () => {
    const centers: Record<string, { x: number; y: number }> = {}
    tileRefs.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect()
      centers[id] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })
    return centers
  }

  const findHit = (
    x: number,
    y: number,
    draggingId: string,
    workingOrder: Array<string | null>,
  ): { targetId: string; zone: HoverZone } | null => {
    const gridElement = gridRef.current
    if (!gridElement || columns <= 0 || rows <= 0) return null

    const rect = gridElement.getBoundingClientRect()
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null

    const stepX = itemWidth + GRID_GAP
    const stepY = itemHeight + GRID_GAP
    if (stepX <= 0 || stepY <= 0) return null

    const relX = x - rect.left
    const relY = y - rect.top
    const col = Math.floor(relX / stepX)
    const row = Math.floor(relY / stepY)
    if (col < 0 || col >= columns || row < 0 || row >= rows) return null

    const localX = relX - col * stepX
    const localY = relY - row * stepY
    if (localX < 0 || localX > itemWidth || localY < 0 || localY > itemHeight) return null

    const pageSlotIndex = row * columns + col
    const globalSlotIndex = currentPage * pageSize + pageSlotIndex
    const targetId = workingOrder[globalSlotIndex]
    if (!targetId || targetId === draggingId) return null

    const targetRect = new DOMRect(
      rect.left + col * stepX,
      rect.top + row * stepY,
      itemWidth,
      itemHeight,
    )
    return { targetId, zone: classifyZone(targetRect, x, y) }
  }

  const beginDrag = (pending: PendingDrag, x: number, y: number) => {
    clearTimer()
    const sourceOrder = itemsRef.current.map(getId)
    const sourceIndex = sourceOrder.indexOf(pending.itemId)
    if (sourceIndex < 0) {
      clearPending()
      return
    }

    const workingOrder: Array<string | null> = [...sourceOrder]
    workingOrder[sourceIndex] = null
    const nextState: DragState = {
      pointerId: pending.pointerId,
      draggingId: pending.itemId,
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
      initialCenters: collectCenters(),
    }
    dragRef.current = nextState
    setDragState(nextState)
    clearPending()
  }

  const onDragMove = (pointerId: number, x: number, y: number) => {
    setDragState(current => {
      if (!current || current.pointerId !== pointerId) return current
      const sync = (state: DragState) => {
        dragRef.current = state
        return state
      }
      const next: DragState = { ...current, pointerX: x, pointerY: y }
      const hit = findHit(x, y, current.draggingId, current.workingOrder)
      if (!hit) {
        next.hoverTargetId = null
        next.hoverZone = null
        next.centerStartedAt = null
        next.folderPreviewTargetId = null
        next.lastEvasionSignature = null
        return sync(next)
      }

      const source = itemById.get(current.draggingId)
      const target = itemById.get(hit.targetId)
      if (!source || !target) return sync(next)

      next.hoverTargetId = hit.targetId
      next.hoverZone = hit.zone

      const canFolder = source.kind === 'icon' && target.kind === 'icon'
      if (canFolder && hit.zone === 'center') {
        const now = performance.now()
        const sameCenter =
          current.hoverTargetId === hit.targetId &&
          current.hoverZone === 'center' &&
          current.centerStartedAt !== null
        const startAt =
          sameCenter && current.centerStartedAt !== null ? current.centerStartedAt : now
        next.centerStartedAt = startAt
        next.folderPreviewTargetId = now - startAt >= FOLDER_DWELL_MS ? hit.targetId : null
        next.lastEvasionSignature = null
        return sync(next)
      }

      next.centerStartedAt = null
      next.folderPreviewTargetId = null

      const sourceCenter = current.initialCenters[current.draggingId]
      const targetCenter = current.initialCenters[hit.targetId]
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
      const targetIndex = current.workingOrder.indexOf(hit.targetId)
      if (targetIndex < 0) return sync(next)

      let desiredHoleIndex = targetIndex
      if (shouldEvasion) {
        const now = performance.now()
        const signature = `${hit.targetId}:${hit.zone}`
        const movedSinceLastEvasion =
          !current.lastEvasionTriggerPointer ||
          Math.hypot(
            x - current.lastEvasionTriggerPointer.x,
            y - current.lastEvasionTriggerPointer.y,
          ) >= EVASION_REARM_DISTANCE
        const cooledDownSinceLastEvasion =
          current.lastEvasionAt === null || now - current.lastEvasionAt >= EVASION_COOLDOWN_MS

        const shouldTriggerThisFrame =
          movedSinceLastEvasion &&
          cooledDownSinceLastEvasion &&
          current.lastEvasionSignature !== signature

        if (!shouldTriggerThisFrame) {
          next.lastEvasionSignature = current.lastEvasionSignature
          next.lastEvasionAt = current.lastEvasionAt
          return sync(next)
        }

        next.lastEvasionSignature = signature
        next.lastEvasionTriggerPointer = { x, y }
        next.lastEvasionAt = now
      } else {
        next.lastEvasionSignature = null
        next.lastEvasionAt = current.lastEvasionAt
        if (hit.zone === 'right' || hit.zone === 'down') {
          desiredHoleIndex = Math.min(current.workingOrder.length - 1, targetIndex + 1)
        }
      }

      next.workingOrder = moveEmptyToIndex(current.workingOrder, desiredHoleIndex)
      return sync(next)
    })
  }

  const finishDrag = (pointerId: number) => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointerId) return

    const source = itemById.get(current.draggingId)
    const target = current.hoverTargetId ? itemById.get(current.hoverTargetId) : null
    const canCreateFolder =
      current.folderPreviewTargetId !== null &&
      current.folderPreviewTargetId === current.hoverTargetId &&
      current.hoverZone === 'center' &&
      source?.kind === 'icon' &&
      target?.kind === 'icon'

    if (canCreateFolder) {
      setItems(base => {
        const map = new Map<string, GridItem>()
        base.forEach(item => map.set(getId(item), item))
        const sourceItem = map.get(current.draggingId)
        const targetId = current.folderPreviewTargetId as string
        const targetItem = map.get(targetId)
        if (!sourceItem || !targetItem || sourceItem.kind !== 'icon' || targetItem.kind !== 'icon') {
          return base
        }

        const orderWithoutDragged = current.workingOrder.filter((id): id is string => id !== null)
        const targetIndex = orderWithoutDragged.indexOf(targetId)
        if (targetIndex < 0) return base

        const nextOrder = orderWithoutDragged.filter(id => id !== targetId)
        const folder: FolderItem = {
          kind: 'folder',
          id: makeFolderId(),
          name: 'New Folder',
          children: [sourceItem, targetItem],
        }
        const folderId = getId(folder)
        map.delete(current.draggingId)
        map.delete(targetId)
        map.set(folderId, folder)
        nextOrder.splice(targetIndex, 0, folderId)
        const nextItems = nextOrder.map(id => map.get(id)).filter((item): item is GridItem => Boolean(item))
        return nextItems.length === base.length - 1 ? nextItems : base
      })
    } else {
      const resolveNearestDropOrder = (): Array<string | null> => {
        const gridElement = gridRef.current
        if (!gridElement) return current.workingOrder

        const rect = gridElement.getBoundingClientRect()
        const stepX = itemWidth + GRID_GAP
        const stepY = itemHeight + GRID_GAP
        if (stepX <= 0 || stepY <= 0 || columns <= 0 || rows <= 0) {
          return current.workingOrder
        }

        const clampedX = clampNumber(current.pointerX, rect.left, rect.right)
        const clampedY = clampNumber(current.pointerY, rect.top, rect.bottom)
        const col = clampNumber(
          Math.round((clampedX - rect.left - itemWidth / 2) / stepX),
          0,
          Math.max(0, columns - 1),
        )
        const row = clampNumber(
          Math.round((clampedY - rect.top - itemHeight / 2) / stepY),
          0,
          Math.max(0, rows - 1),
        )
        const slotIndexInPage = row * columns + col
        const globalSlotIndex = clampNumber(
          currentPage * pageSize + slotIndexInPage,
          0,
          Math.max(0, current.workingOrder.length - 1),
        )
        return moveEmptyToIndex(current.workingOrder, globalSlotIndex)
      }

      const hasValidHoverTarget = Boolean(current.hoverTargetId && target)
      const dropOrder =
        hasValidHoverTarget && current.hoverTargetId
          ? current.hoverZone === 'center' && source?.kind === 'icon' && target?.kind === 'icon'
            ? (() => {
                const targetIndex = current.workingOrder.indexOf(current.hoverTargetId)
                if (targetIndex < 0) return current.workingOrder
                return moveEmptyToIndex(current.workingOrder, targetIndex)
              })()
            : current.workingOrder
          : resolveNearestDropOrder()
      setItems(base => {
        const map = new Map<string, GridItem>()
        base.forEach(item => map.set(getId(item), item))
        const nextOrder = [...dropOrder]
        const emptyIndex = nextOrder.indexOf(null)
        if (emptyIndex < 0) return base
        nextOrder[emptyIndex] = current.draggingId
        const normalized = nextOrder.filter((id): id is string => id !== null)
        const nextItems = normalized.map(id => map.get(id)).filter((item): item is GridItem => Boolean(item))
        return nextItems.length === base.length ? nextItems : base
      })
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

  const pageSize = Math.max(1, columns * rows)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
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

  useEffect(() => {
    return () => {
      tileAnimationTimerRef.current.forEach(timer => {
        window.clearTimeout(timer)
      })
      tileAnimationTimerRef.current.clear()
    }
  }, [])

  const gridWidth = columns * itemWidth + Math.max(0, columns - 1) * GRID_GAP
  const gridHeight = rows * itemHeight + Math.max(0, rows - 1) * GRID_GAP
  const ghostItem = dragState ? itemById.get(dragState.draggingId) : null

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
              const folderPreview = dragState?.folderPreviewTargetId === entry

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
                    <Icon
                      icon={item.icon}
                      selectionKey={item.key}
                      selectionMode={selectionMode}
                      selected={selectedSet.has(item.key)}
                      onToggleSelect={toggleSelectIcon}
                    />
                  ) : (
                    <button
                      data-icon
                      type="button"
                      className="relative flex cursor-default flex-col items-center gap-2 rounded-2xl border-none p-3"
                      style={{ width: iconConfig.containerWidth }}
                      title={item.name}
                    >
                      <div
                        className="flex items-center justify-center rounded-xl bg-yellow-400/20"
                        style={{ width: iconConfig.imgSize, height: iconConfig.imgSize }}
                      >
                        <Folder className="h-8 w-8 text-yellow-300" />
                      </div>
                      <span
                        className="truncate text-center text-[11px] leading-tight text-foreground"
                        style={{ maxWidth: iconConfig.containerWidth - 10 }}
                      >
                        {item.name}
                      </span>
                      <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] text-white/70">
                        {item.children.length}
                      </span>
                    </button>
                  )}

                  {folderPreview ? (
                    <div className="pointer-events-none absolute inset-1 z-20 rounded-2xl border border-emerald-300/80 bg-emerald-400/20">
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
                        Release to create folder
                      </div>
                    </div>
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
            className="flex items-center justify-center overflow-hidden"
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
              <Folder className="h-8 w-8 text-yellow-300" />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
