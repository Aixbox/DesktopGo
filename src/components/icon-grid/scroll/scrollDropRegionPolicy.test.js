import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveScrollIconDropRegion,
  resolveScrollReorderDirection,
} from './scrollDropRegionPolicy.ts'

const entry = (col, row, cols = 1, rows = 1) => ({ col, row, span: { cols, rows } })

test('approach direction follows the dominant displacement of logical footprint centers', () => {
  const origin = entry(2, 2)
  for (const [target, direction] of [
    [entry(3, 2), 'right'],
    [entry(1, 2), 'left'],
    [entry(2, 3), 'down'],
    [entry(2, 1), 'up'],
    [entry(3, 4), 'down'],
    [entry(0, 1), 'left'],
    [entry(2, 2), null],
  ]) {
    assert.equal(resolveScrollReorderDirection(origin, target), direction)
  }
  assert.equal(resolveScrollReorderDirection(entry(1, 0, 2, 2), entry(0, 0)), 'left')
  assert.equal(resolveScrollReorderDirection(undefined, origin), null)
})

for (const direction of ['left', 'right', 'up', 'down']) {
  test(`${direction}: three 20% edges reorder and only the near side is protected at every aspect ratio`, () => {
    for (const [width, height] of [
      [48, 48],
      [48, 198],
      [198, 48],
      [198, 198],
    ]) {
      const rect = { left: 200, top: -3500, width, height }
      const horizontal = direction === 'left' || direction === 'right'
      const forward = direction === 'right' || direction === 'down'
      const region = (along, across = 0.5) => {
        const position = forward ? along : 1 - along
        return resolveScrollIconDropRegion(
          {
            x: rect.left + width * (horizontal ? position : across),
            y: rect.top + height * (horizontal ? across : position),
          },
          rect,
          direction
        )
      }
      assert.equal(region(-0.1), 'approach')
      assert.equal(region(0.1), 'approach')
      assert.equal(region(0.5), 'center')
      assert.equal(region(0.799), 'center')
      assert.equal(region(0.8), 'center', 'the exact inner boundary remains a merge region')
      assert.equal(region(0.801), 'edge')
      assert.equal(region(1.1), 'edge', 'existing overlap hits are not limited to an 8px margin')
      for (const across of [0.1, 0.9, -0.1, 1.1]) {
        assert.equal(region(0.5, across), 'edge', 'both perpendicular sides reorder')
      }
      for (const across of [0.2, 0.8]) {
        assert.equal(region(0.5, across), 'center', 'lateral inner boundaries still merge')
      }
      assert.equal(region(0.5, 0.199), 'edge')
      assert.equal(region(0.5, 0.801), 'edge')
      assert.equal(region(0.1, 0.9), 'approach', 'equidistant near corners retain protection')
      assert.equal(region(0.05, 0.9), 'approach', 'the nearest near edge retains protection')
      assert.equal(region(0.1, 0.95), 'edge', 'the nearest perpendicular edge can reorder')
    }
  })
}
