import type { SearchHit } from './types'

export type SearchPageCache = Record<number, SearchHit[]>

export const countCachedSearchResults = (pages: SearchPageCache) =>
  Object.values(pages).reduce((sum, page) => sum + page.length, 0)

export const resolveCompleteSearchSnapshot = (
  items: SearchHit[],
  totalResults: number
): SearchHit[] | null => (items.length === totalResults ? items : null)

export const getCachedSearchResult = ({
  index,
  completeItems,
  pages,
  pageSize,
}: {
  index: number
  completeItems: SearchHit[] | null
  pages: SearchPageCache
  pageSize: number
}): SearchHit | null => {
  if (index < 0) return null
  if (completeItems) return completeItems[index] ?? null

  const pageOffset = Math.floor(index / pageSize) * pageSize
  return pages[pageOffset]?.[index - pageOffset] ?? null
}
