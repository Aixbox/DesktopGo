import { useEffect, useMemo, useRef, useState } from 'react'
import { getLauncherCatalog } from './api'
import { DEFAULT_BEST_MATCH_FOLDER_CONFIG, type BestMatchFolderConfig } from './bestMatchFolders'
import { normalizeLauncherPath } from './launcherIdentity'
import type { LauncherCatalogEntry, LauncherCatalogRoot, SearchHit } from './types'

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

export interface LauncherCatalogState {
  hits: SearchHit[]
  /**
   * 归一化路径 → `.lnk` 目标。最佳匹配用它把「程序本体」和「指向它的快捷方式」
   * 认成同一条；Everything 的命中自己不带目标路径，也从这里补齐。
   */
  shortcutTargets: ReadonlyMap<string, string>
  /** 这次枚举实际用到的根，设置页直接显示它。 */
  roots: LauncherCatalogRoot[]
  truncated: boolean
}

const EMPTY_STATE: LauncherCatalogState = {
  hits: [],
  shortcutTargets: new Map<string, string>(),
  roots: [],
  truncated: false,
}

const toState = (snapshot: {
  entries: LauncherCatalogEntry[]
  roots: LauncherCatalogRoot[]
  truncated: boolean
}): LauncherCatalogState => {
  const shortcutTargets = new Map<string, string>()
  snapshot.entries.forEach(entry => {
    if (entry.targetPath) shortcutTargets.set(normalizeLauncherPath(entry.path), entry.targetPath)
  })
  return {
    hits: snapshot.entries.map(toSearchHit),
    shortcutTargets,
    roots: snapshot.roots,
    truncated: snapshot.truncated,
  }
}

/**
 * 高优先级目录的条目表，只在本次搜索面板会话内有效。
 *
 * `enabled` 变为 true（面板打开）时拉取，变为 false（面板关闭）时在清理函数里
 * 立即丢弃 —— 开始菜单和桌面随时可能增删，下一次进面板必须重新读，所以刻意不做
 * 跨会话缓存。返回值再按 `enabled` 兜一层，确保重新打开到新数据到达之间不会用到旧表。
 *
 * `folders` 变化（用户在设置里加了目录、关了内置组）同样触发重新拉取：依赖用的是
 * 序列化后的配置，避免调用方每次渲染新建对象导致无限重拉。
 */
export function useLauncherCatalog(
  enabled: boolean,
  folders: BestMatchFolderConfig = DEFAULT_BEST_MATCH_FOLDER_CONFIG
): LauncherCatalogState {
  const [state, setState] = useState<LauncherCatalogState>(EMPTY_STATE)
  const configKey = useMemo(() => JSON.stringify(folders), [folders])
  // 依赖只认序列化后的配置（调用方每次渲染都可能新建对象），但请求要用最新的对象本身，
  // 所以留一个 ref，并且只在提交后更新它 —— 渲染期不写 ref。
  const foldersRef = useRef(folders)
  useEffect(() => {
    foldersRef.current = folders
  }, [folders])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    void getLauncherCatalog(foldersRef.current)
      .then(snapshot => {
        if (!cancelled) setState(toState(snapshot))
      })
      .catch(error => {
        console.error('读取高优先级目录条目失败：', error)
      })

    return () => {
      cancelled = true
      setState(EMPTY_STATE)
    }
  }, [configKey, enabled])

  return enabled ? state : EMPTY_STATE
}
