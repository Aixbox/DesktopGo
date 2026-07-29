import {
  getUnifiedSelectedShortcutIndex,
  handleSearchNavigation,
  shouldUseShortcutHorizontalNavigation,
} from './searchNavigation.ts'

const assertEqual = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\n期望：${JSON.stringify(expected)}\n实际：${JSON.stringify(actual)}`
    )
  }
}

const createOptions = overrides => {
  const calls = []
  return {
    calls,
    options: {
      key: 'ArrowDown',
      preventDefault: () => calls.push('prevent'),
      source: 'all',
      hasKeyword: true,
      panelVisible: true,
      openPanel: () => calls.push('open-panel'),
      closePanel: () => calls.push('close-panel'),
      closeLaunchpad: () => calls.push('close-launchpad'),
      clearSearch: () => calls.push('clear'),
      iconResults: [{ id: 'shortcut' }],
      selectedIconIndex: 0,
      setSelectedIconIndex: () => {},
      activateIcon: icon => calls.push(`icon:${icon.id}`),
      combinedSelectedIndex: 0,
      fileCount: 2,
      selectCombinedIndex: index => calls.push(`select:${index}`),
      allowHorizontalShortcutNavigation: true,
      selectedFileIndex: 0,
      moveFileSelection: delta => calls.push(`move:${delta}`),
      getFileAt: index => ({ path: `file-${index}` }),
      requestFileRange: () => {},
      activateFile: path => calls.push(`file:${path}`),
      liveOnType: true,
      keywordCommitted: true,
      submitSearch: () => calls.push('submit'),
      openOnEnter: true,
      ...overrides,
    },
  }
}

assertEqual(
  getUnifiedSelectedShortcutIndex(3, 6),
  3,
  'a unified shortcut selection should remain visible in the shortcut area'
)
assertEqual(
  getUnifiedSelectedShortcutIndex(6, 6),
  -1,
  'a unified file selection should clear the shortcut visual selection'
)

const createInputNavigationOptions = overrides => ({
  key: 'ArrowRight',
  selectionStart: 6,
  selectionEnd: 6,
  inputLength: 6,
  hasExplicitResultSelection: false,
  hasVisibleShortcutSelection: true,
  ...overrides,
})

assertEqual(
  shouldUseShortcutHorizontalNavigation(createInputNavigationOptions()),
  true,
  'right at the input end should enter the initially visible shortcut selection'
)
assertEqual(
  shouldUseShortcutHorizontalNavigation(
    createInputNavigationOptions({ selectionStart: 3, selectionEnd: 3 })
  ),
  false,
  'right inside the query should keep editing the input'
)
assertEqual(
  shouldUseShortcutHorizontalNavigation(createInputNavigationOptions({ key: 'ArrowLeft' })),
  false,
  'left should keep editing before result navigation is explicitly entered'
)
assertEqual(
  shouldUseShortcutHorizontalNavigation(
    createInputNavigationOptions({ key: 'ArrowLeft', hasExplicitResultSelection: true })
  ),
  true,
  'left should navigate the shortcut grid after result navigation is entered'
)

const down = createOptions()
handleSearchNavigation(down.options)
assertEqual(down.calls, ['prevent', 'select:1'], 'down should move from shortcut to first file')

const up = createOptions({ key: 'ArrowUp', combinedSelectedIndex: 0 })
handleSearchNavigation(up.options)
assertEqual(up.calls, ['prevent', 'select:0'], 'up should stop at the top unified result')

const openFile = createOptions({ key: 'Enter', combinedSelectedIndex: 2 })
handleSearchNavigation(openFile.options)
assertEqual(
  openFile.calls,
  ['prevent', 'file:file-1'],
  'enter should map combined index to file index'
)

const shortcuts = Array.from({ length: 6 }, (_, index) => ({ id: `shortcut-${index}` }))

const downShortcutColumn = createOptions({ iconResults: shortcuts, combinedSelectedIndex: 0 })
handleSearchNavigation(downShortcutColumn.options)
assertEqual(
  downShortcutColumn.calls,
  ['prevent', 'select:2'],
  'down should keep the shortcut grid column'
)

const rightShortcut = createOptions({
  key: 'ArrowRight',
  iconResults: shortcuts,
  combinedSelectedIndex: 2,
})
handleSearchNavigation(rightShortcut.options)
assertEqual(rightShortcut.calls, ['prevent', 'select:3'], 'right should select the next grid cell')

const leftShortcut = createOptions({
  key: 'ArrowLeft',
  iconResults: shortcuts,
  combinedSelectedIndex: 3,
})
handleSearchNavigation(leftShortcut.options)
assertEqual(
  leftShortcut.calls,
  ['prevent', 'select:2'],
  'left should select the previous grid cell'
)

const downToFiles = createOptions({ iconResults: shortcuts, combinedSelectedIndex: 5 })
handleSearchNavigation(downToFiles.options)
assertEqual(
  downToFiles.calls,
  ['prevent', 'select:6'],
  'down from the last shortcut row should enter the file list'
)

const upToShortcuts = createOptions({
  key: 'ArrowUp',
  iconResults: shortcuts,
  combinedSelectedIndex: 6,
})
handleSearchNavigation(upToShortcuts.options)
assertEqual(
  upToShortcuts.calls,
  ['prevent', 'select:5'],
  'up from the first file should return to the last shortcut'
)

const downAtLastFile = createOptions({
  iconResults: shortcuts,
  combinedSelectedIndex: 7,
})
handleSearchNavigation(downAtLastFile.options)
assertEqual(
  downAtLastFile.calls,
  ['prevent', 'select:7'],
  'down should stop at the last file instead of wrapping within the file list'
)

const preserveInputCaret = createOptions({
  key: 'ArrowRight',
  iconResults: shortcuts,
  allowHorizontalShortcutNavigation: false,
})
handleSearchNavigation(preserveInputCaret.options)
assertEqual(
  preserveInputCaret.calls,
  [],
  'horizontal arrows should remain available to edit the search input before result navigation'
)

const preserveFileHorizontalKey = createOptions({
  key: 'ArrowLeft',
  iconResults: shortcuts,
  combinedSelectedIndex: 6,
})
handleSearchNavigation(preserveFileHorizontalKey.options)
assertEqual(
  preserveFileHorizontalKey.calls,
  [],
  'horizontal arrows should not be intercepted while a file result is selected'
)

const openShortcut = createOptions({
  key: 'Enter',
  iconResults: shortcuts,
  combinedSelectedIndex: 3,
})
handleSearchNavigation(openShortcut.options)
assertEqual(
  openShortcut.calls,
  ['prevent', 'icon:shortcut-3'],
  'enter should open the selected shortcut'
)

console.log('统一搜索键盘导航测试通过')
