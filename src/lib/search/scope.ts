export type SearchSource = 'all' | 'icons' | 'everything'

export const searchSourceIncludesFiles = (source: SearchSource): boolean => source !== 'icons'

export const searchSourceIncludesIcons = (source: SearchSource): boolean => source !== 'everything'

export interface SearchScopeTransition {
  changed: boolean
  preserveKeyword: true
  preserveFilePreferences: true
  resetSelections: boolean
  resetPreview: boolean
}

export const getSearchScopeTransition = (
  currentSource: SearchSource,
  nextSource: SearchSource
): SearchScopeTransition => {
  const changed = currentSource !== nextSource

  return {
    changed,
    preserveKeyword: true,
    preserveFilePreferences: true,
    resetSelections: changed,
    resetPreview: changed,
  }
}
