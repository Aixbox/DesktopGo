import assert from 'node:assert/strict'
import test from 'node:test'
import { getFolderTilePreviewGeometry } from './folderTilePreviewGeometry.ts'
import { getDesktopFolderTileMetrics } from './folderVisualPolicy.ts'
import { getClosedFolderPreviewLayout } from './folderPreviewPolicy.ts'

const sizes = ['1x1', '1x2', '2x1', '2x2']
function preview(size, childCount, rtl = false) {
  const [cols, rows] = size.split('x').map(Number)
  const m = getDesktopFolderTileMetrics({
    span: { cols, rows },
    slotWidth: 96,
    slotHeight: 110,
    gridGap: 12,
    folderSize: size,
  })
  return {
    m,
    ...getFolderTilePreviewGeometry({
      folderSize: size,
      childCount,
      width: m.shapeWidth,
      height: m.shapeHeight,
      panelBase: m.panelBase,
      rtl,
    }),
  }
}

for (const size of sizes) {
  test(`${size}: empty, exact fill and overflow preserve closed-folder preview rules`, () => {
    for (const count of [0, 1, 3, 4, 5, 6, 9, 10, 12, 30]) {
      const { icons, holders, m } = preview(size, count)
      const expected = getClosedFolderPreviewLayout(size, count)
      assert.equal(icons.filter(slot => slot.visible).length, expected.visibleIconCount)
      assert.equal(
        icons.filter(slot => slot.visible && slot.stacked).length,
        expected.stackedIconCount
      )
      assert.equal(holders.length, expected.stackedIconCount ? 4 - expected.stackedIconCount : 0)
      assert.equal(icons.length, Math.min(12, count))
      for (const slot of [...icons, ...holders]) {
        assert.ok(slot.size > 0)
        assert.ok(slot.left >= 0 && slot.top >= 0)
        assert.ok(slot.left + slot.size <= m.shapeWidth)
        assert.ok(slot.top + slot.size <= m.shapeHeight)
      }
    }
  })
  test(`${size}: RTL mirrors slot order without changing icon size`, () => {
    const ltr = preview(size, 12),
      rtl = preview(size, 12, true)
    for (let index = 0; index < ltr.icons.length; index++) {
      const a = ltr.icons[index],
        b = rtl.icons[index]
      assert.equal(a.size, b.size)
      assert.equal(a.top, b.top)
      assert.equal(a.visible, b.visible)
    }
    if (size !== '1x2') assert.ok(ltr.icons[0].left < rtl.icons[0].left)
    const firstMini = ltr.icons.findIndex(slot => slot.stacked && slot.visible)
    assert.ok(ltr.icons[firstMini].left < ltr.icons[firstMini + 1].left)
    assert.ok(rtl.icons[firstMini].left > rtl.icons[firstMini + 1].left)
  })
}

test('full icons become stacked icons and return at the same child indices', () => {
  const expanded = preview('2x2', 12),
    narrow = preview('1x2', 12)
  assert.equal(expanded.icons.length, narrow.icons.length)
  assert.equal(expanded.icons[2].stacked, false)
  assert.equal(narrow.icons[2].stacked, true)
  assert.equal(expanded.icons[7].visible, true)
  assert.equal(narrow.icons[7].visible, false)
  assert.notEqual(expanded.icons[2].left, narrow.icons[2].left)
  assert.deepEqual(preview('2x2', 12).icons, expanded.icons)
})
