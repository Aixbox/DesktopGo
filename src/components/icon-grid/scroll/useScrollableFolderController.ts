import { useEffect, useEffectEvent, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { FolderItem, FolderSize, GridItem, IconItem } from '../model'
import type { DragState } from '../state/types'
import { getGridItemSpan, getId } from '../model'
import { resolveOuterItemIds } from '../domain/dock'
import { filterItemsByIds } from '../domain/gridItems'
import {
  buildPersistedItemCoordinates,
  findBestResizeAnchorIndex,
  getFootprintIndices,
  normalizeOuterSlots,
  resizeSlotPages,
} from '../domain/topLevelLayout'
import { compactEmptyPages } from '../domain/slots'
import { dissolveFolderInTopLevelLayout } from '../domain/folderPolicy'
import { getDefaultFolderColumnCount, getLayoutNormalizationMetrics } from '../domain/gridGeometry'
import type { LayoutDimensionsTracker } from '../state/layoutDimensionsTracker'
import { FOLDER_MODAL_MAX_WIDTH } from '../views/folderVisualPolicy'
import { FOLDER_SHARED_LAYOUT_WINDOW_MS } from '../constants'

interface UseScrollableFolderControllerParams {
  items: GridItem[]
  itemsRef: MutableRefObject<GridItem[]>
  setItems: (items: GridItem[]) => void
  outerSlotsRef: MutableRefObject<Array<string | null>>
  setOuterSlots: (slots: Array<string | null>) => void
  dockKeysRef: MutableRefObject<Array<string | null>>
  setDockKeys: (keys: Array<string | null>) => void
  dockEnabled: boolean
  columns: number
  pageSizeRef: MutableRefObject<number>
  layoutDimensionsTracker: LayoutDimensionsTracker
  columnWidth: number
  rowHeight: number
}

interface UseScrollableFolderKeyboardDismissParams {
  openFolderId: string | null
  dragRef: MutableRefObject<DragState | null>
  onClose: () => void
}

export function useScrollableFolderKeyboardDismiss({
  openFolderId,
  dragRef,
  onClose,
}: UseScrollableFolderKeyboardDismissParams) {
  const closeFolder = useEffectEvent(onClose)

  useEffect(() => {
    if (!openFolderId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (dragRef.current?.context === 'folder') {
        event.preventDefault()
        return
      }
      event.preventDefault()
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      closeFolder()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dragRef, openFolderId])
}

export function useScrollableFolderController({
  items,
  itemsRef,
  setItems,
  outerSlotsRef,
  setOuterSlots,
  dockKeysRef,
  setDockKeys,
  dockEnabled,
  columns,
  pageSizeRef,
  layoutDimensionsTracker,
  columnWidth,
  rowHeight,
}: UseScrollableFolderControllerParams) {
  const folderPanelRef = useRef<HTMLDivElement>(null)
  const folderGridContainerRef = useRef<HTMLDivElement>(null)
  const folderGridRef = useRef<HTMLDivElement>(null)
  const folderSharedLayoutTimerRef = useRef<number | null>(null)
  const folderCloseRafRef = useRef<number | null>(null)
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [activeFolderSharedLayoutId, setActiveFolderSharedLayoutId] = useState<string | null>(null)
  const [folderItemWidth, setFolderItemWidth] = useState(columnWidth)
  const [folderItemHeight, setFolderItemHeight] = useState(rowHeight)
  const [folderColumns, setFolderColumns] = useState(() =>
    getDefaultFolderColumnCount(columnWidth, FOLDER_MODAL_MAX_WIDTH)
  )
  const openFolder = useMemo(() => {
    if (!openFolderId) return null
    const found = items.find(item => item.kind === 'folder' && item.id === openFolderId)
    return found && found.kind === 'folder' ? found : null
  }, [items, openFolderId])
  const visibleOpenFolderId = openFolder?.id ?? null
  const visibleActiveFolderSharedLayoutId = visibleOpenFolderId ? activeFolderSharedLayoutId : null
  const folderItemById = useMemo(() => {
    const map = new Map<string, IconItem>()
    openFolder?.children.forEach(child => map.set(child.key, child))
    return map
  }, [openFolder])
  const folderOrder = useMemo(
    () => openFolder?.children.map(child => child.key) ?? [],
    [openFolder]
  )

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
    setFolderItemWidth(columnWidth)
    setFolderItemHeight(rowHeight)
    setFolderColumns(getDefaultFolderColumnCount(columnWidth, FOLDER_MODAL_MAX_WIDTH))
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
    const container = folderGridContainerRef.current
    if (!container || !openFolder) return
    let frame = 0
    const recalculate = () => {
      const first = folderGridRef.current?.querySelector<HTMLElement>('[data-folder-grid-item]')
      const tileWidth = first?.offsetWidth ?? columnWidth
      const tileHeight = first?.offsetHeight ?? rowHeight
      setFolderItemWidth(tileWidth)
      setFolderItemHeight(tileHeight)
      setFolderColumns(getDefaultFolderColumnCount(tileWidth, FOLDER_MODAL_MAX_WIDTH))
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(recalculate)
    }
    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    if (folderGridRef.current) observer.observe(folderGridRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [columnWidth, folderOrder.length, openFolder, rowHeight])

  useEffect(
    () => () => {
      clearFolderSharedLayoutTimer()
      cancelPendingFolderClose()
    },
    []
  )

  const handleResizeFolder = (folderId: string, size: FolderSize) => {
    const resizedFolderEntryId = `folder:${folderId}`
    const previousItems = itemsRef.current
    const previousOuterItemIds = resolveOuterItemIds(
      previousItems.map(getId),
      dockEnabled ? dockKeysRef.current : []
    )
    const previousOuterItems = filterItemsByIds(previousItems, previousOuterItemIds)
    const previousFolder = previousItems.find(
      (item): item is FolderItem => item.kind === 'folder' && item.id === folderId
    )
    if (!previousFolder || previousFolder.size === size) return
    const nextItems = previousItems.map(item =>
      item.kind === 'folder' && item.id === folderId ? { ...item, size } : item
    )
    const nextOuterItemIds = resolveOuterItemIds(
      nextItems.map(getId),
      dockEnabled ? dockKeysRef.current : []
    )
    const outerItems = filterItemsByIds(nextItems, nextOuterItemIds)
    const layoutMetrics = getLayoutNormalizationMetrics(
      outerItems,
      Math.max(1, columns),
      pageSizeRef.current
    )
    const safePageSize = Math.max(1, layoutMetrics.pageSize)
    const safeColumns = Math.max(1, layoutMetrics.columns)
    const previousDimensions = layoutDimensionsTracker.read()
    const baseOuterSlots =
      previousDimensions.pageSize === safePageSize && previousDimensions.columns === safeColumns
        ? [...outerSlotsRef.current]
        : resizeSlotPages(
            outerSlotsRef.current,
            previousOuterItems,
            previousDimensions.pageSize,
            safePageSize,
            previousDimensions.columns,
            safeColumns,
            buildPersistedItemCoordinates(
              outerSlotsRef.current,
              previousOuterItems,
              previousDimensions.pageSize,
              previousDimensions.columns
            )
          )
    const originalAnchorIndex = baseOuterSlots.indexOf(resizedFolderEntryId)
    const preferredAnchorIndex =
      originalAnchorIndex >= 0
        ? findBestResizeAnchorIndex({
            slots: baseOuterSlots,
            items: previousOuterItems,
            itemId: resizedFolderEntryId,
            currentAnchorIndex: originalAnchorIndex,
            currentSpan: getGridItemSpan(previousFolder),
            nextSpan: getGridItemSpan({ ...previousFolder, size }),
            columns: safeColumns,
            pageSize: safePageSize,
          })
        : null
    const preferredAnchorById =
      preferredAnchorIndex !== null &&
      preferredAnchorIndex < Math.max(safePageSize, baseOuterSlots.length)
        ? new Map([[resizedFolderEntryId, preferredAnchorIndex]])
        : undefined
    let effectiveBaseOuterSlots = baseOuterSlots
    const finalAnchorIndex = preferredAnchorIndex ?? originalAnchorIndex
    if (finalAnchorIndex >= 0) {
      const footprint = getFootprintIndices(
        finalAnchorIndex,
        getGridItemSpan({ ...previousFolder, size }),
        safeColumns,
        safePageSize
      )
      if (footprint) {
        const footprintSet = new Set(footprint)
        const folderPageStart = Math.floor(finalAnchorIndex / safePageSize) * safePageSize
        const folderPageEnd = folderPageStart + safePageSize
        let displacedCount = 0
        for (let index = folderPageStart; index < folderPageEnd; index += 1) {
          if (!footprintSet.has(index)) continue
          const slot = effectiveBaseOuterSlots[index]
          if (slot && slot !== resizedFolderEntryId) displacedCount += 1
        }
        let nextPageVacant = 0
        for (let index = folderPageEnd; index < folderPageEnd + safePageSize; index += 1) {
          const slot = effectiveBaseOuterSlots[index]
          if (slot === undefined || slot === null) nextPageVacant += 1
        }
        if (displacedCount > nextPageVacant) {
          effectiveBaseOuterSlots = [
            ...effectiveBaseOuterSlots.slice(0, folderPageEnd),
            ...Array.from({ length: safePageSize }, () => null as string | null),
            ...effectiveBaseOuterSlots.slice(folderPageEnd),
          ]
        }
      }
    }
    const nextOuterSlots = compactEmptyPages(
      normalizeOuterSlots(effectiveBaseOuterSlots, outerItems, safePageSize, safeColumns, {
        preferredAnchorById,
        spillStrategy: 'row-major-forward',
      }),
      safePageSize
    )
    itemsRef.current = nextItems
    outerSlotsRef.current = nextOuterSlots
    setItems(nextItems)
    setOuterSlots(nextOuterSlots)
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

  return {
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
    handleDissolveFolder,
    handleResizeFolder,
    openFolder,
    openFolderId,
    openFolderWithAnimation,
    setOpenFolderId,
    visibleActiveFolderSharedLayoutId,
    visibleOpenFolderId,
  }
}
