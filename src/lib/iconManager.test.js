import {
  filterIconManagerItems,
  deriveIconEntryName,
  getPathLeaf,
  isIconManagerViewMode,
  normalizeIconManagerViewMode,
} from './iconManager.ts'

const icons = [
  {
    id: 'desktop-visible',
    name: 'Visual Studio Code',
    path: 'C:/Users/he/Desktop/VS Code.lnk',
    target_path: 'C:/Program Files/Microsoft VS Code/Code.exe',
    icon_base64: '',
    item_type: 'shortcut',
    hidden: false,
  },
  {
    id: 'desktop-hidden',
    name: 'Recycle Bin',
    path: 'C:/Users/he/Desktop/Recycle Bin',
    target_path: '',
    icon_base64: '',
    item_type: 'special',
    hidden: true,
  },
  {
    id: 'customapp-visible',
    name: 'Obsidian',
    path: 'D:/Apps/Obsidian/Obsidian.lnk',
    target_path: 'D:/Apps/Obsidian/Obsidian.exe',
    icon_base64: '',
    item_type: 'shortcut',
    hidden: false,
  },
]

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertIds(actualIcons, expectedIds, message) {
  const actualIds = actualIcons.map(icon => icon.id)
  assert(
    JSON.stringify(actualIds) === JSON.stringify(expectedIds),
    `${message}\n期望：${JSON.stringify(expectedIds)}\n实际：${JSON.stringify(actualIds)}`
  )
}

assertIds(
  filterIconManagerItems(icons, {
    visibilityFilter: 'visible',
    searchKeyword: 'obsidian',
  }),
  ['customapp-visible'],
  '组合筛选结果不正确'
)

assertIds(
  filterIconManagerItems(icons, {
    visibilityFilter: 'all',
    searchKeyword: '  code.exe  ',
  }),
  ['desktop-visible'],
  '搜索词大小写和空白归一化不正确'
)

assert(isIconManagerViewMode('grid') === true, 'grid 应该是合法视图模式')
assert(isIconManagerViewMode('table') === false, 'table 不应该被识别为合法视图模式')
assert(normalizeIconManagerViewMode('grid') === 'grid', '合法视图模式不应被改写')
assert(normalizeIconManagerViewMode('table') === 'list', '非法视图模式应该回退到默认列表视图')
assert(normalizeIconManagerViewMode(undefined, 'grid') === 'grid', '自定义回退视图模式没有生效')
assert(
  getPathLeaf('C:\\Program Files\\Microsoft VS Code\\Code.exe') === 'Code.exe',
  'Windows 路径叶子节点提取失败'
)
assert(getPathLeaf('D:/Apps/Obsidian/Obsidian.lnk') === 'Obsidian.lnk', '斜杠路径叶子节点提取失败')
assert(deriveIconEntryName('D:/Apps/Obsidian/Obsidian.lnk') === 'Obsidian', '图标名称推导失败')

console.log('iconManager 测试通过')
