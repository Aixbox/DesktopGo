import type { IconManagerItem, IconManagerViewMode } from '../types/index.ts'

export type IconVisibilityFilter = 'all' | 'visible' | 'hidden'
export interface IconManagerFilters {
  visibilityFilter: IconVisibilityFilter
  searchKeyword: string
}

export const isIconManagerViewMode = (value: unknown): value is IconManagerViewMode =>
  value === 'list' || value === 'grid'

export const normalizeIconManagerViewMode = (
  value: unknown,
  fallback: IconManagerViewMode = 'list'
): IconManagerViewMode => (isIconManagerViewMode(value) ? value : fallback)

export const getPathLeaf = (value: string): string => {
  const normalizedValue = value.trim().replace(/\\/g, '/')
  if (!normalizedValue) return ''

  const segments = normalizedValue.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? normalizedValue
}

export const deriveIconEntryName = (path: string): string => {
  const leaf = getPathLeaf(path)
  if (!leaf) return ''
  return leaf.replace(/\.[^./\\]+$/, '') || leaf
}

export function filterIconManagerItems(
  icons: IconManagerItem[],
  filters: IconManagerFilters
): IconManagerItem[] {
  // 统一在纯函数里做筛选，避免列表视图和宫格视图分别维护条件后出现结果不一致。
  const normalizedKeyword = filters.searchKeyword.trim().toLowerCase()

  return icons.filter(icon => {
    if (filters.visibilityFilter === 'visible' && icon.hidden) return false
    if (filters.visibilityFilter === 'hidden' && !icon.hidden) return false
    if (!normalizedKeyword) return true

    const haystack = `${icon.name} ${icon.path} ${icon.target_path}`.toLowerCase()
    return haystack.includes(normalizedKeyword)
  })
}
