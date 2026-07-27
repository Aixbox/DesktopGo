import { useCallback, useRef, useState } from 'react'

export function useQueuedPrompts<T>(dispatchItem: (item: T) => Promise<void>) {
  const [items, setItems] = useState<T[]>([])
  const itemsRef = useRef<T[]>([])

  const replace = useCallback((nextItems: T[]) => {
    itemsRef.current = nextItems
    setItems(nextItems)
  }, [])

  const enqueue = useCallback(
    (item: T) => {
      replace([...itemsRef.current, item])
    },
    [replace]
  )

  const drain = useCallback(async () => {
    while (itemsRef.current.length > 0) {
      const [nextItem, ...remainingItems] = itemsRef.current
      replace(remainingItems)
      await dispatchItem(nextItem)
    }
  }, [dispatchItem, replace])

  const clear = useCallback(() => replace([]), [replace])

  return { items, enqueue, drain, clear }
}
