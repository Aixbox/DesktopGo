import type { SearchHit, SearchSort } from './types'
import {
  DEFAULT_SEARCH_PRIORITY_RULES,
  resolveSearchPriority,
  type SearchPriority,
  type SearchPriorityRules,
} from './priority'
const normalize = (value: string): string => value.trim().toLocaleLowerCase()

/**
 * 匹配质量分，对齐 Listary 的 `MatchScore`。0 表示名称和路径都没有命中关键词 ——
 * 在 `matchPath` 关闭时 Everything 只按文件名匹配，所以这一档正常情况下应该是空的，
 * 出现说明结果集与关键词不对应（例如后端串台）。
 */
const MATCH_SCORE = {
  exact: 1000,
  prefix: 600,
  contains: 300,
  pathContains: 120,
  none: 0,
} as const

/** 优先级加权，对齐 Listary 的 `sort_path_priority`。只降权，不过滤。 */
const PRIORITY_SCORE: Record<SearchPriority, number> = {
  high: 250,
  normal: 0,
  low: -400,
  ignored: -1200,
}

/** 运行次数来自 Everything 自己的启动历史，封顶避免单个常用文件压倒匹配质量。 */
const RUN_COUNT_STEP = 8
const MAX_RUN_COUNT_BONUS = 160
/** 名称越短越贴近关键词，同样封顶，且只在真的匹配上时才计。 */
const MAX_NAME_LENGTH_PENALTY = 60

const getMatchScore = (item: SearchHit, keyword: string, matchPath: boolean): number => {
  const name = normalize(item.name)
  if (name === keyword) return MATCH_SCORE.exact
  if (name.startsWith(keyword)) return MATCH_SCORE.prefix
  if (name.includes(keyword)) return MATCH_SCORE.contains
  if (matchPath && normalize(item.path).includes(keyword)) return MATCH_SCORE.pathContains
  return MATCH_SCORE.none
}

interface ScoredHit {
  item: SearchHit
  index: number
  matched: boolean
  score: number
  priority: SearchPriority
}

const scoreHit = (
  item: SearchHit,
  index: number,
  keyword: string,
  options: { matchPath: boolean; priorityRules: SearchPriorityRules }
): ScoredHit => {
  const priority = resolveSearchPriority(item, options.priorityRules)
  const matchScore = getMatchScore(item, keyword, options.matchPath)
  if (matchScore === MATCH_SCORE.none) {
    // 没有任何相关性信号，就不要重排 —— 否则「名称最短」或「运行次数最多」的那个会
    // 被顶到首位，看起来像排序结论，反而掩盖了一条都没匹配上这件事。
    return { item, index, matched: false, score: 0, priority }
  }

  const runCountBonus = Math.min(
    Math.max(item.runCount ?? 0, 0) * RUN_COUNT_STEP,
    MAX_RUN_COUNT_BONUS
  )
  const lengthPenalty = Math.min(item.name.length, MAX_NAME_LENGTH_PENALTY)

  return {
    item,
    index,
    matched: true,
    score: matchScore + PRIORITY_SCORE[priority] + runCountBonus - lengthPenalty,
    priority,
  }
}

const compareScoredHits = (left: ScoredHit, right: ScoredHit): number => {
  // 真实命中永远排在「没匹配上」之前，降权再狠也不会掉到异常档之后。
  if (left.matched !== right.matched) return left.matched ? -1 : 1
  if (left.score !== right.score) return right.score - left.score
  return left.index - right.index
}

const scoreSearchHits = (
  items: SearchHit[],
  keyword: string,
  options: { matchPath: boolean; priorityRules: SearchPriorityRules }
): ScoredHit[] =>
  items.map((item, index) => scoreHit(item, index, keyword, options)).sort(compareScoredHits)

export function rankSearchHits(
  items: SearchHit[],
  keyword: string,
  options: { matchPath: boolean; priorityRules?: SearchPriorityRules }
): SearchHit[] {
  const normalizedKeyword = normalize(keyword)
  if (!normalizedKeyword || items.length < 2) return items

  return scoreSearchHits(items, normalizedKeyword, {
    matchPath: options.matchPath,
    priorityRules: options.priorityRules ?? DEFAULT_SEARCH_PRIORITY_RULES,
  }).map(entry => entry.item)
}

type SearchPageContext = {
  queryKeyword: string
  queryOptions: { sort?: SearchSort; matchPath?: boolean }
}

export interface RankedSearchPage {
  items: SearchHit[]
  /**
   * 排序过程中顺带收集的高优先级命中（已按分数排好），供「最佳匹配」直接使用。
   * 优先级本来就要为每条结果算一次，所以这里不产生额外扫描。
   *
   * 「高优先级」取决于传入的规则表：用户在设置里加的自定义目录同样算高优先级，
   * 关掉的内置目录组则不再算（见 `buildSearchPriorityRules`）。
   */
  highPriorityItems: SearchHit[]
}

const stripFilterPrefix = (keyword: string): string =>
  keyword.replace(/^(?:file|folder|audio|zip|doc|exe|pic|video):\s*/i, '')

export const rankSearchPageItems = (
  items: SearchHit[],
  context: SearchPageContext,
  priorityRules: SearchPriorityRules = DEFAULT_SEARCH_PRIORITY_RULES
): RankedSearchPage => {
  if (context.queryOptions.sort !== 'relevance') return { items, highPriorityItems: [] }

  const normalizedKeyword = normalize(stripFilterPrefix(context.queryKeyword))
  if (!normalizedKeyword) return { items, highPriorityItems: [] }

  const scored = scoreSearchHits(items, normalizedKeyword, {
    matchPath: Boolean(context.queryOptions.matchPath),
    priorityRules,
  })

  return {
    items: scored.map(entry => entry.item),
    // 全部取完，不截断：优先级判定本来就要为每条结果跑一次，收集是顺带的。
    highPriorityItems: scored
      .filter(entry => entry.matched && entry.priority === 'high')
      .map(entry => entry.item),
  }
}
