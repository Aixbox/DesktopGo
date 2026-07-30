import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countCachedSearchResults,
  getCachedSearchResult,
  resolveCompleteSearchSnapshot,
} from './resultCache.ts'

const hit = path => ({ path })

test('accepts only a snapshot containing every reported result', () => {
  const items = [hit('a'), hit('b')]

  assert.equal(resolveCompleteSearchSnapshot(items, 2), items)
  assert.equal(resolveCompleteSearchSnapshot(items, 3), null)
})

test('complete snapshot provides direct random access before paged data', () => {
  const completeItems = [hit('a'), hit('b'), hit('c')]

  assert.equal(
    getCachedSearchResult({ index: 2, completeItems, pages: {}, pageSize: 2 }),
    completeItems[2]
  )
})

test('paged fallback never substitutes an item from another index', () => {
  const pages = { 0: [hit('a'), hit('b')], 4: [hit('e')] }

  assert.equal(countCachedSearchResults(pages), 3)
  assert.equal(getCachedSearchResult({ index: 3, completeItems: null, pages, pageSize: 2 }), null)
  assert.equal(
    getCachedSearchResult({ index: 4, completeItems: null, pages, pageSize: 2 }),
    pages[4][0]
  )
})
