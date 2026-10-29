import {
  DEFAULT_FOLDER_LAYOUT_PROFILE,
  FOLDER_LAYOUT_PROFILES,
  computeFolderPages,
  getFolderPageCapacity,
  getFolderPageCount,
  getFolderPlacement,
  getFolderPreviewItems,
  getFolderStackedItems,
  resolveFolderDropCapacity,
} from './folderLayout.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(getFolderPageCapacity(DEFAULT_FOLDER_LAYOUT_PROFILE) === 12, '标准文件夹容量应为 3×4=12')
assert(getFolderPageCount(0) === 1, '空文件夹仍应保留一个可落点页面')
assert(getFolderPageCount(12) === 1, '12 个项目应保持在第一页')
assert(getFolderPageCount(13) === 2, '第 13 个项目应进入第二页')

assert(
  JSON.stringify(getFolderPlacement(0)) === JSON.stringify({ page: 0, row: 0, col: 0, rank: 0 }),
  'rank 0 应映射到第一页左上角'
)
assert(
  JSON.stringify(getFolderPlacement(11)) === JSON.stringify({ page: 0, row: 3, col: 2, rank: 11 }),
  'rank 11 应映射到第一页右下角'
)
assert(
  JSON.stringify(getFolderPlacement(12)) === JSON.stringify({ page: 1, row: 0, col: 0, rank: 12 }),
  'rank 12 应映射到第二页左上角'
)

const pages = computeFolderPages(Array.from({ length: 13 }, (_, index) => `item-${index}`))
assert(pages.length === 2, '13 个项目应派生两页')
assert(pages[0].entries.length === 12 && pages[1].entries[0] === 'item-12', '分页边界必须稳定')
assert(
  pages[1].entries.slice(1).every(entry => entry === null),
  '末页空槽应显式补齐'
)

const simplePages = computeFolderPages(
  ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  FOLDER_LAYOUT_PROFILES.simple
)
assert(simplePages.length === 2, 'Simple profile 的第 7 个项目应进入第二页')
assert(simplePages[1].entries[0] === 'g', 'profile 改变后仍按 rank 保序')
assert(
  getFolderPreviewItems(['a', 'b', 'c', 'd']).join(',') === 'a,b,c',
  '标准预览应使用前三个项目'
)
assert(
  getFolderStackedItems(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']).join(',') === 'd,e,f,g',
  '堆叠预览应从预览槽之后稳定取样'
)

const boundedProfile = { ...DEFAULT_FOLDER_LAYOUT_PROFILE, maxPages: 1 }
const rejected = resolveFolderDropCapacity(12, 1, boundedProfile)
assert(
  !rejected.accepted && rejected.reason === 'capacity-exceeded',
  '达到 profile 上限时应拒绝放入'
)
assert(rejected.remaining === 0 && rejected.nextPageCount === 2, '拒绝结果应包含剩余容量和目标页数')
const spill = resolveFolderDropCapacity(12, 1)
assert(spill.accepted && spill.nextPageCount === 2, '无 maxPages 时应允许跨页扩展')

console.log('folderLayout 测试通过')
