export type SearchSource = 'all' | 'icons' | 'everything'

export const searchSourceIncludesFiles = (source: SearchSource): boolean => source !== 'icons'

export const searchSourceIncludesIcons = (source: SearchSource): boolean => source !== 'everything'
