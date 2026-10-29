import { useCallback, useRef, type MutableRefObject } from 'react'
import type { GridItem } from '../model'
import { applyWidgetResizeLayout } from '../domain/widgetResizeLayout'

interface UseWidgetResizeHandlerParams {
  itemsRef: MutableRefObject<GridItem[]>
  outerSlotsRef: MutableRefObject<Array<string | null>>
  dockKeysRef: MutableRefObject<Array<string | null>>
  pageSizeRef: MutableRefObject<number>
  columns: number
  setItems: (items: GridItem[]) => void
  setOuterSlots: (slots: Array<string | null>) => void
}

/** Owns the in-memory Widget resize revision and applies one atomic layout update. */
export function useWidgetResizeHandler({
  itemsRef,
  outerSlotsRef,
  dockKeysRef,
  pageSizeRef,
  columns,
  setItems,
  setOuterSlots,
}: UseWidgetResizeHandlerParams) {
  const revisionRef = useRef(0)
  return useCallback(
    (widgetId: string, nextSpanX: number, nextSpanY: number) => {
      const result = applyWidgetResizeLayout({
        items: itemsRef.current,
        slots: outerSlotsRef.current,
        dockKeys: dockKeysRef.current,
        pageSize: Math.max(1, pageSizeRef.current),
        columns: Math.max(1, columns),
        widgetId,
        nextSpanX,
        nextSpanY,
        revision: revisionRef.current,
      })
      if (!result) return

      revisionRef.current = result.revision
      itemsRef.current = result.items
      outerSlotsRef.current = result.slots
      setItems(result.items)
      setOuterSlots(result.slots)
    },
    [columns, dockKeysRef, itemsRef, outerSlotsRef, pageSizeRef, setItems, setOuterSlots]
  )
}
