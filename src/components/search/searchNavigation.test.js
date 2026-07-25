import { handleSearchNavigation } from './searchNavigation.ts'

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

const down = createOptions()
handleSearchNavigation(down.options)
assertEqual(down.calls, ['prevent', 'select:1'], 'down should move from shortcut to first file')

const up = createOptions({ key: 'ArrowUp', combinedSelectedIndex: 0 })
handleSearchNavigation(up.options)
assertEqual(up.calls, ['prevent', 'select:2'], 'up should wrap from shortcut to last file')

const openFile = createOptions({ key: 'Enter', combinedSelectedIndex: 2 })
handleSearchNavigation(openFile.options)
assertEqual(
  openFile.calls,
  ['prevent', 'file:file-1'],
  'enter should map combined index to file index'
)

console.log('统一搜索键盘导航测试通过')
