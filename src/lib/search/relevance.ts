import type { SearchHit, SearchSort } from './types'

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

/** No part of the hit matched the keyword, so it carries no relevance signal. */
const UNMATCHED_RANK = 4

const getRelevanceRank = (item: SearchHit, keyword: string, matchPath: boolean): number => {
  const name = normalize(item.name)
  const path = normalize(item.path)

  if (name === keyword) return 0
  if (name.startsWith(keyword)) return 1
  if (name.includes(keyword)) return 2
  if (matchPath && path.includes(keyword)) return 3
  return UNMATCHED_RANK
}

export function rankSearchHits(
  items: SearchHit[],
  keyword: string,
  options: { matchPath: boolean }
): SearchHit[] {
  const normalizedKeyword = normalize(keyword)
  if (!normalizedKeyword || items.length < 2) return items

  return items
    .map((item, index) => ({
      item,
      index,
      rank: getRelevanceRank(item, normalizedKeyword, options.matchPath),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank
      // Shorter names are closer matches — but only once something actually
      // matched. Applying that to unmatched hits would promote whichever one
      // happens to have the shortest name to the top of the list, which reads
      // as a ranking decision and hides the fact that nothing matched at all.
      if (left.rank === UNMATCHED_RANK) return left.index - right.index
      if (left.item.name.length !== right.item.name.length) {
        return left.item.name.length - right.item.name.length
      }
      const nameOrder = left.item.name.localeCompare(right.item.name)
      if (nameOrder !== 0) return nameOrder
      return left.index - right.index
    })
    .map(entry => entry.item)
}

type SearchPageContext = {
  queryKeyword: string
  queryOptions: { sort?: SearchSort; matchPath?: boolean }
}

export const rankSearchPageItems = (items: SearchHit[], context: SearchPageContext) => {
  if (context.queryOptions.sort !== 'relevance') return items
  const keyword = context.queryKeyword.replace(
    /^(?:file|folder|audio|zip|doc|exe|pic|video):\s*/i,
    ''
  )
  return rankSearchHits(items, keyword, { matchPath: Boolean(context.queryOptions.matchPath) })
}
