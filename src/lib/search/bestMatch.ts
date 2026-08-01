import type { DesktopIcon } from '@/types'
import type { SearchHit } from './types'
import { scoreBestFuzzyMatch } from './fuzzyScore'
import { collectLauncherIdentities, normalizeLauncherPath } from './launcherIdentity'
import {
  DEFAULT_SEARCH_PRIORITY_RULES,
  resolveSearchPriority,
  type SearchPriorityRules,
} from './priority'
import type { ShortcutUsageState } from './shortcutUsage'

/**
 * 「最佳匹配」区里的一条结果。启动台快捷方式和 Everything 的高优先级文件命中
 * 在这里按同一套分数混排，所以两类候选必须打到同一个量纲上。
 *
 * 对齐 Listary 的做法：应用/快捷方式和高优先级路径同属「最佳匹配」，
 * 见 docs/LISTARY_BINARY_ANALYSIS.zh-CN.md 第 4 节与第 7 节。
 */
export type BestMatchItem =
  | { kind: 'shortcut'; key: string; name: string; detail: string; icon: DesktopIcon }
  | { kind: 'file'; key: string; name: string; detail: string; hit: SearchHit }

/** 只有优先级为 high 的文件命中才有资格进入最佳匹配。 */
const ELIGIBLE_FILE_PRIORITY = 'high'

/**
 * 这条命中够不够格进最佳匹配。
 *
 * 目录清单的条目在拉取时判定一次就够了（配置不变，判定结果也不会变），调用方据此
 * 预先筛好再传进来 —— 目录表可以有上万条，而优先级判定要为每条把整条路径小写化、
 * 再逐条比对降权规则，放在按键的关键路径上会明显拖慢输入。
 */
export const isBestMatchEligible = (
  hit: { path: string; name: string },
  rules: SearchPriorityRules = DEFAULT_SEARCH_PRIORITY_RULES
): boolean => resolveSearchPriority(hit, rules) === ELIGIBLE_FILE_PRIORITY

/**
 * 两类候选都是「高优先级」：文件命中由 `resolveSearchPriority` 判定为 high 才准入，
 * 启动台图标是用户亲手摆上去的，本身就等同于 high。所以两边同样计入这一项，
 * 它对排序没有净影响，写出来是为了让「启动台图标没被漏掉加权」这件事在代码里可见。
 */
const HIGH_PRIORITY_BONUS = 250

/** 在同为高优先级的前提下，启动台图标同分时略微占优。 */
const CURATED_SHORTCUT_BONUS = 40

/** 使用历史加权：快捷方式用启动次数，文件用 Everything 的运行次数，同一套封顶。 */
const USAGE_STEP = 8
const MAX_USAGE_BONUS = 160

const FUZZY_SECONDARY_WEIGHT = 0.45
const FUZZY_PATH_WEIGHT = 0.3

const usageBonus = (count: number): number =>
  Math.min(Math.max(count, 0) * USAGE_STEP, MAX_USAGE_BONUS)

const getShortcutLaunchCount = (usage: ShortcutUsageState | undefined, id: string): number =>
  usage?.enabled ? (usage.entries[id]?.launchCount ?? 0) : 0

interface ScoredBestMatch {
  item: BestMatchItem
  score: number
  order: number
}

const scoreShortcut = (
  icon: DesktopIcon,
  keyword: string,
  order: number,
  usage: ShortcutUsageState | undefined
): ScoredBestMatch | null => {
  const fuzzy = scoreBestFuzzyMatch(keyword, [
    { text: icon.name },
    { text: icon.target_path ?? '', weight: FUZZY_SECONDARY_WEIGHT },
    { text: icon.path ?? '', weight: FUZZY_PATH_WEIGHT },
  ])
  if (!fuzzy.matched) return null

  return {
    item: {
      kind: 'shortcut',
      key: `shortcut:${icon.id}`,
      name: icon.name,
      detail: icon.target_path || icon.path,
      icon,
    },
    score:
      fuzzy.score +
      HIGH_PRIORITY_BONUS +
      CURATED_SHORTCUT_BONUS +
      usageBonus(getShortcutLaunchCount(usage, icon.id)),
    order,
  }
}

