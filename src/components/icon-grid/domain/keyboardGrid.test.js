import {
  parseKeyboardGridCellId,
  resolveKeyboardGridCellCenter,
  resolveKeyboardPageTransition,
} from './keyboardGrid.ts'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const parsed = parseKeyboardGridCellId('cell:2:7')
assert(parsed?.page === 2 && parsed.index === 7, '应解析分页空槽 id')
assert(parseKeyboardGridCellId('icon:mail') === null, '普通项目 id 不应被当作空槽')
assert(parseKeyboardGridCellId('cell:x:1') === null, '非法页码应被拒绝')

const center = resolveKeyboardGridCellCenter({
  id: 'cell:1:5',
  currentPage: 1,
  columns: 4,
  rows: 3,
  pageSize: 12,
  itemWidth: 80,
  itemHeight: 96,
  gridGap: 8,
  gridLeft: 100,
  gridTop: 200,
})
assert(center?.x === 228 && center.y === 352, '空槽中心应与 CSS 网格步长一致')
const scaledCenter = resolveKeyboardGridCellCenter({
  id: 'cell:1:5',
  currentPage: 1,
  columns: 4,
  rows: 3,
  pageSize: 12,
  itemWidth: 80,
  itemHeight: 96,
  gridGap: 8,
  gridLeft: 100,
  gridTop: 200,
  scaleX: 0.5,
  scaleY: 1.25,
})
assert(scaledCenter?.x === 164 && scaledCenter.y === 390, '缩放网格应保持空槽中心映射')
assert(
  resolveKeyboardGridCellCenter({
    id: 'cell:0:5',
    currentPage: 1,
    columns: 4,
    rows: 3,
    pageSize: 12,
    itemWidth: 80,
    itemHeight: 96,
    gridGap: 8,
    gridLeft: 100,
    gridTop: 200,
  }) === null,
  '其他页空槽不能作为当前页键盘落点'
)
assert(
  resolveKeyboardGridCellCenter({
    id: 'cell:1:12',
    currentPage: 1,
    columns: 4,
    rows: 3,
    pageSize: 12,
    itemWidth: 80,
    itemHeight: 96,
    gridGap: 8,
    gridLeft: 100,
    gridTop: 200,
  }) === null,
  '超出网格容量的空槽不能作为落点'
)
const transition = resolveKeyboardPageTransition({
  key: 'ArrowRight',
  currentPage: 1,
  pageCount: 3,
  currentX: 420,
  currentY: 304,
  gridLeft: 100,
  gridTop: 200,
  gridRight: 500,
  itemWidth: 80,
  itemHeight: 96,
  columns: 4,
  rows: 3,
  gridGap: 8,
})
assert(transition?.page === 2 && transition.point.x === 100 && transition.point.y === 304, '键盘拖动到右边缘应切换到下一页并保持行')
assert(
  resolveKeyboardPageTransition({
    key: 'ArrowLeft',
    currentPage: 0,
    pageCount: 3,
    currentX: 100,
    currentY: 200,
    gridLeft: 100,
    gridTop: 200,
    gridRight: 500,
    itemWidth: 80,
    itemHeight: 96,
    columns: 4,
    rows: 3,
    gridGap: 8,
  }) === null,
  '第一页向左不能生成越界分页落点'
)

console.log('keyboardGrid 测试通过')
