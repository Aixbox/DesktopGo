export const DOCK_CAPACITY = 8

export const normalizeDockKeys = (
  source: string[] | null | undefined,
  validKeys: Iterable<string>,
  capacity: number = DOCK_CAPACITY
): string[] => {
  const safeCapacity = Math.max(1, capacity)
  const validKeySet = new Set(validKeys)
  const next: string[] = []

  ;(source ?? []).forEach(key => {
    if (next.length >= safeCapacity) return
    if (typeof key !== 'string' || !validKeySet.has(key) || next.includes(key)) return
    next.push(key)
  })

  return next
}

export const applyDockDrop = (
  dockKeys: string[],
  draggingKey: string,
  insertIndex: number,
  capacity: number = DOCK_CAPACITY
): string[] => {
  const safeCapacity = Math.max(1, capacity)
  const exists = dockKeys.includes(draggingKey)
  const next = dockKeys.filter(key => key !== draggingKey)
  if (!exists && next.length >= safeCapacity) {
    return dockKeys.slice(0, safeCapacity)
  }

  const clampedIndex = Math.max(0, Math.min(insertIndex, next.length))
  next.splice(clampedIndex, 0, draggingKey)
  return next.slice(0, safeCapacity)
}

export const getDockPreviewKeys = (
  dockKeys: string[],
  draggingKey: string | null,
  previewIndex: number | null,
  capacity: number = DOCK_CAPACITY
): string[] => {
  if (!draggingKey || previewIndex === null) {
    return dockKeys.slice(0, Math.max(1, capacity))
  }

  return applyDockDrop(dockKeys, draggingKey, previewIndex, capacity)
}
