export type SearchSort =
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
}

export interface SearchPage {
  items: SearchHit[]
  offset: number
  limit: number
  totalResults: number
  hasMore: boolean
  provider: SearchProvider
  tookMs: number
}

export type SearchRuntimeState = 'unknown' | 'installed_ready' | 'not_installed' | 'unavailable'

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
