import { LayoutGroup } from 'framer-motion'
import {
  useCallback,
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
import { translate } from '../lib/i18n'
import type {
  FolderItem,
  FolderSize,
  GridItem,
  IconItem,
  PersistedLayout,
  ScrollGroupMeta,
} from './icon-grid/model'
import { getGridItemSpan, getId, makeFolderId } from './icon-grid/model'
import { compactEmptyPages, DRAG_HOLE_ID, areSlotsEqual } from './icon-grid/domain/slots'
import { clampNumber } from './icon-grid/domain/geometry'
import type { DragState } from './icon-grid/state/types'
import {
  hydrateDockKeys,
  hydrateItems,
  readLayout,
  serializeItems,
  writeLayout,
} from './icon-grid/services/layoutStore'
import { useScrollableIconGridDragWorkflow } from './icon-grid/scroll/useScrollableIconGridDragWorkflow'
import {
  FOLDER_MODAL_MAX_HEIGHT,
  FOLDER_MODAL_MAX_WIDTH,
  FOLDER_PREVIEW_EASING,
} from './icon-grid/views/FolderVisuals'
import { DOCK_GAP, resolveDockDisplaySlots, resolveOuterItemIds } from './icon-grid/domain/dock'
import {
  buildPersistedItemCoordinates,
  canPlaceItemAtAnchorIndex,
  findBestResizeAnchorIndex,
  getFootprintIndices,
  getPageAnchorEntries,
  normalizeOuterSlots,
  resizeSlotPages,
} from './icon-grid/domain/topLevelLayout'
import { compactOuterSlotsWithinPages } from './icon-grid/scroll/scrollTopLevelLayout'
import {
  buildScrollGroupDragPreviewOrder,
  buildScrollGroupEntries,
  commitScrollFolderCreation,
  commitScrollGroupDragResult,
  commitScrollGroupItemOrder,
  createScrollGroup,
  deleteScrollGroup,
  moveScrollGroupItem,
  normalizeScrollGroups,
  placeItemsInScrollGroup,
  resolveScrollSidebarGhostSize,
} from './icon-grid/scroll/scrollGroupLayout'
import {
  applyMultiOuterDropFromSession,
  applyOuterDropFromSession,
} from './icon-grid/scroll/scrollDropPolicy'
import { DragOverlays } from './icon-grid/views/DragOverlays'
import { OuterGridView } from './icon-grid/views/OuterGridView'
import {
  ScrollableOuterGridView,
  type ScrollGridSection,
} from './icon-grid/views/ScrollableOuterGridView'
import { EdgeGlow } from './icon-grid/views/EdgeGlow'
import { FolderModalView } from './icon-grid/views/FolderModalView'
import { DockBar } from './icon-grid/views/DockBar'
import {
  getFolderChildSelectionsByIds,
  getFolderChildrenById,
  replaceFolderChildren,
} from './icon-grid/domain/folderPolicy'
import {
  resolveLayoutHydrationSource,
  shouldResetPersistedLayoutCache,
} from './icon-grid/domain/layoutHydrationPolicy'

interface IconGridProps {
  icons: DesktopIcon[]
  layoutResetToken: number
  sidebarCompact?: boolean
  onToggleSidebarCompact?: () => void
  addIconDisabled?: boolean
  onAddIcon?: (targetGroupId: string) => void
  importPlacementRequest?: {
    token: number
    iconKeys: string[]
    targetGroupId?: string
  } | null
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
const EVASION_COOLDOWN_MS = 120
const REORDER_ANIMATION_MS = 300
const FOLDER_SHARED_LAYOUT_WINDOW_MS = 320
const IMPORT_HIGHLIGHT_MS = 4200
const REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const readCurrentTranslate = (node: HTMLElement): { x: number; y: number } => {
  const transform = window.getComputedStyle(node).transform
  if (!transform || transform === 'none') return { x: 0, y: 0 }

  try {
    const matrix = new DOMMatrixReadOnly(transform)
    return {
      x: Number.isFinite(matrix.m41) ? matrix.m41 : 0,
      y: Number.isFinite(matrix.m42) ? matrix.m42 : 0,
    }
  } catch {
    return { x: 0, y: 0 }
  }
}
const fitCount = (container: number, item: number) => {
  if (item <= 0 || container <= item) return 1
  return Math.floor((container - item) / (item + GRID_GAP)) + 1
}
// 网格几何锁定标识：窗口模式 + 图标大小 + Dock 开关。
// 这三者不变时，列数/行数保持锁定，DPI/分辨率切换不会触发重排。
const buildGeometryKey = (windowMode: string, iconSize: string, dockEnabled: boolean) =>
  `${windowMode}:${iconSize}:${dockEnabled}`
const getFolderModalMaxAvailableWidth = () => {
  const maxWidth =
    typeof window === 'undefined'
      ? FOLDER_MODAL_MAX_WIDTH
      : Math.min(FOLDER_MODAL_MAX_WIDTH, window.innerWidth * 0.92)
  return Math.max(0, maxWidth - 40)
}
const getDefaultFolderColumnCount = (tileWidth: number) =>
  fitCount(getFolderModalMaxAvailableWidth(), tileWidth)

const EMPTY_SCROLL_RENDER_ORDER: Array<string | null> = []
const EMPTY_SCROLL_GRID_SECTIONS: ScrollGridSection[] = []

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

const filterItemsByIds = (items: GridItem[], ids: string[]): GridItem[] => {
  const idSet = new Set(ids)
  return items.filter(item => idSet.has(getId(item)))
}

const extractDraggedIconsFromSourceFolders = (
  base: GridItem[],
  draggingIds: string[]
): GridItem[] => {
  const selectedChildrenByFolderId = getFolderChildSelectionsByIds(base, draggingIds)
  if (selectedChildrenByFolderId.size === 0) return base

  let nextBase = base
  const extractedById = new Map<string, IconItem>()
  selectedChildrenByFolderId.forEach((children, folderId) => {
    children.forEach(child => {
      extractedById.set(child.key, child)
    })
    const draggedIdSet = new Set(children.map(child => child.key))
    const nextChildren = getFolderChildrenById(nextBase, folderId).filter(
      child => !draggedIdSet.has(child.key)
    )
    nextBase = replaceFolderChildren(nextBase, folderId, nextChildren, {
      collapseSingleChild: false,
    })
  })

  const existingIds = new Set(nextBase.map(getId))
  const extractedItems = Array.from(extractedById.values()).filter(
    child => !existingIds.has(child.key)
  )
  if (extractedItems.length === 0) {
    return nextBase
  }

  return [...nextBase, ...extractedItems]
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

const isSuspiciousSingleCellPageGeometry = ({
  columns,
  rows,
  pageSize,
}: {
  columns: number
  rows: number
  pageSize: number
}) => columns === 1 && rows === 1 && pageSize === 1

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
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const folderPanelRef = useRef<HTMLDivElement>(null)
  const folderGridContainerRef = useRef<HTMLDivElement>(null)
  const folderGridRef = useRef<HTMLDivElement>(null)
  const dockContainerRef = useRef<HTMLDivElement>(null)
  const dockGridRef = useRef<HTMLDivElement>(null)
  const scrollGridPageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollGridPendingFlipPositionsRef = useRef<Map<
    string,
    { left: number; top: number }
  > | null>(null)
  const externalScrollPreviewSnapshotRef = useRef<{
    groupId: string
    itemIds: string[]
    draggingIds: string[]
  } | null>(null)
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
  const persistedLayoutLoadedRef = useRef(false)
  const persistedLayoutLoadPromiseRef = useRef<Promise<PersistedLayout | null> | null>(null)
  const hydratedLayoutResetTokenRef = useRef(layoutResetToken)
  const persistedLayoutResetTokenRef = useRef<number | null>(null)
  const layoutWriteQueueRef = useRef<Promise<void>>(Promise.resolve())
  const appliedImportPlacementTokenRef = useRef<number | null>(null)
  const itemsRef = useRef<GridItem[]>([])
  const outerSlotsRef = useRef<Array<string | null>>([])
  const dockKeysRef = useRef<Array<string | null>>([])
  const scrollGroupsRef = useRef<ScrollGroupMeta[]>([])
  const dockEnabledRef = useRef(dockEnabled)
  const currentPageRef = useRef(0)
  const pageSizeRef = useRef(1)
  const layoutReadyRef = useRef(false)
  const previousSidebarCompactRef = useRef(sidebarCompact)
  const wheelDeltaRef = useRef(0)
  const wheelCooldownUntilRef = useRef(0)
  const folderSharedLayoutTimerRef = useRef<number | null>(null)
  const folderCloseRafRef = useRef<number | null>(null)

  const columnWidth = ICON_SIZE_CONFIG[iconSize].columnWidth
  const layoutRowHeight = getIconGridLayoutRowHeight(iconSize)
  const rowHeight = getIconGridRowHeight(iconSize)
  const geometryKey =
    launchpadGridViewMode === 'scroll'
      ? `${buildGeometryKey(windowMode, iconSize, dockEnabled)}:scroll`
      : buildGeometryKey(windowMode, iconSize, dockEnabled)

  const [columns, setColumns] = useState(1)
  const latestColumnsRef = useRef(columns)
  const [rows, setRows] = useState(1)
  // 水合完成后自增，强制几何测量回调重跑一次，从而应用持久化/锁定几何。
  const [layoutHydrationTick, setLayoutHydrationTick] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [scrollGroupCount, setScrollGroupCount] = useState(1)
  const [scrollGroups, setScrollGroups] = useState<ScrollGroupMeta[]>([])
  const [scrollSidebarDragActive, setScrollSidebarDragActive] = useState(false)
  const [scrollSidebarHoveredGroupId, setScrollSidebarHoveredGroupId] = useState<string | null>(
    null
  )
  const scrollSidebarDragActiveRef = useRef(false)
  const scrollSidebarHoveredGroupIdRef = useRef<string | null>(null)
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
    getDefaultFolderColumnCount(columnWidth)
  )

  useEffect(() => {
    if (launchpadGridViewMode !== 'scroll') return
    const persistedGroupCount = Math.max(1, scrollGroups.length)
    setScrollGroupCount(current =>
      current === persistedGroupCount ? current : persistedGroupCount
    )
  }, [launchpadGridViewMode, scrollGroups.length])

  dockEnabledRef.current = dockEnabled

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
    setFolderColumns(getDefaultFolderColumnCount(columnWidth))
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

  const closeFolderImmediately = () => {
    cancelPendingFolderClose()
    clearFolderSharedLayoutTimer()
    setActiveFolderSharedLayoutId(null)
    setOpenFolderId(null)
  }

  useEffect(() => {
    let cancelled = false

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
        persisted = {
          items: serializeItems(itemsRef.current),
          slots: outerSlotsRef.current,
          dockKeys: dockKeysRef.current,
          pageSize: prevPageSizeRef.current,
          columns: prevColumnsRef.current,
          coordinates: buildPersistedItemCoordinates(
            outerSlotsRef.current,
            itemsRef.current,
            prevPageSizeRef.current,
            prevColumnsRef.current
          ),
          geometryKey: persistedGeometryKeyRef.current ?? undefined,
          scrollGroups: scrollGroupsRef.current,
          scrollGroupItemsExplicit: true,
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
            persistedLayoutLoadPromiseRef.current = readLayout('scroll')
          }
          persistedLayoutRef.current = await persistedLayoutLoadPromiseRef.current
          persistedLayoutLoadedRef.current = true
        }
        if (cancelled) return
        persisted = persistedLayoutRef.current
      }

      const nextItems = hydrateItems(icons, persisted?.items ?? null)
      const nextItemIds = nextItems.map(getId)
      const nextDockKeys = dockEnabledRef.current
        ? hydrateDockKeys(nextItemIds, persisted?.dockKeys)
        : []

      let rawSlots = (persisted?.slots ?? []).map(key =>
        key ? key.replace(/^(desktop|customapp):/, '') : null
      )
      const hasDims =
        persisted?.pageSize && persisted?.columns && persisted.pageSize > 1 && persisted.columns > 1
      persistedDimsRef.current = hasDims
        ? { pageSize: persisted!.pageSize!, columns: persisted!.columns! }
        : null
      persistedCoordinatesRef.current = persisted?.coordinates
      persistedGeometryKeyRef.current = persisted?.geometryKey ?? null
      // 若持久化的几何标识与当前一致，且存有有效列数/行数，则直接锁定该几何，
      // 让测量回调不再用实测值覆盖它——这正是抵御 DPI/分辨率切换的关键。
      // 仅在从持久化水合时重建锁；内存水合（icons 刷新）保留会话内已建立的锁，
      // 避免把 DPI 漂移期的实测值重新锁入。
      if (hydrationSource !== 'memory') {
        if (
          launchpadGridViewMode !== 'scroll' &&
          hasDims &&
          persisted?.geometryKey &&
          persisted.geometryKey === geometryKey
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

      const nextOuterItemIds = resolveOuterItemIds(nextItemIds, nextDockKeys)
      const nextScrollGroups = normalizeScrollGroups({
        groups: persisted?.scrollGroups,
        outerItemIds: nextOuterItemIds,
        legacySlots: rawSlots,
        legacyPageSize: persisted?.pageSize ?? Math.max(1, rawSlots.length),
        hasExplicitItems: persisted?.scrollGroupItemsExplicit === true,
        defaultName: index => translate('网格 {index}', { index: index + 1 }),
      })
      itemsRef.current = nextItems
      outerSlotsRef.current = rawSlots
      dockKeysRef.current = nextDockKeys
      scrollGroupsRef.current = nextScrollGroups
      setItems(nextItems)
      setOuterSlots(rawSlots)
      setDockKeys(nextDockKeys)
      setScrollGroups(nextScrollGroups)
      setScrollGroupCount(Math.max(1, nextScrollGroups.length))
      hydratedRef.current = true
      hydratedLayoutResetTokenRef.current = layoutResetToken
      // 强制几何测量回调重跑，使锁定几何（若有）在本次水合后立即生效。
      setLayoutHydrationTick(tick => tick + 1)
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [icons, layoutResetToken])

  useEffect(() => {
    return () => {
      clearImportHighlightTimer()
    }
  }, [])

  useEffect(() => {
    itemsRef.current = items
    outerSlotsRef.current = outerSlots
    dockKeysRef.current = dockKeys
    scrollGroupsRef.current = scrollGroups
    if (!hydratedRef.current || !layoutBaselineRef.current) return

    const nextItems = items
    const nextSlots = outerSlots
    const nextDockKeys = dockKeys
    const nextPageSize = prevPageSizeRef.current
    const nextColumns = prevColumnsRef.current
    if (nextPageSize === 1 && nextColumns === 1) {
      return
    }
    const nextGeometryKey =
      launchpadGridViewMode === 'scroll'
        ? geometryKey
        : (lockedGeometryRef.current?.key ?? geometryKey)
    layoutWriteQueueRef.current = layoutWriteQueueRef.current
      .then(() =>
        writeLayout(
          nextItems,
          nextSlots,
          nextDockKeys,
          nextPageSize,
          nextColumns,
          nextGeometryKey,
          scrollGroups,
          'scroll'
        )
      )
      .catch(e => {
        console.error('Failed to persist launchpad layout:', e)
      })
  }, [dockKeys, geometryKey, items, launchpadGridViewMode, outerSlots, scrollGroups])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    if (!openFolderId) return
    const exists = items.some(item => item.kind === 'folder' && item.id === openFolderId)
    if (!exists) {
      cancelPendingFolderClose()
      clearFolderSharedLayoutTimer()
      setActiveFolderSharedLayoutId(null)
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
  const activeDockKeys = dockEnabled ? dockKeys : []
  const outerItemIds = useMemo(
    () => resolveOuterItemIds(itemIds, activeDockKeys),
    [activeDockKeys, itemIds]
  )

  useEffect(() => {
    if (!hydratedRef.current || scrollGroupsRef.current.length === 0) return
    const preferredGroupId = scrollGroupsRef.current[currentPageRef.current]?.id ?? null
    const nextGroups = normalizeScrollGroups({
      groups: scrollGroupsRef.current,
      outerItemIds,
      hasExplicitItems: true,
      defaultName: index => translate('网格 {index}', { index: index + 1 }),
      preferredGroupId,
    })
    if (JSON.stringify(nextGroups) === JSON.stringify(scrollGroupsRef.current)) return
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
  }, [outerItemIds])
  const pageSize = Math.max(1, columns * rows)
  const prevDockEnabledRef = useRef(dockEnabled)
  const prevPageSizeRef = useRef(pageSize)
  const prevColumnsRef = useRef(columns)

  const captureScrollGridItemPositions = useCallback(() => {
    if (launchpadGridViewMode !== 'scroll') return
    const positions = new Map<string, { left: number; top: number }>()
    tileRefs.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect()
      positions.set(id, { left: rect.left, top: rect.top })
    })
    scrollGridPendingFlipPositionsRef.current = positions
  }, [launchpadGridViewMode])

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
        dockEnabledRef.current ? dockKeysRef.current : []
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
    [captureScrollGridItemPositions, launchpadGridViewMode]
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
      // The item and scroll-group writes are batched in the same drop callback. Capture the
      // still-rendered layout now so the surviving icons use the same FLIP path as drag evasion.
      // Folder creation replaces the target item with a new React key, so bridge the target's
      // old position to the new folder id. Without this alias, FLIP has no starting rect for the
      // folder and it snaps into the source icon's newly-vacated slot while the other items move.
      captureScrollGridItemPositions()
      const targetPosition = scrollGridPendingFlipPositionsRef.current?.get(targetId)
      if (targetPosition) {
        scrollGridPendingFlipPositionsRef.current?.set(createdFolderId, targetPosition)
      }
      scrollGroupsRef.current = nextGroups
      setScrollGroups(nextGroups)
    },
    [captureScrollGridItemPositions, launchpadGridViewMode]
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
    openFolderId,
    setOpenFolderId,
  })
  const retargetOuterDragToScrollGroupRef = useRef(retargetOuterDragToScrollGroup)
  const syncOuterDragPreviewRef = useRef(syncOuterDragPreview)
  useLayoutEffect(() => {
    retargetOuterDragToScrollGroupRef.current = retargetOuterDragToScrollGroup
    syncOuterDragPreviewRef.current = syncOuterDragPreview
  }, [retargetOuterDragToScrollGroup, syncOuterDragPreview])
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
    if (!openFolderId) return
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
      closeFolderWithAnimation()
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
    let sidebarTransitionTimer = 0
    let sidebarTransitioning =
      launchpadGridViewMode === 'scroll' &&
      previousSidebarCompactRef.current !== sidebarCompact &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    previousSidebarCompactRef.current = sidebarCompact
    const recalc = () => {
      let width = el.clientWidth
      let height = el.clientHeight
      if (launchpadGridViewMode === 'scroll') {
        const style = window.getComputedStyle(el)
        const horizontalPadding =
          Number.parseFloat(style.paddingLeft || '0') + Number.parseFloat(style.paddingRight || '0')
        const verticalPadding =
          Number.parseFloat(style.paddingTop || '0') + Number.parseFloat(style.paddingBottom || '0')
        width = Math.max(0, width - horizontalPadding)
        height = Math.max(0, height - verticalPadding)
      }
      const tileWidth = columnWidth
      const tileHeight = rowHeight
      const hasWideItems = itemsRef.current.some(item => getGridItemSpan(item).cols > 1)
      const hasTallItems = itemsRef.current.some(item => getGridItemSpan(item).rows > 1)
      const minRows = hasTallItems ? 2 : 1
      const baseRows = Math.max(minRows, fitCount(height, layoutRowHeight))
      const nextRowGridHeight = (baseRows + 1) * tileHeight + baseRows * GRID_GAP
      const nextColumns = Math.max(hasWideItems ? 2 : 1, fitCount(width, tileWidth))
      const viewportRows = !dockEnabled && nextRowGridHeight <= height ? baseRows + 1 : baseRows
      const outerItemIdsForLayout = resolveOuterItemIds(
        itemsRef.current.map(getId),
        dockEnabledRef.current ? dockKeysRef.current : []
      )
      const layoutItemById = new Map(itemsRef.current.map(item => [getId(item), item]))
      const requiredCellCount = outerItemIdsForLayout.reduce((total, id) => {
        const item = layoutItemById.get(id)
        if (!item) return total
        const span = getGridItemSpan(item)
        return total + span.cols * span.rows
      }, 0)
      const requiredRowsForAnyGroup = Math.ceil(Math.max(1, requiredCellCount) / nextColumns)
      const resolvedRows =
        launchpadGridViewMode === 'scroll'
          ? Math.max(viewportRows, requiredRowsForAnyGroup)
          : viewportRows
      const nextPageSize = Math.max(1, nextColumns * resolvedRows)

      const locked = lockedGeometryRef.current
      const isLockedForCurrentGeometry = locked !== null && locked.key === geometryKey

      let finalColumns: number
      let finalRows: number
      if (launchpadGridViewMode === 'scroll') {
        finalColumns = nextColumns
        finalRows = resolvedRows
        lockedGeometryRef.current = null
      } else if (isLockedForCurrentGeometry) {
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

      if (
        launchpadGridViewMode === 'scroll' &&
        layoutReadyRef.current &&
        finalColumns !== latestColumnsRef.current
      ) {
        captureScrollGridItemPositions()
      }
      latestColumnsRef.current = finalColumns
      setItemWidth(tileWidth)
      setItemHeight(tileHeight)
      setColumns(finalColumns)
      setRows(finalRows)
      layoutReadyRef.current = true
    }
    const schedule = () => {
      if (sidebarTransitioning) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(recalc)
    }

    if (sidebarTransitioning) {
      sidebarTransitionTimer = window.setTimeout(
        () => {
          sidebarTransitioning = false
          schedule()
        },
        sidebarCompact ? 180 : 220
      )
    } else {
      schedule()
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    if (gridRef.current) observer.observe(gridRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(sidebarTransitionTimer)
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
    launchpadGridViewMode,
    layoutHydrationTick,
    sidebarCompact,
    scrollGroupCount,
    captureScrollGridItemPositions,
  ])

  useLayoutEffect(() => {
    latestColumnsRef.current = columns
  }, [columns])

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
      setFolderColumns(getDefaultFolderColumnCount(tileWidth))
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
    scrollGridPageRefs.current.clear()
  }, [launchpadGridViewMode, pageSize, scrollGroupCount])

  useEffect(() => {
    if (!hydratedRef.current || !layoutReadyRef.current) return
    const outerItems = filterItemsByIds(itemsRef.current, outerItemIds)
    const layoutMetrics = getLayoutNormalizationMetrics(outerItems, Math.max(1, columns), pageSize)
    const previousPageSize = prevPageSizeRef.current
    const previousColumns = prevColumnsRef.current
    const currentCoordinates = buildPersistedItemCoordinates(
      outerSlotsRef.current,
      outerItems,
      previousPageSize,
      previousColumns
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
        previousPageSize,
        layoutMetrics.pageSize,
        previousColumns,
        layoutMetrics.columns,
        currentCoordinates
      )
    }
    const compacted =
      launchpadGridViewMode === 'scroll'
        ? compactOuterSlotsWithinPages(
            result,
            outerItems,
            layoutMetrics.pageSize,
            layoutMetrics.columns,
            scrollGroupCount
          )
        : compactEmptyPages(result, layoutMetrics.pageSize)

    if (areSlotsEqual(compacted, outerSlotsRef.current)) return
    outerSlotsRef.current = compacted
    setOuterSlots(compacted)
  }, [columns, dockEnabled, launchpadGridViewMode, outerItemIds, pageSize, scrollGroupCount])

  useEffect(() => {
    if (!hydratedRef.current || !layoutReadyRef.current) return
    const outerItems = filterItemsByIds(itemsRef.current, outerItemIds)
    const layoutMetrics = getLayoutNormalizationMetrics(outerItems, Math.max(1, columns), pageSize)
    prevDockEnabledRef.current = dockEnabled
    // These refs intentionally store the previous normalized metrics for the next layout pass.
    // eslint-disable-next-line react-hooks/immutability
    prevPageSizeRef.current = layoutMetrics.pageSize
    // eslint-disable-next-line react-hooks/immutability
    prevColumnsRef.current = layoutMetrics.columns
  }, [columns, dockEnabled, outerItemIds, pageSize])

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
    if (launchpadGridViewMode === 'scroll') {
      const requestedGroupExists = request.targetGroupId
        ? scrollGroupsRef.current.some(group => group.id === request.targetGroupId)
        : false
      const preferredGroupId = requestedGroupExists
        ? request.targetGroupId
        : (scrollGroupsRef.current[currentPageRef.current]?.id ?? null)
      const normalizedGroups = normalizeScrollGroups({
        groups: scrollGroupsRef.current,
        outerItemIds,
        hasExplicitItems: true,
        defaultName: index => translate('网格 {index}', { index: index + 1 }),
        preferredGroupId,
      })
      const nextGroups = placeItemsInScrollGroup(normalizedGroups, preferredGroupId, importedIds)
      scrollGroupsRef.current = nextGroups
      setScrollGroups(nextGroups)
      appliedImportPlacementTokenRef.current = request.token
      setImportHighlightIds(importedIds)
      clearImportHighlightTimer()
      importHighlightTimerRef.current = window.setTimeout(() => {
        setImportHighlightIds(current => current.filter(id => !importedIdSet.has(id)))
        importHighlightTimerRef.current = null
      }, IMPORT_HIGHLIGHT_MS)
      return
    }

    const safeColumns = Math.max(1, prevColumnsRef.current || columns)
    const safePageSize = Math.max(1, prevPageSizeRef.current || pageSize)
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
  }, [columns, importPlacementRequest, launchpadGridViewMode, outerItemIds, pageSize])

  const outerRenderCount = Math.max(pageSize, renderOrder.length)
  const layoutPageCount =
    launchpadGridViewMode === 'scroll'
      ? getOccupiedPageCountForSlots(renderOrder, pageSize)
      : Math.max(1, Math.ceil(outerRenderCount / pageSize))
  const pageCount =
    launchpadGridViewMode === 'scroll' ? Math.max(1, scrollGroupCount) : layoutPageCount
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

    const baseOuterSlots =
      prevPageSizeRef.current === safePS && prevColumnsRef.current === safeCols
        ? [...outerSlotsRef.current]
        : resizeSlotPages(
            outerSlotsRef.current,
            prevOuterItems,
            prevPageSizeRef.current,
            safePS,
            prevColumnsRef.current,
            safeCols,
            buildPersistedItemCoordinates(
              outerSlotsRef.current,
              prevOuterItems,
              prevPageSizeRef.current,
              prevColumnsRef.current
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

  const outerViewItems = useMemo(() => Array.from(outerViewItemById.values()), [outerViewItemById])
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

    // WeTab keeps the destination group untouched while the pointer is still over the
    // sidebar. The dragged item only enters the visible layout after returning to the grid.
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
      const entries =
        index === currentPage ? buildScrollGroupEntries(itemIds, outerViewItemById, columns) : []
      return {
        index,
        groupId: group.id,
        itemCount: group.itemIds.length,
        entries,
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
    if (launchpadGridViewMode === 'scroll') {
      prevPageRef.current = currentPage
      prevPageEntriesRef.current = currentPageEntries
      return
    }
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

      const currentTranslate = readCurrentTranslate(node)
      const startX = deltaX + currentTranslate.x
      const startY = deltaY + currentTranslate.y
      node.style.transition = 'none'
      node.style.willChange = 'transform'
      node.style.transform = `translate3d(${startX}px, ${startY}px, 0px)`
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
  }, [pageItems, currentPage, columns, itemWidth, itemHeight, launchpadGridViewMode])

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
      clearFolderSharedLayoutTimer()
      cancelPendingFolderClose()
      clearEdgeSwitchTimer()
    }
  }, [])

  const gridWidth = columns * itemWidth + Math.max(0, columns - 1) * GRID_GAP
  const gridHeight = rows * itemHeight + Math.max(0, rows - 1) * GRID_GAP
  const ghostItem = dragState ? dragState.draggingItem : null
  const pagedActiveHiddenDragIds = useMemo(() => {
    if (!dragState) {
      return []
    }
    const outerItemIdSet = new Set(outerItemIds)
    return dragState.draggingIds.filter(id => outerItemIdSet.has(id))
  }, [dragState, outerItemIds])
  const scrollActiveHiddenDragIds = useMemo(() => {
    if (!dragState) {
      return []
    }
    // A folder child is added to the scroll preview before it exists in the committed outer
    // layout. Hide that keyed placeholder from its first outer frame so only the drag overlay
    // is visible while the placeholder participates in FLIP reordering.
    if (dragState.context === 'outer') {
      return dragState.draggingIds
    }
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
  const handleScrollGridActivePageChange = (page: number) => {
    const nextPage = clampNumber(page, 0, pageCount - 1)
    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
  }

  useEffect(() => {
    const publishSidebarFeedback = (active: boolean, groupId: string | null) => {
      const wasActive = scrollSidebarDragActiveRef.current
      if (scrollSidebarDragActiveRef.current !== active) {
        scrollSidebarDragActiveRef.current = active
        setScrollSidebarDragActive(active)
      }
      if (scrollSidebarHoveredGroupIdRef.current !== groupId) {
        scrollSidebarHoveredGroupIdRef.current = groupId
        setScrollSidebarHoveredGroupId(groupId)
      }
      if (wasActive && !active) {
        // The pointer can stop immediately after crossing back into the grid. Force one
        // collision pass so the destination does not remain as a trailing empty slot.
        syncOuterDragPreviewRef.current()
      }
    }

    if (launchpadGridViewMode !== 'scroll' || dragState?.context !== 'outer') {
      publishSidebarFeedback(false, null)
      return
    }

    let frame = 0
    const detectSidebarTarget = () => {
      const pointer = dragPointerRef.current
      const target = pointer
        ? (document.elementFromPoint(pointer.pointerX, pointer.pointerY) as HTMLElement | null)
        : null
      const sidebar = target?.closest<HTMLElement>('[data-scroll-group-sidebar]') ?? null
      const groupTarget = sidebar
        ? (target?.closest<HTMLElement>('[data-scroll-group-id]') ?? null)
        : null
      const groupId = groupTarget?.dataset.scrollGroupId ?? null

      publishSidebarFeedback(Boolean(sidebar), groupId)

      if (groupId && groupId !== scrollGroupsRef.current[currentPageRef.current]?.id) {
        const targetPage = scrollGroupsRef.current.findIndex(group => group.id === groupId)
        const targetGroup = scrollGroupsRef.current[targetPage]
        if (targetPage >= 0 && targetGroup) {
          // A rendered snapshot from the source group must never win a same-frame pointer-up.
          externalScrollPreviewSnapshotRef.current = null
          // Collision and folder intent must immediately use the destination group's ids.
          // Keeping the source scrollGroupOrder here creates the trailing hole deadlock.
          retargetOuterDragToScrollGroupRef.current(targetGroup.itemIds)
          currentPageRef.current = targetPage
          setCurrentPage(targetPage)
          containerRef.current?.scrollTo({ top: 0, behavior: 'auto' })
        }
      }

      frame = window.requestAnimationFrame(detectSidebarTarget)
    }

    detectSidebarTarget()
    return () => window.cancelAnimationFrame(frame)
  }, [dragPointerRef, dragState?.context, dragState?.dragStartedAt, launchpadGridViewMode])

  const handleAddScrollGroup = (meta: Pick<ScrollGroupMeta, 'name' | 'icon'>) => {
    const group = createScrollGroup(meta.name, meta.icon, scrollGroupsRef.current)
    const nextGroups = [...scrollGroupsRef.current, group]
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
    setScrollGroupCount(nextGroups.length)
    const nextPage = nextGroups.length - 1
    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
  }

  const handleEditScrollGroup = (page: number, meta: Pick<ScrollGroupMeta, 'name' | 'icon'>) => {
    const targetPage = clampNumber(page, 0, scrollGroupsRef.current.length - 1)
    const nextGroups = scrollGroupsRef.current.map((group, index) =>
      index === targetPage ? { ...group, ...meta } : group
    )
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
  }

  const handleReorderScrollGroup = (sourcePage: number, targetPage: number) => {
    const effectiveCount = Math.max(1, scrollGroupsRef.current.length)
    const safeSourcePage = clampNumber(sourcePage, 0, effectiveCount - 1)
    const safeTargetPage = clampNumber(targetPage, 0, effectiveCount - 1)
    if (safeSourcePage === safeTargetPage) return

    const nextGroups = [...scrollGroupsRef.current]
    const activeGroupId = nextGroups[currentPageRef.current]?.id
    const [movedGroup] = nextGroups.splice(safeSourcePage, 1)
    nextGroups.splice(safeTargetPage, 0, movedGroup)
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
    const nextPage = Math.max(
      0,
      nextGroups.findIndex(group => group.id === activeGroupId)
    )
    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
  }

  const handleDeleteScrollGroup = (page: number) => {
    const targetPage = clampNumber(page, 0, scrollGroupsRef.current.length - 1)
    const targetId = scrollGroupsRef.current[targetPage]?.id
    if (!targetId) return
    const nextGroups = deleteScrollGroup(scrollGroupsRef.current, targetId)
    if (nextGroups === scrollGroupsRef.current) return
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
    setScrollGroupCount(nextGroups.length)
    const nextPage = clampNumber(
      currentPageRef.current >= targetPage ? targetPage - 1 : currentPageRef.current,
      0,
      nextGroups.length - 1
    )
    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
  }

  const handleCommitScrollGroupItemOrder = (groupId: string, itemIds: string[]) => {
    const nextGroups = commitScrollGroupItemOrder(scrollGroupsRef.current, groupId, itemIds)
    if (nextGroups === scrollGroupsRef.current) return
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
  }

  const handleMoveScrollGroupItem = (itemId: string, targetGroupId: string) => {
    const nextGroups = moveScrollGroupItem(scrollGroupsRef.current, itemId, targetGroupId)
    if (nextGroups === scrollGroupsRef.current) return
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
  }

  const handleMoveScrollGroupItemToDock = (itemId: string, targetIndex: number) => {
    const nextGroups = scrollGroupsRef.current.map(group => ({
      ...group,
      itemIds: group.itemIds.filter(id => id !== itemId),
    }))
    const compactDock = dockKeysRef.current.filter(
      (id): id is string => typeof id === 'string' && id !== itemId
    )
    compactDock.splice(clampNumber(targetIndex, 0, compactDock.length), 0, itemId)
    scrollGroupsRef.current = nextGroups
    dockKeysRef.current = compactDock
    setScrollGroups(nextGroups)
    setDockKeys(compactDock)
  }

  const handleMergeScrollGroupItems = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const source = itemsRef.current.find(item => getId(item) === sourceId)
    const target = itemsRef.current.find(item => getId(item) === targetId)
    if (!source || source.kind !== 'icon' || !target) return

    let replacement: FolderItem
    if (target.kind === 'folder') {
      if (target.children.some(child => child.key === source.key)) return
      replacement = { ...target, children: [...target.children, source] }
    } else {
      replacement = {
        kind: 'folder',
        id: makeFolderId(),
        name: translate('New Folder'),
        size: '1x1',
        children: [target, source],
      }
    }
    const replacementId = getId(replacement)
    const nextItems = itemsRef.current.flatMap(item => {
      const id = getId(item)
      if (id === sourceId) return []
      if (id === targetId) return [replacement]
      return [item]
    })
    const nextGroups = scrollGroupsRef.current.map(group => ({
      ...group,
      itemIds: group.itemIds
        .filter(id => id !== sourceId)
        .map(id => (id === targetId ? replacementId : id)),
    }))
    itemsRef.current = nextItems
    scrollGroupsRef.current = nextGroups
    setItems(nextItems)
    setScrollGroups(nextGroups)
  }

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
            openFolderId={openFolderId}
            activeFolderSharedLayoutId={activeFolderSharedLayoutId}
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
                openFolderId={openFolderId}
                activeFolderSharedLayoutId={activeFolderSharedLayoutId}
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
            openFolderId={openFolderId}
            activeFolderSharedLayoutId={activeFolderSharedLayoutId}
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
          activeFolderSharedLayoutId={activeFolderSharedLayoutId}
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
