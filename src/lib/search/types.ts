export type SearchSort = "name_asc" | "name_desc" | "path_asc" | "date_modified_desc";

export interface SearchQuery {
  keyword: string;
  offset?: number;
  limit?: number;
  matchPath?: boolean;
  matchCase?: boolean;
  regex?: boolean;
  wholeWord?: boolean;
  sort?: SearchSort;
}

export type SearchProvider = "portable";

export interface SearchHit {
  path: string;
  name: string;
  parent: string;
  isFile: boolean;
  isFolder: boolean;
  iconBase64: string;
}

export interface SearchPage {
  items: SearchHit[];
  offset: number;
  limit: number;
  hasMore: boolean;
  provider: SearchProvider;
  tookMs: number;
}

export type SearchRuntimeState =
  | "unknown"
  | "portable_ready"
  | "unavailable";

export interface SearchRuntimeStatus {
  state: SearchRuntimeState;
  provider: SearchProvider | null;
  message: string | null;
}
