import {
  attemptSingleStepDirectionalFootprintEvasion,
  solveFootprintPlacements,
} from './footprintPlacementPolicy.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const makeEntry = (id, anchorIndex, overlapsReserved) => ({
  id,
  anchorIndex,
  span: { cols: 1, rows: 1 },
  footprint: [anchorIndex],
  bounds: {
    minRow: Math.floor(anchorIndex / 2),
    maxRow: Math.floor(anchorIndex / 2),
    minCol: anchorIndex % 2,
    maxCol: anchorIndex % 2,
  },
  overlapsReserved,
})

const solved = solveFootprintPlacements({
  order: ['a', 'b', null, null],
  entries: [makeEntry('a', 0, true), makeEntry('b', 1, false)],
  reservedFootprint: [0],
  rangeStart: 0,
  rangeEndExclusive: 4,
  pageStart: 0,
  pageSize: 4,
  columns: 2,
  movablePredicate: entry => entry.overlapsReserved,
  preserveRelativeOrder: false,
})

assert(solved !== null, '求解器应能为重叠条目找到空余 footprint')
assert(
  JSON.stringify(solved?.order) === JSON.stringify([null, 'b', 'a', null]),
  '求解器应保留固定条目，并将重叠条目移动到代价最低的空位'
)

const singleStep = attemptSingleStepDirectionalFootprintEvasion({
  order: ['a', null, 'b', null],
  entries: [makeEntry('a', 0, true), makeEntry('b', 2, false)],
  reservedFootprint: [0],
  pageStart: 0,
  pageSize: 4,
  columns: 2,
  preferredDirections: ['right'],
})

assert(singleStep !== null, '首选方向存在相邻空位时应完成单步避让')
assert(
  JSON.stringify(singleStep?.order) === JSON.stringify([null, 'a', 'b', null]),
  '单步避让应只沿首选方向移动重叠条目'
)

console.log('footprint 放置策略测试通过')