const scoreFileHit = (
  hit: SearchHit,
  keyword: string,
  order: number,
  rules: SearchPriorityRules,
  preapproved: boolean
): ScoredBestMatch | null => {
  if (!preapproved && !isBestMatchEligible(hit, rules)) return null

  const fuzzy = scoreBestFuzzyMatch(keyword, [
    { text: hit.name },
    { text: hit.parent ?? '', weight: FUZZY_PATH_WEIGHT },
  ])
  if (!fuzzy.matched) return null

  return {
    item: {
      kind: 'file',
      key: `file:${hit.path}`,
      name: hit.name,
      detail: hit.parent || hit.path,
      hit,
    },
    score: fuzzy.score + HIGH_PRIORITY_BONUS + usageBonus(hit.runCount ?? 0),
    order,
  }
}

export interface CollectBestMatchesOptions {
  icons: DesktopIcon[]
  /** Everything 的命中（已按相关性排好序，通常只传前若干条），逐条判定是否够格。 */
  fileHits: SearchHit[]
  /**
   * 目录清单枚举出来的条目。调用方必须已经按 `isBestMatchEligible` 筛过 ——
   * 这里不再逐条重算优先级，因为目录表可能有上万条，而这段代码在按键的关键路径上。
   */
  catalogHits?: SearchHit[]
  keyword: string
  limit: number
  usage?: ShortcutUsageState
  priorityRules?: SearchPriorityRules
  /**
   * 归一化路径 → `.lnk` 目标，来自目录清单（`useLauncherCatalog`）。
   * Everything 的命中本身不带目标路径，靠这张表补齐后才能和启动台图标、
   * 程序本体互相认亲。表里没有的条目退化成只按自身路径去重。
   */
  shortcutTargets?: ReadonlyMap<string, string>
}

const identitiesFor = (
  item: BestMatchItem,
  shortcutTargets: ReadonlyMap<string, string> | undefined
): string[] => {
  if (item.kind === 'shortcut') {
    return collectLauncherIdentities({
      path: item.icon.path,
      name: item.icon.name,
      targetPath: item.icon.target_path,
    })
  }
  return collectLauncherIdentities({
    path: item.hit.path,
    name: item.hit.name,
    targetPath: shortcutTargets?.get(normalizeLauncherPath(item.hit.path)),
  })
}

/**
 * 两类候选按同一分数混排。同分时启动台图标靠前（`CURATED_SHORTCUT_BONUS`），
 * 完全同分则按各自来源的原始顺序，保证结果稳定。
 */
export function collectBestMatches({
  icons,
  fileHits,
  catalogHits,
  keyword,
  limit,
  usage,
  priorityRules = DEFAULT_SEARCH_PRIORITY_RULES,
  shortcutTargets,
}: CollectBestMatchesOptions): BestMatchItem[] {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  if (!normalizedKeyword || limit <= 0) return []

  const scored: ScoredBestMatch[] = []
  icons.forEach((icon, index) => {
    const result = scoreShortcut(icon, normalizedKeyword, index, usage)
    if (result) scored.push(result)
  })
  // order 决定完全同分时谁靠前：启动台图标 → Everything 命中（带运行次数）→ 目录表。
  fileHits.forEach((hit, index) => {
    const result = scoreFileHit(hit, normalizedKeyword, icons.length + index, priorityRules, false)
    if (result) scored.push(result)
  })
  const catalogOffset = icons.length + fileHits.length
  catalogHits?.forEach((hit, index) => {
    const result = scoreFileHit(hit, normalizedKeyword, catalogOffset + index, priorityRules, true)
    if (result) scored.push(result)
  })

  const claimed = new Set<string>()
  return scored
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .filter(entry => {
      // 同一个程序可能同时以本体、启动台图标、开始菜单/桌面快捷方式的身份出现，
      // 只保留分数最高的那一条（判定规则见 launcherIdentity.ts）。
      const identities = identitiesFor(entry.item, shortcutTargets)
      if (identities.some(identity => claimed.has(identity))) return false
      identities.forEach(identity => claimed.add(identity))
      return true
    })
    .slice(0, limit)
    .map(entry => entry.item)
}
