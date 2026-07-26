import { useMemo } from 'react'
import type { DesktopIcon } from '@/types'
import { searchSourceIncludesIcons, type SearchSource } from './scope'
import { searchDesktopIcons } from './iconSearch'
import { useShortcutUsage } from './useShortcutUsage'

const ICON_SEARCH_LIMIT = 48
const UNIFIED_ICON_SEARCH_LIMIT = 6

export function useShortcutSearchResults(
  icons: DesktopIcon[],
  keyword: string,
  source: SearchSource
) {
  const { state: usage, recordLaunch } = useShortcutUsage()
  const results = useMemo(() => {
    if (!searchSourceIncludesIcons(source)) return []
    const limit = source === 'all' ? UNIFIED_ICON_SEARCH_LIMIT : ICON_SEARCH_LIMIT
    return searchDesktopIcons(icons, keyword, limit, usage)
  }, [icons, keyword, source, usage])

  return { results, recordLaunch }
}
