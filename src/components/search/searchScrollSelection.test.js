import assert from 'node:assert/strict'
import test from 'node:test'
import { getSearchScrollAnchorIndex } from './searchScrollSelection.ts'

const options = { viewportHeight: 300, rowHeight: 60, resultCount: 100 }

test('downward scrolling anchors selection to the first visible row', () => {
  assert.equal(getSearchScrollAnchorIndex({ ...options, direction: 1, scrollTop: 121 }), 2)
})

test('upward scrolling anchors selection to the last visible row', () => {
  assert.equal(getSearchScrollAnchorIndex({ ...options, direction: -1, scrollTop: 121 }), 6)
})

test('scroll anchors stay inside the result range', () => {
  assert.equal(getSearchScrollAnchorIndex({ ...options, direction: 1, scrollTop: 10_000 }), 99)
})
