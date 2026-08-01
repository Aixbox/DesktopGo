import {
  DEFAULT_BEST_MATCH_FOLDER_CONFIG,
  DEFAULT_CATALOG_DEPTH,
  MAX_CATALOG_DEPTH,
  MAX_CATALOG_FOLDERS,
  MIN_CATALOG_DEPTH,
  UNLIMITED_CATALOG_DEPTH,
  clampCatalogDepth,
  hasCatalogFolder,
  normalizeBestMatchFolderConfig,
  normalizeCatalogFolderPath,
  withPresetFolders,
} from './bestMatchFolders.ts'
import { DEFAULT_CATALOG_EXTENSIONS } from './catalogFileTypes.ts'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

// 非法输入一律退回默认值
for (const invalid of [null, undefined, 42, 'nope', []]) {
  const config = normalizeBestMatchFolderConfig(invalid)
  assert(
    config.folders.length === 0 && !config.presetsApplied && config.includeFolders,
    `非法输入 ${JSON.stringify(invalid)} 应退回默认值`
  )
  assert(config.extensions.length === DEFAULT_CATALOG_EXTENSIONS.length, '扩展名应退回默认勾选')
}

// 层数钳位：0 表示不限层数，负数与非数字退回默认
assert(clampCatalogDepth(0) === UNLIMITED_CATALOG_DEPTH, '0 应保留为不限层数')
assert(clampCatalogDepth(1) === MIN_CATALOG_DEPTH, '1 层应保留')
assert(clampCatalogDepth(99) === MAX_CATALOG_DEPTH, '超出上限应钳到最大层数')
assert(clampCatalogDepth(3.6) === 4, '小数应四舍五入')
assert(clampCatalogDepth('x') === DEFAULT_CATALOG_DEPTH, '非数字应退回默认层数')
assert(clampCatalogDepth(-2) === DEFAULT_CATALOG_DEPTH, '负数应退回默认层数')

// 目录列表：空路径丢弃、重复去重（大小写与斜杠方向不算差异）、保留 enabled
const config = normalizeBestMatchFolderConfig({
  presetsApplied: true,
  folders: [
    { path: '  ', maxDepth: 2 },
    { path: 'D:\\Green', maxDepth: 0 },
    { path: 'd:/green/', maxDepth: 4 },
    { path: 'D:/Other', maxDepth: 2, enabled: false },
  ],
  extensions: ['exe', '.LNK'],
  includeFolders: false,
})
assert(config.presetsApplied, 'presetsApplied 应被保留')
assert(
  config.folders.map(folder => folder.path).join('|') === 'D:\\Green|D:/Other',
  `空路径应丢弃、重复路径应去重，实际 ${config.folders.map(f => f.path)}`
)
assert(config.folders[0].maxDepth === UNLIMITED_CATALOG_DEPTH, '不限层数应被保留')
assert(config.folders[0].enabled, '缺少 enabled 的条目按启用处理')
assert(config.folders[1].enabled === false, 'enabled: false 应被保留')
assert(config.extensions.join(',') === 'exe,lnk', '扩展名应归一化')
assert(config.includeFolders === false, 'includeFolders: false 应被保留')

// 条数上限
const overflow = normalizeBestMatchFolderConfig({
  folders: Array.from({ length: MAX_CATALOG_FOLDERS + 5 }, (_, index) => ({
    path: `D:/Folder${index}`,
    maxDepth: 2,
  })),
})
assert(
  overflow.folders.length === MAX_CATALOG_FOLDERS,
  `目录应截断到 ${MAX_CATALOG_FOLDERS} 条，实际 ${overflow.folders.length}`
)

// 读得懂上一版的形状：customFolders 照搬成 folders，预设标记不继承
const legacy = normalizeBestMatchFolderConfig({
  disabledBuiltins: ['desktop'],
  customFolders: [{ path: 'D:\\Green', maxDepth: 3, enabled: true }],
})
assert(
  legacy.folders.length === 1 && legacy.folders[0].path === 'D:\\Green',
  '旧的 customFolders 应被读成目录清单'
)
assert(!legacy.presetsApplied, '旧存档没有预设标记，应让预设重新写入一次')

// 路径归一化与重复判断
assert(normalizeCatalogFolderPath('D:\\Green\\') === 'd:/green', '路径归一化应统一斜杠与大小写')
assert(hasCatalogFolder(config, 'd:/green'), '同一目录的不同写法应判为已存在')
assert(!hasCatalogFolder(config, 'D:/Missing'), '未添加的目录不应判为已存在')

// 预设合并：已有的按路径跳过，其余追加，并打上标记
const presets = [
  { path: 'C:/Start Menu', maxDepth: 4, enabled: true },
  { path: 'D:/GREEN', maxDepth: 1, enabled: true },
]
const merged = withPresetFolders(config, presets)
assert(merged.presetsApplied, '合并预设后应打上标记')
assert(
  merged.folders.map(folder => folder.path).join('|') === 'D:\\Green|D:/Other|C:/Start Menu',
  `已存在的预设应跳过、新的追加到末尾，实际 ${merged.folders.map(f => f.path)}`
)
assert(
  merged.folders[0].maxDepth === UNLIMITED_CATALOG_DEPTH,
  '已存在目录的层数不应被预设覆盖'
)

const restored = withPresetFolders({ ...DEFAULT_BEST_MATCH_FOLDER_CONFIG }, presets)
assert(restored.folders.length === 2, '空清单应把预设全部加进来')
assert(
  restored.folders.every(folder => folder.enabled),
  '恢复预设时应处于启用状态'
)

console.log('最佳匹配目录设置测试通过')
