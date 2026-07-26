import Fuse from 'fuse.js'
import type { DesktopIcon } from '@/types'

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

const compact = (value: string): string => normalize(value).replace(/[\s._\-/\\:()[\]{}]+/g, '')

const MAX_WEAK_FUZZY_SCORE = 0.35

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
  return 4
}

export function searchDesktopIcons(
  icons: DesktopIcon[],
  keyword: string,
  limit: number
): DesktopIcon[] {
  const normalizedKeyword = normalize(keyword)
  if (!normalizedKeyword || limit <= 0) return []

  const fuse = new Fuse(icons, {
    keys: [
      { name: 'name', weight: 0.68 },
      { name: 'target_path', weight: 0.2 },
      { name: 'path', weight: 0.12 },
    ],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.42,
  })

  const fuzzyScores = new Map(
    fuse.search(normalizedKeyword).map(result => [result.refIndex, result.score ?? 1] as const)
  )

  return icons
    .map((icon, originalIndex) => ({
      icon,
      rank: getDeterministicRank(icon, normalizedKeyword),
      fuseScore: fuzzyScores.get(originalIndex) ?? 1,
      originalIndex,
    }))
    .filter(result => result.rank < 4 || result.fuseScore <= MAX_WEAK_FUZZY_SCORE)
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.fuseScore - right.fuseScore ||
        left.originalIndex - right.originalIndex
    )
    .slice(0, limit)
    .map(result => result.icon)
}
