import type { Dispatch, SetStateAction } from 'react'
import type { SearchSource } from '@/lib/search/scope'
import type { SearchHit } from '@/lib/search/types'
import type { DesktopIcon } from '@/types'

export interface SearchNavigationOptions {
  key: string
  preventDefault: () => void
  source: SearchSource
  hasKeyword: boolean
  panelVisible: boolean
  openPanel: () => void
  closePanel: () => void
  closeLaunchpad: () => void
  clearSearch: () => void
  iconResults: DesktopIcon[]
  selectedIconIndex: number
  setSelectedIconIndex: Dispatch<SetStateAction<number>>
  activateIcon: (icon: DesktopIcon) => void
  combinedSelectedIndex: number
  fileCount: number
  selectCombinedIndex: (index: number) => void
  selectedFileIndex: number
  moveFileSelection: (delta: number) => void
  getFileAt: (index: number) => SearchHit | null
  requestFileRange: (startIndex: number, endIndex: number) => void
  activateFile: (path: string) => void
  liveOnType: boolean
  keywordCommitted: boolean
  submitSearch: () => void
  openOnEnter: boolean
}

function openResultsIfNeeded(options: SearchNavigationOptions) {
  if (!options.panelVisible && options.hasKeyword) options.openPanel()
}

function handleUnifiedNavigation(options: SearchNavigationOptions): boolean {
  const { key, preventDefault, iconResults, fileCount } = options
  const resultCount = iconResults.length + fileCount

  if (key === 'ArrowDown' || key === 'ArrowUp') {
    preventDefault()
    openResultsIfNeeded(options)
    if (resultCount === 0) return true

    const delta = key === 'ArrowDown' ? 1 : -1
    const nextIndex =
      options.combinedSelectedIndex < 0
        ? delta > 0
          ? 0
          : resultCount - 1
        : (options.combinedSelectedIndex + delta + resultCount) % resultCount
    options.selectCombinedIndex(nextIndex)
    return true
  }

  if (key === 'Enter') {
    preventDefault()
    openResultsIfNeeded(options)
    if (!options.liveOnType && !options.keywordCommitted) {
      options.submitSearch()
      return true
    }

    const activeIndex = options.combinedSelectedIndex
    if (activeIndex < 0) return true
    if (activeIndex < iconResults.length) {
      const icon = iconResults[activeIndex]
      if (icon) options.activateIcon(icon)
      return true
    }

    if (!options.openOnEnter) return true
    const fileIndex = activeIndex - iconResults.length
    const item = options.getFileAt(fileIndex)
    if (item) options.activateFile(item.path)
    else if (fileIndex >= 0) options.requestFileRange(fileIndex, fileIndex)
    return true
  }

  return false
}

function handleShortcutNavigation(options: SearchNavigationOptions): boolean {
  const { key, preventDefault, iconResults } = options
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    preventDefault()
    if (iconResults.length === 0) return true
    const delta = key === 'ArrowDown' ? 1 : -1
    options.setSelectedIconIndex(current => {
      const safeCurrent = current < 0 ? 0 : current
      return (safeCurrent + delta + iconResults.length) % iconResults.length
    })
    return true
  }

  if (key === 'Enter') {
    preventDefault()
    const icon = iconResults[options.selectedIconIndex] ?? iconResults[0]
    if (icon) options.activateIcon(icon)
    return true
  }

  return false
}

function handleFileNavigation(options: SearchNavigationOptions): boolean {
  const { key, preventDefault } = options
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    preventDefault()
    openResultsIfNeeded(options)
    options.moveFileSelection(key === 'ArrowDown' ? 1 : -1)
    return true
  }

  if (key === 'Enter') {
    preventDefault()
    openResultsIfNeeded(options)
    if (!options.liveOnType) {
      if (!options.keywordCommitted) {
        options.submitSearch()
        return true
      }
      options.submitSearch()
    }
    if (!options.openOnEnter) return true

    const item = options.getFileAt(options.selectedFileIndex)
    if (item) options.activateFile(item.path)
    else if (options.selectedFileIndex >= 0) {
      options.requestFileRange(options.selectedFileIndex, options.selectedFileIndex)
    }
    return true
  }

  return false
}

function handleEscape(options: SearchNavigationOptions) {
  options.preventDefault()
  if (options.source === 'everything' && options.panelVisible && !options.hasKeyword) {
    options.closeLaunchpad()
    return
  }
  if (options.source !== 'everything' && options.hasKeyword) {
    options.clearSearch()
    return
  }
  if (options.panelVisible) {
    options.closePanel()
    return
  }
  if (options.hasKeyword) {
    options.clearSearch()
    return
  }
  options.closeLaunchpad()
}

export function handleSearchNavigation(options: SearchNavigationOptions) {
  const handled =
    options.source === 'all'
      ? handleUnifiedNavigation(options)
      : options.source === 'icons'
        ? handleShortcutNavigation(options)
        : handleFileNavigation(options)

  if (!handled && options.key === 'Escape') handleEscape(options)
}
