import { useCallback, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import type { HotseatEntry } from '../model'
import { reconcileHotseatEntries, reorderHotseatItemIds } from '../domain/hotseatLayout'
import { useDocumentDirection } from './useDocumentDirection'

interface UseDockKeyboardReorderParams {
  dockKeys: readonly (string | null)[]
  setDockKeys: Dispatch<SetStateAction<Array<string | null>>>
  hotseatEntries: HotseatEntry[] | undefined
  setHotseatEntries: Dispatch<SetStateAction<HotseatEntry[] | undefined>>
}
export interface DockKeyboardReorderResult {
  activeId: string | null
  handleKeyDown: (event: KeyboardEvent<HTMLElement>, itemId: string) => void
}

/**
 * Accessible Dock reorder that shares the canonical item order and runtime
 * Hotseat placeholder reconciliation with pointer drag commits. The order is
 * updated while the user moves so screen readers and the visual Dock expose
 * the same target before Enter/Space confirms it; Escape restores the source.
 */
export function useDockKeyboardReorder({
  dockKeys,
  setDockKeys,
  hotseatEntries,
  setHotseatEntries,
}: UseDockKeyboardReorderParams): DockKeyboardReorderResult {
  const direction = useDocumentDirection()
  const [activeId, setActiveId] = useState<string | null>(null)
  const originalOrderRef = useRef<string[] | null>(null)

  const commitOrder = useCallback(
    (nextOrder: string[]) => {
      setDockKeys(nextOrder)
      const nextHotseatEntries = reconcileHotseatEntries(hotseatEntries, nextOrder)
      setHotseatEntries(nextHotseatEntries)
    },
    [hotseatEntries, setDockKeys, setHotseatEntries]
  )

  const finish = useCallback(() => {
    originalOrderRef.current = null
    setActiveId(null)
  }, [])

  const cancel = useCallback(() => {
    const original = originalOrderRef.current
    if (original) commitOrder(original)
    finish()
  }, [commitOrder, finish])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, itemId: string) => {
      const key = event.key
      const starts = key === ' ' || key === 'Enter'
      const active = activeId

      if (active === null) {
        if (!starts || !dockKeys.some(entry => entry === itemId)) return
        event.preventDefault()
        event.stopPropagation()
        originalOrderRef.current = dockKeys.filter(
          (entry): entry is string => typeof entry === 'string'
        )
        setActiveId(itemId)
        return
      }

      if (active !== itemId) return
      if (starts) {
        event.preventDefault()
        event.stopPropagation()
        finish()
        return
      }
      if (key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancel()
        return
      }

      const itemIds = dockKeys.filter(
        (entry): entry is string => typeof entry === 'string' && entry.length > 0
      )
      const currentIndex = itemIds.indexOf(active)
      if (currentIndex < 0) {
        cancel()
        return
      }

      let targetIndex: number | null = null
      const rtl = direction === 'rtl'
      if (key === 'Home') targetIndex = 0
      else if (key === 'End') targetIndex = itemIds.length - 1
      else if (key === 'ArrowLeft') targetIndex = currentIndex + (rtl ? 1 : -1)
      else if (key === 'ArrowRight') targetIndex = currentIndex + (rtl ? -1 : 1)
      else return

      event.preventDefault()
      event.stopPropagation()
      if (targetIndex === null) return
      const nextOrder = reorderHotseatItemIds(itemIds, active, targetIndex)
      if (nextOrder.join('\u0000') !== itemIds.join('\u0000')) commitOrder(nextOrder)
    },
    [activeId, cancel, commitOrder, direction, dockKeys, finish]
  )

  return { activeId, handleKeyDown }
}
