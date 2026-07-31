import type { DesktopIcon } from '@/types'
import { scoreBestFuzzyMatch } from './fuzzyScore'
import { compareShortcutUsage, type ShortcutUsageState } from './shortcutUsage'

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

const compact = (value: string): string => normalize(value).replace(/[\s._\-/\\:()[\]{}]+/g, '')

/** 名称与路径都没有直接命中，只可能靠 fzf 式子序列打分被捞回来。 */
const UNMATCHED_RANK = 4

/** 目标路径和快捷方式自身路径的相关性弱于名称，按权重下调。 */
const FUZZY_TARGET_PATH_WEIGHT = 0.45
const FUZZY_PATH_WEIGHT = 0.3

const getDeterministicRank = (icon: DesktopIcon, keyword: string): number => {
  const name = normalize(icon.name)
  const path = normalize(icon.path)
  const targetPath = normalize(icon.target_path)
  const compactKeyword = compact(keyword)
  const compactName = compact(name)
  const compactPath = compact(path)
  const compactTargetPath = compact(targetPath)
  const hasCompactKeyword = compactKeyword.length > 0

  if (name === keyword || (hasCompactKeyword && compactName === compactKeyword)) return 0
  if (name.startsWith(keyword) || (hasCompactKeyword && compactName.startsWith(compactKeyword))) {
    return 1
  }
  if (name.includes(keyword) || (hasCompactKeyword && compactName.includes(compactKeyword))) {
    return 2
  }
  if (
    path.includes(keyword) ||
    targetPath.includes(keyword) ||
    (hasCompactKeyword &&
      (compactPath.includes(compactKeyword) || compactTargetPath.includes(compactKeyword)))
  ) {
    return 3
  }
  return UNMATCHED_RANK
}

/**
 * 排序依次是：确定性匹配档 → 匹配质量 → 使用频率 → 原始顺序。
 *
 * 匹配质量放在使用频率之前，是因为 `UNMATCHED_RANK` 这一档里子序列打分就是唯一的
 * 相关性信号 —— 否则一个恰好能子序列命中的常用项会压过真正的词首缩写命中。
 * 同档内名称相同前缀的候选打分通常相等，使用频率仍然是实际的决定因素。
 */
export function searchDesktopIcons(
  icons: DesktopIcon[],
  keyword: string,
  limit: number,
  usage?: ShortcutUsageState
): DesktopIcon[] {
  const normalizedKeyword = normalize(keyword)
  if (!normalizedKeyword || limit <= 0) return []

  return icons
    .map((icon, originalIndex) => {
      const fuzzy = scoreBestFuzzyMatch(normalizedKeyword, [
        { text: icon.name },
        { text: icon.target_path ?? '', weight: FUZZY_TARGET_PATH_WEIGHT },
        { text: icon.path ?? '', weight: FUZZY_PATH_WEIGHT },
      ])
      return {
        icon,
        rank: getDeterministicRank(icon, normalizedKeyword),
        fuzzyScore: fuzzy.matched ? fuzzy.score : 0,
        originalIndex,
      }
    })
    .filter(result => result.rank < UNMATCHED_RANK || result.fuzzyScore > 0)
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        right.fuzzyScore - left.fuzzyScore ||
        compareShortcutUsage(usage, left.icon.id, right.icon.id) ||
        left.originalIndex - right.originalIndex
    )
    .slice(0, limit)
    .map(result => result.icon)
}
