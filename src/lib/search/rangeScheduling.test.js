import assert from 'node:assert/strict'
import test from 'node:test'
import { selectNextSearchOffset } from './rangeScheduling.ts'

test('current visible pages take priority over previously requested offsets', () => {
  assert.equal(
    selectNextSearchOffset({
      visibleCandidates: [500, 550],
      requestedOffsets: [50, 100],
      visibleStartPage: 500,
    }),
    500
  )
})

test('the visible page nearest the viewport start is selected first', () => {
  assert.equal(
    selectNextSearchOffset({
      visibleCandidates: [650, 550, 600],
      requestedOffsets: [],
      visibleStartPage: 600,
    }),
    600
  )
})

test('explicit requests are used when the visible range is already loaded', () => {
  assert.equal(
    selectNextSearchOffset({
      visibleCandidates: [],
      requestedOffsets: [150, 200],
      visibleStartPage: 0,
    }),
    150
  )
})
