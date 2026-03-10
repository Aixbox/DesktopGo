import type { SearchSort } from './types'

export interface SearchSortOption {
  value: SearchSort
  label: string
  group: 'common' | 'metadata' | 'history'
}

export const SEARCH_SORT_OPTIONS: SearchSortOption[] = [
  { value: 'name_asc', label: '名称 升序', group: 'common' },
  { value: 'name_desc', label: '名称 降序', group: 'common' },
  { value: 'path_asc', label: '路径 升序', group: 'common' },
  { value: 'path_desc', label: '路径 降序', group: 'common' },
  { value: 'size_asc', label: '大小 升序', group: 'metadata' },
  { value: 'size_desc', label: '大小 降序', group: 'metadata' },
  { value: 'extension_asc', label: '扩展名 升序', group: 'metadata' },
  { value: 'extension_desc', label: '扩展名 降序', group: 'metadata' },
  { value: 'type_name_asc', label: '类型 升序', group: 'metadata' },
  { value: 'type_name_desc', label: '类型 降序', group: 'metadata' },
  { value: 'date_created_asc', label: '创建时间 升序', group: 'metadata' },
  { value: 'date_created_desc', label: '创建时间 降序', group: 'metadata' },
  { value: 'date_modified_asc', label: '修改时间 升序', group: 'common' },
  { value: 'date_modified_desc', label: '修改时间 降序', group: 'common' },
  { value: 'attributes_asc', label: '属性 升序', group: 'metadata' },
  { value: 'attributes_desc', label: '属性 降序', group: 'metadata' },
  { value: 'file_list_filename_asc', label: '列表文件名 升序', group: 'metadata' },
  { value: 'file_list_filename_desc', label: '列表文件名 降序', group: 'metadata' },
  { value: 'run_count_asc', label: '运行次数 升序', group: 'history' },
  { value: 'run_count_desc', label: '运行次数 降序', group: 'history' },
  { value: 'date_recently_changed_asc', label: '最近变更时间 升序', group: 'history' },
  { value: 'date_recently_changed_desc', label: '最近变更时间 降序', group: 'history' },
  { value: 'date_accessed_asc', label: '访问时间 升序', group: 'history' },
  { value: 'date_accessed_desc', label: '访问时间 降序', group: 'history' },
  { value: 'date_run_asc', label: '运行时间 升序', group: 'history' },
  { value: 'date_run_desc', label: '运行时间 降序', group: 'history' },
]

export const getSearchSortLabel = (sort: SearchSort) =>
  SEARCH_SORT_OPTIONS.find(option => option.value === sort)?.label ?? sort
