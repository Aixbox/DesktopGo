import assert from 'node:assert/strict'
import test from 'node:test'
import { SHORTCUT_GRID_COLUMN_GAP, resolveShortcutGridColumnCount } from './shortcutGridLayout.ts'

test('column count matches the tracks auto-fill can place', () => {
  // 592 可用宽度、100 磁贴宽度、16 间距：5 列占 596 - 16 = 580，6 列需要 696。
  assert.equal(resolveShortcutGridColumnCount({ availableWidth: 592, tileWidth: 100 }), 5)
  assert.equal(resolveShortcutGridColumnCount({ availableWidth: 592, tileWidth: 60 }), 8)
})

test('an exactly fitting row does not gain an extra column', () => {
  const tileWidth = 100
  const exactWidth = tileWidth * 3 + SHORTCUT_GRID_COLUMN_GAP * 2
  assert.equal(resolveShortcutGridColumnCount({ availableWidth: exactWidth, tileWidth }), 3)
  assert.equal(resolveShortcutGridColumnCount({ availableWidth: exactWidth - 1, tileWidth }), 2)
})

test('degenerate measurements fall back to a single column', () => {
  assert.equal(resolveShortcutGridColumnCount({ availableWidth: 0, tileWidth: 100 }), 1)
  assert.equal(resolveShortcutGridColumnCount({ availableWidth: 40, tileWidth: 100 }), 1)
  assert.equal(resolveShortcutGridColumnCount({ availableWidth: 592, tileWidth: 0 }), 1)
  assert.equal(resolveShortcutGridColumnCount({ availableWidth: Number.NaN, tileWidth: 100 }), 1)
})
