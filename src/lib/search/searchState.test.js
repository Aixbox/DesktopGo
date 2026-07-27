import assert from 'node:assert/strict'
import test from 'node:test'
import { clampSearchSelection, resolveCommittedKeyword } from './searchState.ts'

test('live search derives the committed keyword from the current input', () => {
  assert.equal(
    resolveCommittedKeyword({ keyword: '  report  ', submittedKeyword: 'old', liveOnType: true }),
    'report'
  )
})

test('manual search preserves the last submitted keyword while editing', () => {
  assert.equal(
    resolveCommittedKeyword({
      keyword: 'draft',
      submittedKeyword: '  submitted  ',
      liveOnType: false,
    }),
    'submitted'
  )
})

test('search selection stays within the current result range', () => {
  assert.equal(clampSearchSelection(8, 5), 4)
  assert.equal(clampSearchSelection(2, 5), 2)
  assert.equal(clampSearchSelection(-1, 5), -1)
  assert.equal(clampSearchSelection(0, 0), -1)
})
