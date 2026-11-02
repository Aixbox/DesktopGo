import { useEffect, useEffectEvent, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { FolderItem, FolderSize, GridItem, HotseatEntry, IconItem } from '../model'
import type { DragState } from '../state/types'
import { getId } from '../model'
import { resolveOuterItemIds } from '../domain/dock'
import { reconcileHotseatEntries } from '../domain/hotseatLayout'
import { filterItemsByIds } from '../domain/gridItems'
import { buildPersistedItemCoordinates, resizeSlotPages } from '../domain/topLevelLayout'
import { planFolderResize } from '../domain/folderResizeTransaction'
import { dissolveFolderInTopLevelLayout } from '../domain/folderPolicy'
import { getLayoutNormalizationMetrics } from '../domain/gridGeometry'
import { DEFAULT_FOLDER_LAYOUT_PROFILE, type FolderLayoutProfile } from '../domain/folderLayout'
import type { LayoutDimensionsTracker } from '../state/layoutDimensionsTracker'
import { FOLDER_SHARED_LAYOUT_WINDOW_MS } from '../constants'

interface UseScrollableFolderControllerParams {
  items: GridItem[]
  itemsRef: MutableRefObject<GridItem[]>
  setItems: (items: GridItem[]) => void
  outerSlotsRef: MutableRefObject<Array<string | null>>
  setOuterSlots: (slots: Array<string | null>) => void
  dockKeysRef: MutableRefObject<Array<string | null>>
  setDockKeys: (keys: Array<string | null>) => void
  hotseatEntriesRef: MutableRefObject<HotseatEntry[] | undefined>
  setHotseatEntries: (entries: HotseatEntry[] | undefined) => void
  dockEnabled: boolean
  columns: number
  pageSizeRef: MutableRefObject<number>
  layoutDimensionsTracker: LayoutDimensionsTracker
  columnWidth: number
  rowHeight: number
  folderLayoutProfile?: FolderLayoutProfile
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
  hotseatEntriesRef,
  setHotseatEntries,
  dockEnabled,
  columns,
  pageSizeRef,
  layoutDimensionsTracker,
  columnWidth,
  rowHeight,
  folderLayoutProfile = DEFAULT_FOLDER_LAYOUT_PROFILE,
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
  const [folderColumns, setFolderColumns] = useState(() => Math.max(1, folderLayoutProfile.columns))
  const [folderResizePreview, setFolderResizePreview] = useState<{
    folderId: string
    size: FolderSize
  } | null>(null)
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
    setFolderColumns(Math.max(1, folderLayoutProfile.columns))
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
      setFolderItemWidth(first?.offsetWidth ?? columnWidth)
      setFolderItemHeight(first?.offsetHeight ?? rowHeight)
      setFolderColumns(Math.max(1, folderLayoutProfile.columns))
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
  }, [columnWidth, folderLayoutProfile.columns, folderOrder.length, openFolder, rowHeight])

  useEffect(
    () => () => {
      clearFolderSharedLayoutTimer()
      cancelPendingFolderClose()
    },
    []
  )

  const handleResizeFolder = (folderId: string, size: FolderSize) => {
    setFolderResizePreview(null)
    const previousItems = itemsRef.current
    const previousFolder = previousItems.find(
      (item): item is FolderItem => item.kind === 'folder' && item.id === folderId
    )
    if (!previousFolder || previousFolder.size === size) return
    const layoutMetrics = getLayoutNormalizationMetrics(
      filterItemsByIds(
        previousItems,
        resolveOuterItemIds(previousItems.map(getId), dockEnabled ? dockKeysRef.current : [])
      ),
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
            filterItemsByIds(
              previousItems,
              resolveOuterItemIds(previousItems.map(getId), dockEnabled ? dockKeysRef.current : [])
            ),
            previousDimensions.pageSize,
            safePageSize,
            previousDimensions.columns,
            safeColumns,
            buildPersistedItemCoordinates(
              outerSlotsRef.current,
              filterItemsByIds(
                previousItems,
                resolveOuterItemIds(
                  previousItems.map(getId),
                  dockEnabled ? dockKeysRef.current : []
                )
              ),
              previousDimensions.pageSize,
              previousDimensions.columns
            )
          )
    const plan = planFolderResize({
      items: previousItems,
      slots: baseOuterSlots,
      folderId,
      size,
      columns: safeColumns,
      pageSize: safePageSize,
      dockKeys: dockEnabled ? dockKeysRef.current : [],
    })
    if (!plan) return
    itemsRef.current = plan.items
    outerSlotsRef.current = plan.slots
    setItems(plan.items)
    setOuterSlots(plan.slots)
  }

  const folderResizePreviewPlan = useMemo(() => {
    if (!folderResizePreview) return null
    return planFolderResize({
      items,
      slots: outerSlotsRef.current,
      folderId: folderResizePreview.folderId,
      size: folderResizePreview.size,
      columns: Math.max(1, columns),
      pageSize: Math.max(1, pageSizeRef.current),
      dockKeys: dockEnabled ? dockKeysRef.current : [],
    })
  }, [columns, dockEnabled, folderResizePreview, items, pageSizeRef])

  const renderItemById = useMemo(() => {
    const sourceItems = folderResizePreviewPlan?.items ?? items
    return new Map(sourceItems.map(item => [getId(item), item]))
  }, [folderResizePreviewPlan, items])
  const folderResizeProps = {
    onResizeFolder: handleResizeFolder,
    folderResizePreview,
    onPreviewFolderResize: (folderId: string, size: FolderSize) =>
      setFolderResizePreview({ folderId, size }),
    onCancelFolderResize: () => setFolderResizePreview(null),
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
    const nextHotseatEntries = reconcileHotseatEntries(hotseatEntriesRef.current, result.dockKeys)
    hotseatEntriesRef.current = nextHotseatEntries
    setHotseatEntries(nextHotseatEntries)
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
    folderResizePreviewPlan,
    folderResizeProps,
    renderItemById,
    openFolder,
    openFolderId,
    openFolderWithAnimation,
    setOpenFolderId,
    visibleActiveFolderSharedLayoutId,
    visibleOpenFolderId,
  }
}
