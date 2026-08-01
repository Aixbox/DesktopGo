export type SearchSort =
  | 'relevance'
  | 'name_asc'
  | 'name_desc'
  | 'path_asc'
  | 'path_desc'
  | 'size_asc'
  | 'size_desc'
  | 'extension_asc'
  | 'extension_desc'
  | 'type_name_asc'
  | 'type_name_desc'
  | 'date_created_asc'
  | 'date_created_desc'
  | 'date_modified_asc'
  | 'date_modified_desc'
  | 'attributes_asc'
  | 'attributes_desc'
  | 'file_list_filename_asc'
  | 'file_list_filename_desc'
  | 'run_count_asc'
  | 'run_count_desc'
  | 'date_recently_changed_asc'
  | 'date_recently_changed_desc'
  | 'date_accessed_asc'
  | 'date_accessed_desc'
  | 'date_run_asc'
  | 'date_run_desc'

export interface SearchQuery {
  keyword: string
  offset?: number
  limit?: number
  matchPath?: boolean
  matchCase?: boolean
  regex?: boolean
  wholeWord?: boolean
  sort?: SearchSort
}

export type SearchProvider = 'installed'

export interface SearchHit {
  path: string
  name: string
  parent: string
  isFile: boolean
  isFolder: boolean
  iconBase64: string
  highlightedName: string
  highlightedPath: string
  /** Everything's own launch count for this path; 0 when unavailable. */
  runCount: number
}

export interface SearchPage {
  items: SearchHit[]
  offset: number
  limit: number
  totalResults: number
  hasMore: boolean
  provider: SearchProvider
  runtimeState: SearchRuntimeState
  tookMs: number
}

/**
 * 目录清单（`search.bestMatchFolders`）里某个目录下的一条条目。
 * 由 Rust 侧直接枚举目录得到，不经过 Everything，所以不受字面子串匹配的限制。
 */
export interface LauncherCatalogEntry {
  path: string
  name: string
  parent: string
  isFile: boolean
  isFolder: boolean
  /** `.lnk` 解析出的目标路径；非快捷方式条目为空串。用于最佳匹配去重。 */
  targetPath: string
}

/** 一次枚举里某个目录的执行结果，设置页据此显示真实状态与条目数。 */
export interface LauncherCatalogRoot {
  /** 归一化后的路径，前端按它把结果对回清单里的那一行。 */
  key: string
  path: string
  /** 实际使用的层数，0 表示不限层数。 */
  maxDepth: number
  enabled: boolean
  exists: boolean
  /** 与清单里前面某条指向同一个位置，这种目录不会重复枚举。 */
  duplicate: boolean
  entryCount: number
}

export interface LauncherCatalogSnapshot {
  roots: LauncherCatalogRoot[]
  entries: LauncherCatalogEntry[]
  /** 撞到条目上限，清单被截断。 */
  truncated: boolean
}

/** 预设目录：首次写入目录清单、以及「恢复预设目录」时用的建议值。 */
export interface DefaultLauncherFolder {
  path: string
  maxDepth: number
}

/** One visible row asking for its icon. `isFolder` comes from the search result. */
export interface SearchIconRequest {
  path: string
  isFolder: boolean
}

export interface SearchResultIcon {
  path: string
  iconBase64: string
}

export type SearchRuntimeState =
  | 'unknown'
  | 'installed_ready'
  | 'initializing'
  | 'not_installed'
  | 'unavailable'

export interface SearchRuntimeStatus {
  state: SearchRuntimeState
  provider: SearchProvider | null
  message: string | null
}

export type SearchPreviewKind = 'info' | 'image' | 'text'

export interface SearchPreview {
  path: string
  name: string
  extension: string
  kind: SearchPreviewKind
  isDirectory: boolean
  size: number | null
  modifiedAt: number | null
  mimeType: string | null
  imageDataUrl: string | null
  textSnippet: string | null
  textTruncated: boolean
}
