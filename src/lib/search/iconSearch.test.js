import { searchDesktopIcons } from './iconSearch.ts'

const icons = [
  {
    id: '1',
    name: 'Settings',
    path: 'C:/settings.lnk',
    target_path: 'C:/Windows/System32/settings.exe',
  },
  { id: '2', name: 'Search', path: 'C:/search.lnk', target_path: 'C:/Tools/Search.exe' },
  { id: '3', name: 'Settings Backup', path: 'C:/backup.lnk', target_path: 'C:/Tools/backup.exe' },
]

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const exact = searchDesktopIcons(icons, 'settings', 3)
assert(exact[0].name === 'Settings', 'exact name should be ranked first')
assert(
  exact[1].name === 'Settings Backup',
  'name prefix should rank before unrelated fuzzy matches'
)

const fuzzy = searchDesktopIcons(icons, 'srch', 3)
assert(fuzzy[0].name === 'Search', 'fuzzy name matching should find the closest shortcut')

const vscodeResults = searchDesktopIcons(
  [
    {
      id: '4',
      name: 'codexRegister',
      path: 'C:/Users/aixbox/Desktop/codexRegister.zip',
      target_path: '',
    },
    {
      id: '5',
      name: 'Visual Studio Code',
      path: 'C:/Users/aixbox/Desktop/Visual Studio Code.lnk',
      target_path: 'D:/programx/Microsoft VS Code/Code.exe',
    },
  ],
  'vscode',
  3
)
assert(
  vscodeResults[0]?.name === 'Visual Studio Code',
  'separator-insensitive path matching should rank VS Code first'
)
assert(
  !vscodeResults.some(icon => icon.name === 'codexRegister'),
  'weak fuzzy matches should not be shown as best shortcuts'
)

const usageRanked = searchDesktopIcons(
  [
    { id: 'code-editor', name: 'Code Editor', path: '', target_path: '' },
    { id: 'code-browser', name: 'Code Browser', path: '', target_path: '' },
  ],
  'code',
  2,
  {
    version: 1,
    enabled: true,
    entries: {
      'code-browser': { launchCount: 4, lastLaunchedAt: 200 },
      'code-editor': { launchCount: 1, lastLaunchedAt: 100 },
    },
  }
)
assert(
  usageRanked[0]?.id === 'code-browser',
  'frequently launched shortcuts should rank first within the same relevance level'
)

const relevanceRanked = searchDesktopIcons(
  [
    { id: 'code-exact', name: 'Code', path: '', target_path: '' },
    { id: 'code-frequent', name: 'Code Editor', path: '', target_path: '' },
  ],
  'code',
  2,
  {
    version: 1,
    enabled: true,
    entries: { 'code-frequent': { launchCount: 100, lastLaunchedAt: 300 } },
  }
)
assert(
  relevanceRanked[0]?.id === 'code-exact',
  'usage should not outrank a more relevant shortcut'
)

assert(searchDesktopIcons(icons, '', 3).length === 0, 'empty keywords should return no results')
assert(searchDesktopIcons(icons, 'settings', 1).length === 1, 'limit should cap shortcut results')

console.log('快捷入口搜索排序测试通过')
