import {
  CATALOG_ANY_EXTENSION,
  CATALOG_FILE_TYPE_GROUPS,
  DEFAULT_CATALOG_EXTENSIONS,
  allowsAnyCatalogExtension,
  isCatalogFileTypeGroupSelected,
  normalizeCatalogExtension,
  normalizeCatalogExtensions,
  toggleCatalogFileTypeGroup,
} from './catalogFileTypes.ts'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const group = key => {
  const found = CATALOG_FILE_TYPE_GROUPS.find(entry => entry.key === key)
  if (!found) throw new Error(`分组不存在：${key}`)
  return found
}

// 默认勾选：程序、脚本、文档、表格，不含图片/音视频/压缩/代码/其它
assert(DEFAULT_CATALOG_EXTENSIONS.includes('exe'), '默认应收录 exe')
assert(DEFAULT_CATALOG_EXTENSIONS.includes('lnk'), '默认应收录 lnk')
assert(DEFAULT_CATALOG_EXTENSIONS.includes('pdf'), '默认应收录常见文档')
assert(DEFAULT_CATALOG_EXTENSIONS.includes('xlsx'), '默认应收录表格')
assert(!DEFAULT_CATALOG_EXTENSIONS.includes('png'), '默认不该收录图片')
assert(!DEFAULT_CATALOG_EXTENSIONS.includes('mp4'), '默认不该收录音视频')
assert(!DEFAULT_CATALOG_EXTENSIONS.includes('ts'), '默认不该收录代码文件')
assert(
  !allowsAnyCatalogExtension(DEFAULT_CATALOG_EXTENSIONS),
  '默认应该是过滤状态，而不是「其它类型」全收'
)

// 单个扩展名归一化
assert(normalizeCatalogExtension('.EXE') === 'exe', '应去掉点号并小写')
assert(normalizeCatalogExtension('  Lnk ') === 'lnk', '应去掉空白')
assert(normalizeCatalogExtension(42) === '', '非字符串应归一化为空')

// 清单归一化：非数组退回默认，空数组保留（只收文件夹是合法选择）
assert(normalizeCatalogExtensions(null) === DEFAULT_CATALOG_EXTENSIONS, '非数组应退回默认清单')
assert(normalizeCatalogExtensions([]).length === 0, '空数组是合法的，不该被替换成默认')
assert(
  normalizeCatalogExtensions(['.EXE', 'exe', 'nope-not-a-type', 'PNG']).join(',') === 'exe,png',
  '应去点号、小写、去重并丢掉不认识的扩展名'
)
assert(
  normalizeCatalogExtensions([CATALOG_ANY_EXTENSION]).join(',') === CATALOG_ANY_EXTENSION,
  '「其它类型」哨兵应被保留'
)

// 组勾选判定
assert(
  isCatalogFileTypeGroupSelected(['exe'], group('launcher')),
  '组内任一扩展名在清单里就算勾上'
)
assert(
  !isCatalogFileTypeGroupSelected(['exe'], group('image')),
  '没有交集的分组不应算勾上'
)

// 整组切换
const withImages = toggleCatalogFileTypeGroup(DEFAULT_CATALOG_EXTENSIONS, group('image'), true)
assert(isCatalogFileTypeGroupSelected(withImages, group('image')), '勾上后整组应加入')
assert(isCatalogFileTypeGroupSelected(withImages, group('launcher')), '不应影响其它分组')

const withoutDocuments = toggleCatalogFileTypeGroup(
  DEFAULT_CATALOG_EXTENSIONS,
  group('document'),
  false
)
assert(
  !isCatalogFileTypeGroupSelected(withoutDocuments, group('document')),
  '取消后整组应移除'
)
assert(withoutDocuments.includes('exe'), '取消文档不应影响程序')

// 顺序稳定：始终按分组定义排列，便于阅读存档
const shuffled = toggleCatalogFileTypeGroup(['png', 'exe'], group('script'), true)
assert(
  shuffled.indexOf('exe') < shuffled.indexOf('bat') && shuffled.indexOf('bat') < shuffled.indexOf('png'),
  `输出顺序应按分组定义，实际 ${shuffled}`
)

// 「其它类型」= 不过滤
const anyType = toggleCatalogFileTypeGroup([], group('any'), true)
assert(allowsAnyCatalogExtension(anyType), '勾上「其它类型」应表示不过滤')
assert(
  !allowsAnyCatalogExtension(toggleCatalogFileTypeGroup(anyType, group('any'), false)),
  '取消「其它类型」应恢复过滤'
)

console.log('最佳匹配文件类型筛选测试通过')
