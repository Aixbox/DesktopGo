import assert from 'node:assert/strict'
import { test } from 'node:test'
import { removeElementTranslateFromRect, resolveRectAtUnitScale } from './gridMotionGeometry.ts'

test('restores a rect measured during centered grid scaling to its final position', () => {
  const rect = resolveRectAtUnitScale(
    { left: 309, top: 204.5, width: 62.08, height: 62.08 },
    { left: 115, top: 59, width: 970, height: 582 },
    0.97,
    0.97
  )

  assert.ok(Math.abs(rect.left - 300) < 1e-9)
  assert.ok(Math.abs(rect.top - 200) < 1e-9)
  assert.ok(Math.abs(rect.width - 64) < 1e-9)
  assert.ok(Math.abs(rect.height - 64) < 1e-9)
})

test('removes the item reorder translation from a restored flight target', () => {
  const unitRect = resolveRectAtUnitScale(
    { left: 320.64, top: 196.74, width: 62.08, height: 62.08 },
    { left: 115, top: 59, width: 970, height: 582 },
    0.97,
    0.97
  )
  const target = removeElementTranslateFromRect(unitRect, { x: 12, y: -8 })

  assert.ok(Math.abs(target.left - 300) < 1e-9)
  assert.ok(Math.abs(target.top - 200) < 1e-9)
  assert.ok(Math.abs(target.width - 64) < 1e-9)
  assert.ok(Math.abs(target.height - 64) < 1e-9)
})
