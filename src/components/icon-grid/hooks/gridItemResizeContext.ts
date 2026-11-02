import { createContext, useContext } from 'react'
import type { TileSize } from '../model'

export interface GridItemResizeActions {
  preview: (itemId: string, size: TileSize) => void
  commit: (itemId: string, size: TileSize) => void
  cancel: () => void
}

export const GridItemResizeContext = createContext<GridItemResizeActions | null>(null)
export const useGridItemResizeActions = () => useContext(GridItemResizeContext)
