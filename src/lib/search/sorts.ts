import type { SearchSort } from './types'

export interface SearchSortOption {
  value: SearchSort
  label: string
  group: 'common' | 'metadata' | 'history'
}

export const SEARCH_SORT_OPTIONS: SearchSortOption[] = [
  { value: 'name_asc', label: 'Name ASC', group: 'common' },
  { value: 'name_desc', label: 'Name DESC', group: 'common' },
  { value: 'path_asc', label: 'Path ASC', group: 'common' },
  { value: 'path_desc', label: 'Path DESC', group: 'common' },
  { value: 'size_asc', label: 'Size ASC', group: 'metadata' },
  { value: 'size_desc', label: 'Size DESC', group: 'metadata' },
  { value: 'extension_asc', label: 'Extension ASC', group: 'metadata' },
  { value: 'extension_desc', label: 'Extension DESC', group: 'metadata' },
  { value: 'type_name_asc', label: 'Type ASC', group: 'metadata' },
  { value: 'type_name_desc', label: 'Type DESC', group: 'metadata' },
  { value: 'date_created_asc', label: 'Created ASC', group: 'metadata' },
  { value: 'date_created_desc', label: 'Created DESC', group: 'metadata' },
  { value: 'date_modified_asc', label: 'Modified ASC', group: 'common' },
  { value: 'date_modified_desc', label: 'Modified DESC', group: 'common' },
  { value: 'attributes_asc', label: 'Attributes ASC', group: 'metadata' },
  { value: 'attributes_desc', label: 'Attributes DESC', group: 'metadata' },
  { value: 'file_list_filename_asc', label: 'List Filename ASC', group: 'metadata' },
  { value: 'file_list_filename_desc', label: 'List Filename DESC', group: 'metadata' },
  { value: 'run_count_asc', label: 'Run Count ASC', group: 'history' },
  { value: 'run_count_desc', label: 'Run Count DESC', group: 'history' },
  { value: 'date_recently_changed_asc', label: 'Recently Changed ASC', group: 'history' },
  { value: 'date_recently_changed_desc', label: 'Recently Changed DESC', group: 'history' },
  { value: 'date_accessed_asc', label: 'Accessed ASC', group: 'history' },
  { value: 'date_accessed_desc', label: 'Accessed DESC', group: 'history' },
  { value: 'date_run_asc', label: 'Date Run ASC', group: 'history' },
  { value: 'date_run_desc', label: 'Date Run DESC', group: 'history' },
]

export const getSearchSortLabel = (sort: SearchSort) =>
  SEARCH_SORT_OPTIONS.find(option => option.value === sort)?.label ?? sort
