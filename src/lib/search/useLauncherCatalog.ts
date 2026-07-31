import { useEffect, useState } from 'react'
import { getLauncherCatalog } from './api'
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

const NO_HITS: SearchHit[] = []

/**
 * 高优先级目录的条目表，只在本次搜索面板会话内有效。
 *
 * `enabled` 变为 true（面板打开）时拉取，变为 false（面板关闭）时在清理函数里
 * 立即丢弃 —— 开始菜单和桌面随时可能增删，下一次进面板必须重新读，所以刻意不做
 * 跨会话缓存。返回值再按 `enabled` 兜一层，确保重新打开到新数据到达之间不会用到旧表。
 */
export function useLauncherCatalog(enabled: boolean): SearchHit[] {
  const [hits, setHits] = useState<SearchHit[]>(NO_HITS)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    void getLauncherCatalog()
      .then(entries => {
        if (!cancelled) setHits(entries.map(toSearchHit))
      })
      .catch(error => {
        console.error('读取高优先级目录条目失败：', error)
      })

    return () => {
      cancelled = true
      setHits(NO_HITS)
    }
  }, [enabled])

  return enabled ? hits : NO_HITS
}
