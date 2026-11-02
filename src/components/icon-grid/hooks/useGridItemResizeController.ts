import { useMemo, useState, type MutableRefObject } from 'react'
import { getId, type GridItem, type TileSize } from '../model'
import { planItemResize, type ItemResizePlan } from '../domain/itemResizeTransaction'
import { resolveOuterItemIds } from '../domain/dock'
import { filterItemsByIds } from '../domain/gridItems'
import { getLayoutNormalizationMetrics } from '../domain/gridGeometry'
import { buildPersistedItemCoordinates, resizeSlotPages } from '../domain/topLevelLayout'
import type { LayoutDimensionsTracker } from '../state/layoutDimensionsTracker'
import type { GridItemResizeActions } from './gridItemResizeContext'

interface Params {
  items: GridItem[]
  itemsRef: MutableRefObject<GridItem[]>
  setItems: (items: GridItem[]) => void
  outerSlotsRef: MutableRefObject<Array<string | null>>
  setOuterSlots: (slots: Array<string | null>) => void
  dockKeysRef: MutableRefObject<Array<string | null>>
  dockEnabled: boolean
  columns: number
  pageSizeRef: MutableRefObject<number>
  layoutDimensionsTracker: LayoutDimensionsTracker
}

function committedResizePlan(params: Params, itemId: string, size: TileSize) {
  const { itemsRef, dockEnabled, dockKeysRef, outerSlotsRef } = params
  const items = itemsRef.current
  const dockKeys = dockEnabled ? dockKeysRef.current : []
  const outerItems = filterItemsByIds(items, resolveOuterItemIds(items.map(getId), dockKeys))
  const metrics = getLayoutNormalizationMetrics(
    outerItems,
    params.columns,
    params.pageSizeRef.current
  )
  const previous = params.layoutDimensionsTracker.read()
  const slots =
    previous.pageSize === metrics.pageSize && previous.columns === metrics.columns
      ? [...outerSlotsRef.current]
      : resizeSlotPages(
          outerSlotsRef.current,
          outerItems,
          previous.pageSize,
          metrics.pageSize,
          previous.columns,
          metrics.columns,
          buildPersistedItemCoordinates(
            outerSlotsRef.current,
            outerItems,
            previous.pageSize,
            previous.columns
          )
        )
  return planItemResize({ items, slots, dockKeys, itemId, size, ...metrics })
}

/** Preview is transient; commit always replans against the committed layout, never preview items. */
export function useGridItemResizeController(params: Params) {
  const [preview, setPreview] = useState<{
    itemId: string
    size: TileSize
    sourceItems: GridItem[]
    plan: ItemResizePlan | null
  } | null>(null)
  const { items, itemsRef, outerSlotsRef, setItems, setOuterSlots } = params
  // Capture committed data in the pointer handler. Render never reads mutable layout refs,
  // and an external item update invalidates a stale preview without overwriting that update.
  const plan = preview?.sourceItems === items ? preview.plan : null
  const renderItemById = useMemo(
    () => new Map((plan?.items ?? items).map(item => [getId(item), item])),
    [plan, items]
  )
  const actions: GridItemResizeActions = {
    preview: (itemId, size) =>
      setPreview({
        itemId,
        size,
        sourceItems: itemsRef.current,
        plan: committedResizePlan(params, itemId, size),
      }),
    cancel: () => setPreview(null),
    commit: (itemId, size) => {
      setPreview(null)
      const next = committedResizePlan(params, itemId, size)
      if (!next) return
      itemsRef.current = next.items
      outerSlotsRef.current = next.slots
      setItems(next.items)
      setOuterSlots(next.slots)
    },
  }
  const folderResizeProps = {
    resizeActions: actions,
    onResizeFolder: (folderId: string, size: TileSize) =>
      actions.commit(`folder:${folderId}`, size),
    folderResizePreview: preview?.itemId.startsWith('folder:')
      ? { folderId: preview.itemId.slice(7), size: preview.size }
      : null,
    onPreviewFolderResize: (folderId: string, size: TileSize) =>
      actions.preview(`folder:${folderId}`, size),
    onCancelFolderResize: actions.cancel,
  }
  return { plan, renderItemById, actions, folderResizeProps }
}
