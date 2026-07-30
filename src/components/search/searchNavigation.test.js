import {
  getUnifiedSelectedShortcutIndex,
  handleSearchNavigation,
  resolveGridArrowIndex,
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
      shortcutColumnCount: 2,
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

const gridMove = overrides =>
  resolveGridArrowIndex({ key: 'ArrowRight', index: 0, itemCount: 12, columnCount: 5, ...overrides })

assertEqual(gridMove({ index: 6 }), 7, 'right should move to the next cell in the row')
assertEqual(gridMove({ index: 4 }), 4, 'right should stop at the end of a row')
assertEqual(gridMove({ key: 'ArrowLeft', index: 6 }), 5, 'left should move to the previous cell')
assertEqual(
  gridMove({ key: 'ArrowLeft', index: 5 }),
  5,
  'left should stop at the beginning of a row'
)
assertEqual(gridMove({ key: 'ArrowDown', index: 3 }), 8, 'down should move a full row')
assertEqual(
  gridMove({ key: 'ArrowDown', index: 8 }),
  null,
  'down should report leaving the grid past the last row'
)
assertEqual(gridMove({ key: 'ArrowUp', index: 7 }), 2, 'up should move a full row')
assertEqual(
  gridMove({ key: 'ArrowUp', index: 2 }),
  null,
  'up should report leaving the grid above the first row'
)
assertEqual(
  gridMove({ key: 'ArrowDown', index: 11 }),
  null,
  'down should report leaving the grid from a partial last row'
)
assertEqual(gridMove({ index: -1 }), 0, 'the first arrow press should select the first cell')
assertEqual(
  gridMove({ index: 0, itemCount: 0 }),
  null,
  'an empty grid should not resolve a selection'
)
assertEqual(
  gridMove({ key: 'ArrowDown', index: 3, columnCount: 0 }),
  4,
  'a not yet measured grid should fall back to single column moves'
)

const createShortcutSourceOptions = overrides => {
  const selections = []
  const created = createOptions({
    source: 'icons',
    iconResults: shortcuts,
    shortcutColumnCount: 4,
    selectedIconIndex: 1,
    setSelectedIconIndex: index => selections.push(index),
    ...overrides,
  })
  return { ...created, selections }
}

const shortcutRight = createShortcutSourceOptions({ key: 'ArrowRight' })
handleSearchNavigation(shortcutRight.options)
assertEqual(shortcutRight.calls, ['prevent'], 'right should be handled inside the shortcut grid')
assertEqual(shortcutRight.selections, [2], 'right should select the next shortcut in the row')

const shortcutLeft = createShortcutSourceOptions({ key: 'ArrowLeft', selectedIconIndex: 4 })
handleSearchNavigation(shortcutLeft.options)
assertEqual(shortcutLeft.selections, [4], 'left should stop at the first column of the row')

const shortcutDown = createShortcutSourceOptions({ key: 'ArrowDown' })
handleSearchNavigation(shortcutDown.options)
assertEqual(shortcutDown.selections, [5], 'down should move a full shortcut row')

const shortcutDownAtLastRow = createShortcutSourceOptions({
  key: 'ArrowDown',
  selectedIconIndex: 5,
})
handleSearchNavigation(shortcutDownAtLastRow.options)
assertEqual(shortcutDownAtLastRow.selections, [5], 'down should stay on the last shortcut row')

const shortcutUp = createShortcutSourceOptions({ key: 'ArrowUp', selectedIconIndex: 5 })
handleSearchNavigation(shortcutUp.options)
assertEqual(shortcutUp.selections, [1], 'up should move a full shortcut row')

const shortcutCaretEditing = createShortcutSourceOptions({
  key: 'ArrowLeft',
  allowHorizontalShortcutNavigation: false,
})
handleSearchNavigation(shortcutCaretEditing.options)
assertEqual(
  [shortcutCaretEditing.calls, shortcutCaretEditing.selections],
  [[], []],
  'horizontal arrows should keep editing the input before grid navigation is entered'
)

const shortcutEnter = createShortcutSourceOptions({ key: 'Enter', selectedIconIndex: 3 })
handleSearchNavigation(shortcutEnter.options)
assertEqual(
  shortcutEnter.calls,
  ['prevent', 'icon:shortcut-3'],
  'enter should open the selected shortcut in the shortcut source'
)

console.log('统一搜索键盘导航测试通过')
