import type { SearchHit, SearchSort } from './types'

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

const getRelevanceRank = (item: SearchHit, keyword: string, matchPath: boolean): number => {
  const name = normalize(item.name)
  const path = normalize(item.path)

  if (name === keyword) return 0
  if (name.startsWith(keyword)) return 1
  if (name.includes(keyword)) return 2
  if (matchPath && path.includes(keyword)) return 3
  return 4
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
