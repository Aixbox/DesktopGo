import assert from 'node:assert/strict'
import test from 'node:test'
import { createLayoutDimensionsTracker } from './layoutDimensionsTracker.ts'

test('layout dimensions retain the last committed grid geometry', () => {
  const tracker = createLayoutDimensionsTracker({ pageSize: 12, columns: 4 })

  assert.deepEqual(tracker.read(), { pageSize: 12, columns: 4 })

  tracker.update({ pageSize: 15, columns: 5 })

  assert.deepEqual(tracker.read(), { pageSize: 15, columns: 5 })
})
