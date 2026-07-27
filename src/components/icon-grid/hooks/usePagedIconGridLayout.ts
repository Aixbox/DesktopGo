import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { DesktopIcon } from '../../../types'
import type { GridItem, PersistedLayout } from '../model'
import { getGridItemSpan, getId } from '../model'
import { compactEmptyPages, areSlotsEqual } from '../domain/slots'
import { clampNumber } from '../domain/geometry'
import {
  hydrateDockKeys,
  hydrateItems,
  readLayout,
  serializeItems,
  writeLayout,
} from '../services/layoutStore'
import {
  buildPersistedItemCoordinates,
  canPlaceItemAtAnchorIndex,
  getFootprintIndices,
  normalizeOuterSlots,
  repairPathologicallySparsePages,
  resizeSlotPages,
} from '../domain/topLevelLayout'
import { resolveOuterItemIds } from '../domain/dock'
import {
  resolveLayoutHydrationSource,
  shouldResetPersistedLayoutCache,
} from '../domain/layoutHydrationPolicy'
import {
  fitGridItemCount,
  getLayoutNormalizationMetrics,
  isSuspiciousSingleCellPageGeometry,
} from '../domain/gridGeometry'
import { filterItemsByIds } from '../domain/gridItems'
import { createLayoutDimensionsTracker } from '../state/layoutDimensionsTracker'
import { GRID_GAP, IMPORT_HIGHLIGHT_MS } from '../constants'

export interface PagedImportPlacementRequest {
  token: number
  iconKeys: string[]
  targetGroupId?: string
}

interface UsePagedIconGridLayoutParams {
  icons: DesktopIcon[]
  layoutResetToken: number
  importPlacementRequest?: PagedImportPlacementRequest | null
  dockEnabled: boolean
  geometryKey: string
  columnWidth: number
  rowHeight: number
  layoutRowHeight: number
}

interface LockedGeometry {
  key: string
  columns: number
  rows: number
}

export function usePagedIconGridLayout({
  icons,
  layoutResetToken,
  importPlacementRequest,
  dockEnabled,
  geometryKey,
  columnWidth,
  rowHeight,
  layoutRowHeight,
}: UsePagedIconGridLayoutParams) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const importHighlightTimerRef = useRef<number | null>(null)
  const hydratedRef = useRef(false)
  const layoutBaselineRef = useRef(false)
  const persistedDimsRef = useRef<{ pageSize: number; columns: number } | null>(null)
  const persistedCoordinatesRef = useRef<PersistedLayout['coordinates']>(undefined)
  const lockedGeometryRef = useRef<LockedGeometry | null>(null)
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

  const [columns, setColumns] = useState(1)
  const [rows, setRows] = useState(1)
  const [layoutHydrationTick, setLayoutHydrationTick] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [itemWidth, setItemWidth] = useState(columnWidth)
  const [itemHeight, setItemHeight] = useState(rowHeight)
  const [items, setItems] = useState<GridItem[]>([])
  const [importHighlightIds, setImportHighlightIds] = useState<string[]>([])
  const [outerSlots, setOuterSlots] = useState<Array<string | null>>([])
  const [dockKeys, setDockKeys] = useState<Array<string | null>>([])
  const [layoutDimensionsTracker] = useState(() =>
    createLayoutDimensionsTracker({ pageSize: Math.max(1, columns * rows), columns })
  )
  const readLayoutHydrationEnvironment = useEffectEvent(() => ({ dockEnabled, geometryKey }))

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

  const clearImportHighlightTimer = () => {
    if (importHighlightTimerRef.current === null) return
    window.clearTimeout(importHighlightTimerRef.current)
    importHighlightTimerRef.current = null
  }

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
          persistedLayoutLoadPromiseRef.current ??= readLayout()
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
      persistedScrollGroupsRef.current = persisted?.scrollGroups

      if (hydrationSource !== 'memory') {
        if (
          hasDims &&
          persisted?.geometryKey &&
          persisted.geometryKey === hydrationEnvironment.geometryKey
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
      itemsRef.current = nextItems
      outerSlotsRef.current = rawSlots
      dockKeysRef.current = nextDockKeys
      setItems(nextItems)
      setOuterSlots(rawSlots)
      setDockKeys(nextDockKeys)
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
    if (!hydratedRef.current || !layoutBaselineRef.current) return

    const layoutDimensions = layoutDimensionsTracker.read()
    if (layoutDimensions.pageSize === 1 && layoutDimensions.columns === 1) return

    const nextGeometryKey = lockedGeometryRef.current?.key ?? geometryKey
    layoutWriteQueueRef.current = layoutWriteQueueRef.current
      .then(() =>
        writeLayout(
          items,
          outerSlots,
          dockKeys,
          layoutDimensions.pageSize,
          layoutDimensions.columns,
          nextGeometryKey,
          persistedScrollGroupsRef.current
        )
      )
      .catch(error => {
        console.error('Failed to persist launchpad layout:', error)
      })
  }, [dockKeys, geometryKey, items, layoutDimensionsTracker, outerSlots])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    let animationFrame = 0
    const recalculate = () => {
      const tileWidth = columnWidth
      const tileHeight = rowHeight
      const hasWideItems = itemsRef.current.some(item => getGridItemSpan(item).cols > 1)
      const hasTallItems = itemsRef.current.some(item => getGridItemSpan(item).rows > 1)
      const minimumRows = hasTallItems ? 2 : 1
      const baseRows = Math.max(
        minimumRows,
        fitGridItemCount(element.clientHeight, layoutRowHeight)
      )
      const nextRowGridHeight = (baseRows + 1) * tileHeight + baseRows * GRID_GAP
      const measuredRows =
        !dockEnabled && nextRowGridHeight <= element.clientHeight ? baseRows + 1 : baseRows
      const measuredColumns = Math.max(
        hasWideItems ? 2 : 1,
        fitGridItemCount(element.clientWidth, tileWidth)
      )
      const measuredPageSize = Math.max(1, measuredColumns * measuredRows)
      const locked = lockedGeometryRef.current
      const isLocked = locked !== null && locked.key === geometryKey

      if (
        !isLocked &&
        isSuspiciousSingleCellPageGeometry({
          columns: measuredColumns,
          rows: measuredRows,
          pageSize: measuredPageSize,
        })
      ) {
        return
      }

      const finalColumns = isLocked ? locked.columns : measuredColumns
      const finalRows = isLocked ? locked.rows : measuredRows
      if (!isLocked) {
        lockedGeometryRef.current = { key: geometryKey, columns: finalColumns, rows: finalRows }
      }
      setItemWidth(tileWidth)
      setItemHeight(tileHeight)
      setColumns(finalColumns)
      setRows(finalRows)
      layoutReadyRef.current = true
    }
    const schedule = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(recalculate)
    }

    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    if (gridRef.current) observer.observe(gridRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [
    columnWidth,
    currentPage,
    dockEnabled,
    geometryKey,
    itemLayoutSignature,
    layoutHydrationTick,
    layoutRowHeight,
    rowHeight,
  ])

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

    const repaired = repairPathologicallySparsePages(
      normalized,
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

  return {
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
    dockKeys,
    setDockKeys,
    layoutDimensionsTracker,
    activeDockKeys,
    outerItemIds,
    pageSize,
  }
}
