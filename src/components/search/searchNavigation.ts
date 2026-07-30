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
  allowHorizontalShortcutNavigation: boolean
  shortcutColumnCount: number
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

const UNIFIED_SHORTCUT_COLUMN_COUNT = 2

export type GridArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

export function isGridArrowKey(key: string): key is GridArrowKey {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'
}

/**
 * 在固定列数的网格内移动选中项。
 *
 * 水平方向在行首/行尾停住，垂直方向越出网格时返回 `null`，由调用方决定
 * 是继续停在原处还是移交给相邻的结果区域。
 */
export function resolveGridArrowIndex({
  key,
  index,
  itemCount,
  columnCount,
}: {
  key: GridArrowKey
  index: number
  itemCount: number
  columnCount: number
}): number | null {
  if (itemCount <= 0) return null
  if (index < 0 || index >= itemCount) return 0

  const columns = Math.max(1, columnCount)
  const column = index % columns

  if (key === 'ArrowLeft') return column === 0 ? index : index - 1
  if (key === 'ArrowRight') {
    const nextIndex = index + 1
    return column === columns - 1 || nextIndex >= itemCount ? index : nextIndex
  }
  if (key === 'ArrowDown') {
    const nextRowIndex = index + columns
    return nextRowIndex < itemCount ? nextRowIndex : null
  }

  const previousRowIndex = index - columns
  return previousRowIndex >= 0 ? previousRowIndex : null
}

export function getUnifiedSelectedShortcutIndex(selectedIndex: number, shortcutCount: number) {
  return selectedIndex >= 0 && selectedIndex < shortcutCount ? selectedIndex : -1
}

export function shouldUseShortcutHorizontalNavigation({
  key,
  selectionStart,
  selectionEnd,
  inputLength,
  hasExplicitResultSelection,
  hasVisibleShortcutSelection,
}: {
  key: string
  selectionStart: number | null
  selectionEnd: number | null
  inputLength: number
  hasExplicitResultSelection: boolean
  hasVisibleShortcutSelection: boolean
}) {
  if (!hasVisibleShortcutSelection || (key !== 'ArrowLeft' && key !== 'ArrowRight')) {
    return false
  }

  const caretAtEnd = selectionStart === inputLength && selectionEnd === inputLength
  return caretAtEnd && (hasExplicitResultSelection || key === 'ArrowRight')
}

function resolveUnifiedArrowIndex({
  key,
  selectedIndex,
  iconCount,
  fileCount,
}: {
  key: GridArrowKey
  selectedIndex: number
  iconCount: number
  fileCount: number
}) {
  const resultCount = iconCount + fileCount
  if (resultCount === 0) return null

  const currentIndex =
    selectedIndex >= 0 && selectedIndex < resultCount ? selectedIndex : key === 'ArrowUp' ? 0 : -1
  if (currentIndex < 0) return 0

  if (currentIndex >= iconCount) {
    if (key === 'ArrowLeft' || key === 'ArrowRight') return currentIndex
    if (key === 'ArrowUp') {
      if (currentIndex === iconCount && iconCount > 0) return iconCount - 1
      return Math.max(iconCount, currentIndex - 1)
    }
    return Math.min(resultCount - 1, currentIndex + 1)
  }

  const gridIndex = resolveGridArrowIndex({
    key,
    index: currentIndex,
    itemCount: iconCount,
    columnCount: UNIFIED_SHORTCUT_COLUMN_COUNT,
  })
  if (gridIndex !== null) return gridIndex
  if (key === 'ArrowDown') return fileCount > 0 ? iconCount : currentIndex
  return currentIndex
}

function openResultsIfNeeded(options: SearchNavigationOptions) {
  if (!options.panelVisible && options.hasKeyword) options.openPanel()
}

function handleUnifiedNavigation(options: SearchNavigationOptions): boolean {
  const { key, preventDefault, iconResults, fileCount } = options
  const verticalArrow = key === 'ArrowDown' || key === 'ArrowUp'
  const horizontalArrow = key === 'ArrowLeft' || key === 'ArrowRight'
  const shortcutSelected =
    getUnifiedSelectedShortcutIndex(options.combinedSelectedIndex, iconResults.length) >= 0
  if (
    verticalArrow ||
    (horizontalArrow && options.allowHorizontalShortcutNavigation && shortcutSelected)
  ) {
    preventDefault()
    openResultsIfNeeded(options)
    const nextIndex = resolveUnifiedArrowIndex({
      key,
      selectedIndex: options.combinedSelectedIndex,
      iconCount: iconResults.length,
      fileCount,
    })
    if (nextIndex !== null) options.selectCombinedIndex(nextIndex)
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
  if (isGridArrowKey(key)) {
    const horizontalArrow = key === 'ArrowLeft' || key === 'ArrowRight'
    if (horizontalArrow && !options.allowHorizontalShortcutNavigation) return false

    preventDefault()
    if (iconResults.length === 0) return true

    const nextIndex = resolveGridArrowIndex({
      key,
      index: options.selectedIconIndex,
      itemCount: iconResults.length,
      columnCount: options.shortcutColumnCount,
    })
    options.setSelectedIconIndex(nextIndex ?? Math.max(options.selectedIconIndex, 0))
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
