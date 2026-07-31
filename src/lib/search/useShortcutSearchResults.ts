import { useMemo } from 'react'
import type { DesktopIcon } from '@/types'
import { collectBestMatches, type BestMatchItem } from './bestMatch'
import { searchSourceIncludesIcons, type SearchSource } from './scope'
import { searchDesktopIcons } from './iconSearch'
import type { SearchHit } from './types'
import { useLauncherCatalog } from './useLauncherCatalog'
import { useShortcutUsage } from './useShortcutUsage'

const ICON_SEARCH_LIMIT = 48
const UNIFIED_BEST_MATCH_LIMIT = 6

const toShortcutItem = (icon: DesktopIcon): BestMatchItem => ({
  kind: 'shortcut',
  key: `shortcut:${icon.id}`,
  name: icon.name,
  detail: icon.target_path || icon.path,
  icon,
})

/**
 * 「快捷入口」标签页只展示启动台图标；「全部」模式的「最佳匹配」还会混入两类文件候选：
 *
 * 1. Everything 命中里判定为高优先级的（带运行次数）
 * 2. 高优先级目录的完整条目表（`useLauncherCatalog`），绕开 Everything 的字面子串
 *    限制，所以 `vscode` 能命中 `Visual Studio Code`
 *
 * 两类都按同一套分数与启动台图标混排，去重时保留分数更高的那条：同一条路径、
 * 以及「程序本体 + 指向它的同名快捷方式」都只留一条（见 launcherIdentity.ts）。
 */
export function useShortcutSearchResults(
  icons: DesktopIcon[],
  keyword: string,
  source: SearchSource,
  fileHits: SearchHit[] = [],
  panelOpen = false
) {
  const { state: usage, recordLaunch } = useShortcutUsage()
  const isUnified = source === 'all'
  const { hits: catalogHits, shortcutTargets } = useLauncherCatalog(panelOpen && isUnified)

  const results = useMemo<BestMatchItem[]>(() => {
    if (!searchSourceIncludesIcons(source)) return []
    if (isUnified) {
      return collectBestMatches({
        icons,
        // Everything 的命中排在前面，完全同分时优先保留带运行次数的那条。
        fileHits: [...fileHits, ...catalogHits],
        keyword,
        limit: UNIFIED_BEST_MATCH_LIMIT,
        usage,
        shortcutTargets,
      })
    }
    return searchDesktopIcons(icons, keyword, ICON_SEARCH_LIMIT, usage).map(toShortcutItem)
  }, [catalogHits, fileHits, icons, isUnified, keyword, shortcutTargets, source, usage])

  return { results, recordLaunch }
}
