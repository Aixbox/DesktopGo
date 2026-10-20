import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveRectAtUnitScale } from './gridMotionGeometry.ts'

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
