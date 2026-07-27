import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import type { DesktopIcon } from '../../../types'
import { translate } from '../../../lib/i18n'
import type { GridItem, PersistedLayout, ScrollGroupMeta } from '../model'
import { getGridItemSpan, getId } from '../model'
import { compactEmptyPages, areSlotsEqual } from '../domain/slots'
import { clampNumber } from '../domain/geometry'
import { resolveOuterItemIds } from '../domain/dock'
import {
  buildPersistedItemCoordinates,
  canPlaceItemAtAnchorIndex,
  getFootprintIndices,
  normalizeOuterSlots,
  resizeSlotPages,
} from '../domain/topLevelLayout'
import {
  getLayoutNormalizationMetrics,
  isSuspiciousSingleCellPageGeometry,
  fitGridItemCount,
} from '../domain/gridGeometry'
import { filterItemsByIds } from '../domain/gridItems'
import {
  resolveLayoutHydrationSource,
  shouldResetPersistedLayoutCache,
} from '../domain/layoutHydrationPolicy'
import {
  hydrateDockKeys,
  hydrateItems,
  readLayout,
  serializeItems,
  writeLayout,
} from '../services/layoutStore'
import { createLayoutDimensionsTracker } from '../state/layoutDimensionsTracker'
import { compactOuterSlotsWithinPages } from './scrollTopLevelLayout'
import { normalizeScrollGroups, placeItemsInScrollGroup } from './scrollGroupLayout'
import { GRID_GAP, IMPORT_HIGHLIGHT_MS } from '../constants'

export interface ScrollImportPlacementRequest {
  token: number
  iconKeys: string[]
  targetGroupId?: string
}

interface UseScrollableIconGridLayoutParams {
  icons: DesktopIcon[]
  layoutResetToken: number
  importPlacementRequest?: ScrollImportPlacementRequest | null
  dockEnabled: boolean
  launchpadGridViewMode: 'paged' | 'scroll'
  geometryKey: string
  columnWidth: number
  rowHeight: number
  layoutRowHeight: number
  sidebarCompact: boolean
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
}

