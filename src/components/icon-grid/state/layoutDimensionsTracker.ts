export interface LayoutDimensions {
  pageSize: number
  columns: number
}

export interface LayoutDimensionsTracker {
  read: () => LayoutDimensions
  update: (next: LayoutDimensions) => void
}

export function createLayoutDimensionsTracker(initial: LayoutDimensions): LayoutDimensionsTracker {
  let current = initial

  return {
    read: () => current,
    update: next => {
      current = next
    },
  }
}
