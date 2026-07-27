import type { MutableRefObject } from 'react'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import type { GridItem, ScrollGroupMeta } from '../model'

export interface GridItemPosition {
  left: number
  top: number
}

export interface ScrollGridSection {
  index: number
  groupId: string
  entries: PageAnchorEntry[]
  itemCount: number
  previewItems: GridItem[]
  meta?: ScrollGroupMeta
}

export type ExternalGridFlipPositionsRef = MutableRefObject<Map<string, GridItemPosition> | null>