export function useScrollableIconGridLayout({
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
}: UseScrollableIconGridLayoutParams) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollGridPendingFlipPositionsRef = useRef<Map<
    string,
    { left: number; top: number }
  > | null>(null)
  const importHighlightTimerRef = useRef<number | null>(null)
  const hydratedRef = useRef(false)
  const layoutBaselineRef = useRef(false)
  const persistedDimsRef = useRef<{ pageSize: number; columns: number } | null>(null)
  const persistedCoordinatesRef = useRef<PersistedLayout['coordinates']>(undefined)
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
  const currentPageRef = useRef(0)
  const pageSizeRef = useRef(1)
  const layoutReadyRef = useRef(false)
  const previousSidebarCompactRef = useRef(sidebarCompact)
  const latestColumnsRef = useRef(1)

  const [columns, setColumns] = useState(1)
  const [rows, setRows] = useState(1)
  const [layoutHydrationTick, setLayoutHydrationTick] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [scrollGroups, setScrollGroups] = useState<ScrollGroupMeta[]>([])
  const [itemWidth, setItemWidth] = useState(columnWidth)
  const [itemHeight, setItemHeight] = useState(rowHeight)
  const [items, setItems] = useState<GridItem[]>([])
  const [importHighlightIds, setImportHighlightIds] = useState<string[]>([])
  const [outerSlots, setOuterSlots] = useState<Array<string | null>>([])
  const [dockKeys, setDockKeys] = useState<Array<string | null>>([])
  const [layoutDimensionsTracker] = useState(() =>
    createLayoutDimensionsTracker({ pageSize: Math.max(1, columns * rows), columns })
  )
  const readLayoutHydrationEnvironment = useEffectEvent(() => ({
    dockEnabled,
    geometryKey,
    launchpadGridViewMode,
  }))
  const itemIds = useMemo(() => items.map(getId), [items])
  const itemLayoutSignature = useMemo(
    () =>
      items.map(item => (item.kind === 'folder' ? `${item.id}:${item.size}` : item.key)).join('|'),
    [items]
  )
  const activeDockKeys = useMemo(() => (dockEnabled ? dockKeys : []), [dockEnabled, dockKeys])
  const outerItemIds = useMemo(
    () => resolveOuterItemIds(itemIds, activeDockKeys),
    [activeDockKeys, itemIds]
  )
  const pageSize = Math.max(1, columns * rows)
  const scrollGroupCount = Math.max(1, scrollGroups.length)

  const clearImportHighlightTimer = () => {
    if (importHighlightTimerRef.current === null) return
    window.clearTimeout(importHighlightTimerRef.current)
    importHighlightTimerRef.current = null
  }
  const captureScrollGridItemPositions = useCallback(() => {
    if (launchpadGridViewMode !== 'scroll') return
    const positions = new Map<string, { left: number; top: number }>()
    tileRefs.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect()
      positions.set(id, { left: rect.left, top: rect.top })
    })
    scrollGridPendingFlipPositionsRef.current = positions
  }, [launchpadGridViewMode, tileRefs])

  useEffect(() => {
    let cancelled = false
    const hydrationEnvironment = readLayoutHydrationEnvironment()

    const hydrate = async () => {
      if (!hydratedRef.current && icons.length === 0) return
      let persisted: PersistedLayout | null = null
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
          persistedLayoutLoadPromiseRef.current ??= readLayout('scroll')
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
      const hasDims = Boolean(
        persisted?.pageSize && persisted?.columns && persisted.pageSize > 1 && persisted.columns > 1
      )
      persistedDimsRef.current = hasDims
        ? { pageSize: persisted!.pageSize!, columns: persisted!.columns! }
        : null
      persistedCoordinatesRef.current = persisted?.coordinates
      persistedGeometryKeyRef.current = persisted?.geometryKey ?? null
      if (hydrationSource !== 'memory') {
        if (
          hydrationEnvironment.launchpadGridViewMode !== 'scroll' &&
          hasDims &&
          persisted?.geometryKey === hydrationEnvironment.geometryKey
        ) {
          const lockedColumns = persisted.columns!
          lockedGeometryRef.current = {
            key: persisted.geometryKey,
            columns: lockedColumns,
            rows: Math.max(1, Math.round(persisted.pageSize! / lockedColumns)),
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
      hydratedRef.current = true
      hydratedLayoutResetTokenRef.current = layoutResetToken
      setLayoutHydrationTick(tick => tick + 1)
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [icons, layoutDimensionsTracker, layoutResetToken])

  useEffect(() => () => clearImportHighlightTimer(), [])

  useEffect(() => {
    itemsRef.current = items
    outerSlotsRef.current = outerSlots
    dockKeysRef.current = dockKeys
    scrollGroupsRef.current = scrollGroups
    if (!hydratedRef.current || !layoutBaselineRef.current) return
    const layoutDimensions = layoutDimensionsTracker.read()
    if (layoutDimensions.pageSize === 1 && layoutDimensions.columns === 1) return
    const nextGeometryKey =
      launchpadGridViewMode === 'scroll'
        ? geometryKey
        : (lockedGeometryRef.current?.key ?? geometryKey)
    layoutWriteQueueRef.current = layoutWriteQueueRef.current
      .then(() =>
        writeLayout(
          items,
          outerSlots,
          dockKeys,
          layoutDimensions.pageSize,
          layoutDimensions.columns,
          nextGeometryKey,
          scrollGroups,
          'scroll'
        )
      )
      .catch(error => console.error('Failed to persist launchpad layout:', error))
  }, [
    dockKeys,
    geometryKey,
    items,
    launchpadGridViewMode,
    layoutDimensionsTracker,
    outerSlots,
    scrollGroups,
  ])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

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

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    let animationFrame = 0
    let sidebarTransitionTimer = 0
    let sidebarTransitioning =
      launchpadGridViewMode === 'scroll' &&
      previousSidebarCompactRef.current !== sidebarCompact &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    previousSidebarCompactRef.current = sidebarCompact

    const recalculate = () => {
      let width = element.clientWidth
      let height = element.clientHeight
      if (launchpadGridViewMode === 'scroll') {
        const style = window.getComputedStyle(element)
        width = Math.max(
          0,
          width -
            Number.parseFloat(style.paddingLeft || '0') -
            Number.parseFloat(style.paddingRight || '0')
        )
        height = Math.max(
          0,
          height -
            Number.parseFloat(style.paddingTop || '0') -
            Number.parseFloat(style.paddingBottom || '0')
        )
      }
      const hasWideItems = itemsRef.current.some(item => getGridItemSpan(item).cols > 1)
      const hasTallItems = itemsRef.current.some(item => getGridItemSpan(item).rows > 1)
      const baseRows = Math.max(hasTallItems ? 2 : 1, fitGridItemCount(height, layoutRowHeight))
      const nextRowGridHeight = (baseRows + 1) * rowHeight + baseRows * GRID_GAP
      const nextColumns = Math.max(hasWideItems ? 2 : 1, fitGridItemCount(width, columnWidth))
      const viewportRows = !dockEnabled && nextRowGridHeight <= height ? baseRows + 1 : baseRows
      const outerItemIdsForLayout = resolveOuterItemIds(
        itemsRef.current.map(getId),
        dockEnabled ? dockKeysRef.current : []
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
      const isLocked = locked !== null && locked.key === geometryKey
      let finalColumns = nextColumns
      let finalRows = resolvedRows

      if (launchpadGridViewMode === 'scroll') {
        lockedGeometryRef.current = null
      } else if (isLocked) {
        finalColumns = locked.columns
        finalRows = locked.rows
      } else {
        if (
          isSuspiciousSingleCellPageGeometry({
            columns: nextColumns,
            rows: resolvedRows,
            pageSize: nextPageSize,
          })
        ) {
          return
        }
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
      setItemWidth(columnWidth)
      setItemHeight(rowHeight)
      setColumns(finalColumns)
      setRows(finalRows)
      layoutReadyRef.current = true
    }
    const schedule = () => {
      if (sidebarTransitioning) return
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(recalculate)
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
    observer.observe(element)
    if (gridRef.current) observer.observe(gridRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(animationFrame)
      window.clearTimeout(sidebarTransitionTimer)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [
    captureScrollGridItemPositions,
    columnWidth,
    dockEnabled,
    geometryKey,
    itemLayoutSignature,
    launchpadGridViewMode,
    layoutHydrationTick,
    layoutRowHeight,
    rowHeight,
    scrollGroupCount,
    sidebarCompact,
  ])

  useEffect(() => {
    latestColumnsRef.current = columns
  }, [columns])

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
    const normalized = !layoutBaselineRef.current
      ? persistedDimsRef.current
        ? resizeSlotPages(
            outerSlotsRef.current,
            outerItems,
            persistedDimsRef.current.pageSize,
            layoutMetrics.pageSize,
            persistedDimsRef.current.columns,
            layoutMetrics.columns,
            persistedCoordinatesRef.current ?? null
          )
        : normalizeOuterSlots(
            outerSlotsRef.current,
            outerItems,
            layoutMetrics.pageSize,
            layoutMetrics.columns
          )
      : resizeSlotPages(
          outerSlotsRef.current,
          outerItems,
          previousDimensions.pageSize,
          layoutMetrics.pageSize,
          previousDimensions.columns,
          layoutMetrics.columns,
          currentCoordinates
        )
    layoutBaselineRef.current = true
    const compacted =
      launchpadGridViewMode === 'scroll'
        ? compactOuterSlotsWithinPages(
            normalized,
            outerItems,
            layoutMetrics.pageSize,
            layoutMetrics.columns,
            scrollGroupCount
          )
        : compactEmptyPages(normalized, layoutMetrics.pageSize)
    if (areSlotsEqual(compacted, outerSlotsRef.current)) return
    outerSlotsRef.current = compacted
    setOuterSlots(compacted)
  }, [
    columns,
    dockEnabled,
    launchpadGridViewMode,
    layoutDimensionsTracker,
    outerItemIds,
    pageSize,
    scrollGroupCount,
  ])

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
    const remainder = outerSlotsRef.current.length % safePageSize
    const padded =
      remainder > 0
        ? [
            ...outerSlotsRef.current,
            ...Array.from({ length: safePageSize - remainder }, () => null),
          ]
        : [...outerSlotsRef.current]
    const newPage: Array<string | null> = Array.from({ length: safePageSize }, () => null)
    const itemById = new Map(itemsRef.current.map(item => [getId(item), item]))
    let nextSlot = 0
    for (const id of dockItemIds) {
      const item = itemById.get(id)
      if (!item) continue
      const span = getGridItemSpan(item)
      for (let index = nextSlot; index < safePageSize; index += 1) {
        const indices = getFootprintIndices(index, span, safeColumns, safePageSize)
        if (!indices || !indices.every(footprintIndex => !newPage[footprintIndex])) continue
        newPage[index] = id
        nextSlot = index + 1
        break
      }
    }
    const nextOuterSlots = compactEmptyPages([...padded, ...newPage], safePageSize)
    outerSlotsRef.current = nextOuterSlots
    dockKeysRef.current = []
    setOuterSlots(nextOuterSlots)
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

    const layoutDimensions = layoutDimensionsTracker.read()
    const safeColumns = Math.max(1, layoutDimensions.columns || columns)
    const safePageSize = Math.max(1, layoutDimensions.pageSize || pageSize)
    const activePage = clampNumber(currentPageRef.current, 0, Number.MAX_SAFE_INTEGER)
    const currentPageStart = activePage * safePageSize
    const currentPageEnd = currentPageStart + safePageSize
    let workingSlots = outerSlotsRef.current.map(slot =>
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
      if (placed || span.cols > 1 || span.rows > 1) continue
      while (tailFillIndex >= currentPageStart) {
        const occupant = workingSlots[tailFillIndex]
        if (typeof occupant === 'string' && importedIdSet.has(occupant)) {
          tailFillIndex -= 1
          continue
        }
        if (typeof occupant === 'string') displacedIdSet.add(occupant)
        preferredAnchorById.set(id, tailFillIndex)
        workingSlots[tailFillIndex] = id
        tailFillIndex -= 1
        break
      }
    }
    const fallbackOriginAnchorById = new Map<string, number>()
    displacedIdSet.forEach(id => fallbackOriginAnchorById.set(id, currentPageEnd))
    if (displacedIdSet.size > 0) {
      let nextPageVacant = 0
      for (let index = currentPageEnd; index < currentPageEnd + safePageSize; index += 1) {
        if (workingSlots[index] === undefined || workingSlots[index] === null) nextPageVacant += 1
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
      setImportHighlightIds(current => current.filter(id => !importedIdSet.has(id)))
      importHighlightTimerRef.current = null
    }, IMPORT_HIGHLIGHT_MS)
    if (!currentPageHasImported && targetPage !== currentPageRef.current) {
      currentPageRef.current = targetPage
      setCurrentPage(targetPage)
    }
  }, [
    columns,
    importPlacementRequest,
    launchpadGridViewMode,
    layoutDimensionsTracker,
    outerItemIds,
    pageSize,
  ])

  return {
    activeDockKeys,
    captureScrollGridItemPositions,
    columns,
    containerRef,
    currentPage,
    currentPageRef,
    dockKeys,
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
  }
}
