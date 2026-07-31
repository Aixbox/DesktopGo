import { useEffect, useState } from 'react'
import { getLauncherCatalog } from './api'
import { normalizeLauncherPath } from './launcherIdentity'
import type { LauncherCatalogEntry, SearchHit } from './types'

/**
 * 把目录条目补成 `SearchHit` 的形状，好让「最佳匹配」的合并打分不必区分来源。
 * 运行次数只有 Everything 才知道，目录表这边一律按 0 处理。
 */
const toSearchHit = (entry: LauncherCatalogEntry): SearchHit => ({
  path: entry.path,
  name: entry.name,
  parent: entry.parent,
  isFile: entry.isFile,
  isFolder: entry.isFolder,
  iconBase64: '',
  highlightedName: '',
  highlightedPath: '',
  runCount: 0,
})

export interface LauncherCatalogSnapshot {
  hits: SearchHit[]
  /**
   * 归一化路径 → `.lnk` 目标。最佳匹配用它把「程序本体」和「指向它的快捷方式」
   * 认成同一条；Everything 的命中自己不带目标路径，也从这里补齐。
   */
  shortcutTargets: ReadonlyMap<string, string>
}

const EMPTY_SNAPSHOT: LauncherCatalogSnapshot = {
  hits: [],
  shortcutTargets: new Map<string, string>(),
}

const toSnapshot = (entries: LauncherCatalogEntry[]): LauncherCatalogSnapshot => {
  const shortcutTargets = new Map<string, string>()
  entries.forEach(entry => {
    if (entry.targetPath) shortcutTargets.set(normalizeLauncherPath(entry.path), entry.targetPath)
  })
  return { hits: entries.map(toSearchHit), shortcutTargets }
}

/**
 * 高优先级目录的条目表，只在本次搜索面板会话内有效。
 *
 * `enabled` 变为 true（面板打开）时拉取，变为 false（面板关闭）时在清理函数里
 * 立即丢弃 —— 开始菜单和桌面随时可能增删，下一次进面板必须重新读，所以刻意不做
 * 跨会话缓存。返回值再按 `enabled` 兜一层，确保重新打开到新数据到达之间不会用到旧表。
 */
export function useLauncherCatalog(enabled: boolean): LauncherCatalogSnapshot {
  const [snapshot, setSnapshot] = useState<LauncherCatalogSnapshot>(EMPTY_SNAPSHOT)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    void getLauncherCatalog()
      .then(entries => {
        if (!cancelled) setSnapshot(toSnapshot(entries))
      })
      .catch(error => {
        console.error('读取高优先级目录条目失败：', error)
      })

    return () => {
      cancelled = true
      setSnapshot(EMPTY_SNAPSHOT)
    }
  }, [enabled])

  return enabled ? snapshot : EMPTY_SNAPSHOT
}
