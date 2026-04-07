import type { SearchDefaultFilter } from './settings'
import { translate } from '@/lib/i18n'

export interface SearchFilterDefinition {
  value: SearchDefaultFilter
  label: string
  queryPrefix: string
}

export const SEARCH_FILTERS: SearchFilterDefinition[] = [
  { value: 'all', label: '全部', queryPrefix: '' },
  { value: 'files', label: '文件', queryPrefix: 'file:' },
  { value: 'folders', label: '文件夹', queryPrefix: 'folder:' },
  { value: 'audio', label: '音频', queryPrefix: 'audio:' },
  { value: 'compressed', label: '压缩包', queryPrefix: 'zip:' },
  { value: 'documents', label: '文档', queryPrefix: 'doc:' },
  { value: 'executables', label: '程序', queryPrefix: 'exe:' },
  { value: 'pictures', label: '图片', queryPrefix: 'pic:' },
  { value: 'videos', label: '视频', queryPrefix: 'video:' },
]

export const getSearchFilterLabel = (filter: SearchDefaultFilter) =>
  translate(SEARCH_FILTERS.find(entry => entry.value === filter)?.label ?? filter)

export const getSearchFilterOptions = () =>
  SEARCH_FILTERS.map(entry => ({
    ...entry,
    label: translate(entry.label),
  }))

export const buildSearchKeyword = (keyword: string, filter: SearchDefaultFilter) => {
  const trimmedKeyword = keyword.trim()
  const filterDefinition = SEARCH_FILTERS.find(entry => entry.value === filter)
  const queryPrefix = filterDefinition?.queryPrefix ?? ''

  return [queryPrefix, trimmedKeyword].filter(Boolean).join(' ').trim()
}
