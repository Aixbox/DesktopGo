import test from 'node:test'
import assert from 'node:assert/strict'
import { getSearchScopeTransition } from './scope.ts'

const SEARCH_SOURCES = ['all', 'icons', 'everything']

test('switching search scope preserves the query and file preferences', () => {
  for (const currentSource of SEARCH_SOURCES) {
    for (const nextSource of SEARCH_SOURCES) {
      const transition = getSearchScopeTransition(currentSource, nextSource)

      assert.equal(transition.preserveKeyword, true)
      assert.equal(transition.preserveFilePreferences, true)
    }
  }
})

test('switching search scope resets selections and preview state', () => {
  const transition = getSearchScopeTransition('all', 'everything')

  assert.deepEqual(transition, {
    changed: true,
    preserveKeyword: true,
    preserveFilePreferences: true,
    resetSelections: true,
    resetPreview: true,
  })
})

test('selecting the active scope is a no-op', () => {
  const transition = getSearchScopeTransition('icons', 'icons')

  assert.equal(transition.changed, false)
  assert.equal(transition.resetSelections, false)
  assert.equal(transition.resetPreview, false)
})
