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

assert(searchDesktopIcons(icons, '', 3).length === 0, 'empty keywords should return no results')
assert(searchDesktopIcons(icons, 'settings', 1).length === 1, 'limit should cap shortcut results')

console.log('快捷入口搜索排序测试通过')
