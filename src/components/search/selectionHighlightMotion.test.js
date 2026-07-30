import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isSelectionRowFullyVisible,
  resolveSelectionAnimationDuration,
  shouldAnimateSelectionMove,
} from './selectionHighlightMotion.ts'

const visibility = { rowHeight: 60, scrollTop: 120, viewportHeight: 300 }
const move = {
  previousIndex: 3,
  index: 4,
  viewportScrolled: false,
  rowFullyVisible: true,
  reducedMotion: false,
}

test('row visibility requires the whole row inside the viewport', () => {
  assert.equal(isSelectionRowFullyVisible({ ...visibility, index: 2 }), true)
  assert.equal(isSelectionRowFullyVisible({ ...visibility, index: 6 }), true)
  assert.equal(isSelectionRowFullyVisible({ ...visibility, index: 1 }), false)
  assert.equal(isSelectionRowFullyVisible({ ...visibility, index: 7 }), false)
  assert.equal(isSelectionRowFullyVisible({ ...visibility, index: 2, viewportHeight: 0 }), false)
})

test('short moves on a stationary list glide', () => {
  assert.equal(shouldAnimateSelectionMove(move), true)
  assert.equal(shouldAnimateSelectionMove({ ...move, index: 7 }), true)
})

test('moves caused by scrolling or leaving the viewport snap', () => {
  assert.equal(shouldAnimateSelectionMove({ ...move, viewportScrolled: true }), false)
  assert.equal(shouldAnimateSelectionMove({ ...move, rowFullyVisible: false }), false)
})

test('long jumps, reduced motion and non-moves snap', () => {
  assert.equal(shouldAnimateSelectionMove({ ...move, index: 8 }), false)
  assert.equal(shouldAnimateSelectionMove({ ...move, reducedMotion: true }), false)
  assert.equal(shouldAnimateSelectionMove({ ...move, index: 3 }), false)
  assert.equal(shouldAnimateSelectionMove({ ...move, previousIndex: -1, index: 0 }), false)
})

test('duration grows with distance, stays bounded and catches up when interrupted', () => {
  assert.equal(resolveSelectionAnimationDuration({ distance: 1, interrupted: false }), 90)
  assert.equal(resolveSelectionAnimationDuration({ distance: 4, interrupted: false }), 144)
  assert.equal(resolveSelectionAnimationDuration({ distance: 40, interrupted: false }), 150)
  assert.equal(resolveSelectionAnimationDuration({ distance: 4, interrupted: true }), 70)
})
