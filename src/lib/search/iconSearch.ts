import Fuse from 'fuse.js'
import type { DesktopIcon } from '@/types'

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

const getDeterministicRank = (icon: DesktopIcon, keyword: string): number => {
  const name = normalize(icon.name)
  const path = normalize(icon.path)
  const targetPath = normalize(icon.target_path)

  if (name === keyword) return 0
  if (name.startsWith(keyword)) return 1
  if (name.includes(keyword)) return 2
  if (path.includes(keyword) || targetPath.includes(keyword)) return 3
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

  return fuse
    .search(normalizedKeyword)
    .map((result, originalIndex) => ({
      icon: result.item,
      rank: getDeterministicRank(result.item, normalizedKeyword),
      fuseScore: result.score ?? 1,
      originalIndex,
    }))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.fuseScore - right.fuseScore ||
        left.originalIndex - right.originalIndex
    )
    .slice(0, limit)
    .map(result => result.icon)
}
