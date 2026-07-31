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

// 词首缩写：目标路径里没有字面的 "VS Code"，只能靠 fzf 式子序列打分捞回来
const abbreviationOnly = searchDesktopIcons(
  [
    { id: 'notepad', name: 'Notepad++', path: 'C:/npp.lnk', target_path: 'C:/npp/notepad++.exe' },
    {
      id: 'vscode',
      name: 'Visual Studio Code',
      path: 'C:/Users/me/Desktop/Visual Studio Code.lnk',
      target_path: 'C:/Editors/CodeApp/editor.exe',
    },
  ],
  'vscode',
  3
)
assert(
  abbreviationOnly[0]?.name === 'Visual Studio Code',
  '词首缩写 vscode 应命中 Visual Studio Code，即使路径里没有字面 VS Code'
)
assert(
  !abbreviationOnly.some(icon => icon.id === 'notepad'),
  '不含关键词字符的快捷方式不应被子序列匹配捞进来'
)

const ideaResults = searchDesktopIcons(
  [{ id: 'idea', name: 'IntelliJ IDEA', path: '', target_path: '' }],
  'idea',
  3
)
assert(ideaResults[0]?.name === 'IntelliJ IDEA', 'idea 应命中 IntelliJ IDEA')

const everythingResults = searchDesktopIcons(
  [{ id: 'et', name: 'Everything', path: '', target_path: '' }],
  'et',
  3
)
assert(everythingResults[0]?.name === 'Everything', 'et 应子序列命中 Everything')

// 完全不含关键词字符的候选必须被排除，不能因为「子序列很宽松」就全部召回
const noise = searchDesktopIcons(
  [
    { id: 'zebra', name: 'Zebra Tool', path: '', target_path: '' },
    { id: 'gimp', name: 'GIMP', path: '', target_path: '' },
  ],
  'vscode',
  3
)
assert(noise.length === 0, '一个字符都对不上的快捷方式不应被召回')

assert(searchDesktopIcons(icons, '', 3).length === 0, 'empty keywords should return no results')
assert(searchDesktopIcons(icons, 'settings', 1).length === 1, 'limit should cap shortcut results')

console.log('快捷入口搜索排序测试通过')
