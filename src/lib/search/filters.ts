import type { SearchDefaultFilter } from './settings'

export interface SearchFilterDefinition {
  value: SearchDefaultFilter
  label: string
  queryPrefix: string
}

export const SEARCH_FILTERS: SearchFilterDefinition[] = [
  { value: 'all', label: 'All', queryPrefix: '' },
  { value: 'files', label: 'Files', queryPrefix: 'file:' },
  { value: 'folders', label: 'Folders', queryPrefix: 'folder:' },
  { value: 'audio', label: 'Audio', queryPrefix: 'audio:' },
  { value: 'compressed', label: 'Compressed', queryPrefix: 'zip:' },
  { value: 'documents', label: 'Documents', queryPrefix: 'doc:' },
  { value: 'executables', label: 'Executables', queryPrefix: 'exe:' },
  { value: 'pictures', label: 'Pictures', queryPrefix: 'pic:' },
  { value: 'videos', label: 'Videos', queryPrefix: 'video:' },
]

export const buildSearchKeyword = (keyword: string, filter: SearchDefaultFilter) => {
  const trimmedKeyword = keyword.trim()
  const filterDefinition = SEARCH_FILTERS.find(entry => entry.value === filter)
  const queryPrefix = filterDefinition?.queryPrefix ?? ''

  return [queryPrefix, trimmedKeyword].filter(Boolean).join(' ').trim()
}
