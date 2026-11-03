import { useEffect, useEffectEvent, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { GridItem, HotseatEntry, IconItem } from '../model'
import type { DragState } from '../state/types'
import { reconcileHotseatEntries } from '../domain/hotseatLayout'
import { useGridItemResizeController } from '../hooks/useGridItemResizeController'
import { dissolveFolderInTopLevelLayout } from '../domain/folderPolicy'
import { getDefaultFolderColumnCount } from '../domain/gridGeometry'
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
  hotseatEntriesRef: MutableRefObject<HotseatEntry[] | undefined>
  setHotseatEntries: (entries: HotseatEntry[] | undefined) => void
  dockEnabled: boolean
  columns: number
  pageSizeRef: MutableRefObject<number>
  layoutDimensionsTracker: LayoutDimensionsTracker
  columnWidth: number
  rowHeight: number
  onBeforeResizeLayoutChange?: () => void
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
  onBeforeResizeLayoutChange,
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
      setFolderItemWidth(tileWidth)
      setFolderItemHeight(first?.offsetHeight ?? rowHeight)
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

  const itemResize = useGridItemResizeController({
    items,
    itemsRef,
    setItems,
    outerSlotsRef,
    setOuterSlots,
    dockKeysRef,
    dockEnabled,
    columns,
    pageSizeRef,
    layoutDimensionsTracker,
    onBeforeLayoutChange: onBeforeResizeLayoutChange,
  })
  const { plan: folderResizePreviewPlan, renderItemById, folderResizeProps } = itemResize

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
