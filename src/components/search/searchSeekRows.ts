import type { SearchHit } from '@/lib/search/types'

export interface SearchVirtualRow {
  index: number
  item: SearchHit | null
}

export interface SearchSeekRow {
  index: number
  item: SearchHit | null
  retained: boolean
}

export const collectResolvedSearchRows = (rows: SearchVirtualRow[]) =>
  rows.flatMap(({ item }) => (item ? [item] : []))

export const projectSearchSeekRows = (
  rows: SearchVirtualRow[],
  retainedItems: SearchHit[]
): SearchSeekRow[] =>
  rows.map((row, slot) => {
    if (row.item) {
      return { ...row, retained: false }
    }
    if (retainedItems.length === 0) {
      return { ...row, retained: false }
    }
    return {
      index: row.index,
      item: retainedItems[slot % retainedItems.length],
      retained: true,
    }
  })
