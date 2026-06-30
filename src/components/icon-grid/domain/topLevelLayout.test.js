import {
  buildPersistedItemCoordinates,
  resizeSlotPages,
} from './topLevelLayout.ts'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const makeIcon = key => ({
  kind: 'icon',
  key,
  icon: { path: key },
})

const folderItem = {
  kind: 'folder',
  id: 'docs',
  name: 'Docs',
  size: '2x2',
  children: [],
}

const recordedCoordinates = buildPersistedItemCoordinates(
  ['folder:docs', null, 'note', null, null, null],
  [folderItem, makeIcon('note')],
  6,
  3
)

const folderCoordinates = recordedCoordinates.find(entry => entry.id === 'folder:docs')
assert(folderCoordinates, '2x2 文件夹应该生成坐标快照')
assert(folderCoordinates.cells.length === 4, '2x2 文件夹应该记录四个坐标')
assert(
  JSON.stringify(folderCoordinates.cells) ===
    JSON.stringify([
      { page: 0, row: 0, col: 0 },
      { page: 0, row: 0, col: 1 },
      { page: 0, row: 1, col: 0 },
      { page: 0, row: 1, col: 1 },
    ]),
  '2x2 文件夹的 footprint 坐标应与当前布局一致'
)

const resizeItems = ['a', 'b', 'c', 'd', 'e', 'f'].map(makeIcon)
const resizeSlots = ['a', 'b', 'c', 'd', 'e', 'f']
const stableCoordinates = buildPersistedItemCoordinates(resizeSlots, resizeItems, 6, 3)
const stableResizeResult = resizeSlotPages(
  resizeSlots,
  resizeItems,
  6,
  8,
  3,
  4,
  stableCoordinates
)

assert(
  JSON.stringify(stableResizeResult) ===
    JSON.stringify(['a', 'b', 'c', null, 'd', 'e', 'f', null]),
  '扩容后应优先按 page/row/col 恢复已有图标'
)

const fallbackResizeResult = resizeSlotPages(
  resizeSlots,
  resizeItems,
  6,
  8,
  3,
  4,
  [{ id: 'f', cells: [{ page: 0, row: 9, col: 9 }] }]
)

assert(
  JSON.stringify(fallbackResizeResult) ===
    JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f', null, null]),
  '坐标失效时，失败项按页内从左到右、从上到下补到第一个空位，而不是误解释越界坐标'
)

const shrinkItems = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(makeIcon)
const shrinkSlots = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const shrinkCoordinates = buildPersistedItemCoordinates(shrinkSlots, shrinkItems, 8, 4)
const shrinkResizeResult = resizeSlotPages(
  shrinkSlots,
  shrinkItems,
  8,
  6,
  4,
  3,
  shrinkCoordinates
)

assert(
  JSON.stringify(shrinkResizeResult) ===
    JSON.stringify(['a', 'b', 'c', 'e', 'f', 'g', 'd', 'h', null, null, null, null]),
  '缩窗时，失败项应按页内从左到右、从上到下补洞，当前页满了再顺延到后页'
)

const multiPageShrinkItems = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(makeIcon)
const multiPageShrinkSlots = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
const multiPageShrinkCoordinates = buildPersistedItemCoordinates(
  multiPageShrinkSlots,
  multiPageShrinkItems,
  8,
  4
)
const multiPageShrinkResult = resizeSlotPages(
  multiPageShrinkSlots,
  multiPageShrinkItems,
  8,
  6,
  4,
  3,
  multiPageShrinkCoordinates
)

assert(
  JSON.stringify(multiPageShrinkResult) ===
    JSON.stringify(['a', 'b', 'c', 'e', 'f', 'g', 'i', 'j', 'd', 'h', null, null]),
  '缩窗时，下一页图标保持原位，溢出项填入下一页空位，而不是挤占已有图标'
)

console.log('topLevelLayout 稳定坐标测试通过')
