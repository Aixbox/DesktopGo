import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildIconRequestSignature,
  mergeLoadedIcons,
  recordIconAttempts,
  selectIconRequests,
  toIconCacheKey,
} from './visibleIconRequests.ts'

const request = (path, isFolder = false) => ({ path, isFolder })

const select = overrides =>
  selectIconRequests({
    requests: [request('C:\\a.txt'), request('C:\\b.txt')],
    icons: new Map(),
    pendingKeys: new Set(),
    attemptsByKey: new Map(),
    maxAttempts: 3,
    batchLimit: 10,
    ...overrides,
  })

test('cache keys ignore case and surrounding whitespace', () => {
  assert.equal(toIconCacheKey('  C:\\Users\\Demo\\A.TXT '), 'c:\\users\\demo\\a.txt')
})

test('signature changes only when the visible set changes', () => {
  const first = [request('C:\\a.txt'), request('C:\\b.txt')]
  assert.equal(buildIconRequestSignature(first), buildIconRequestSignature([...first]))
  assert.notEqual(
    buildIconRequestSignature(first),
    buildIconRequestSignature([request('C:\\b.txt'), request('C:\\a.txt')])
  )
})

test('requests every visible row that has no icon yet', () => {
  assert.deepEqual(
    select({}).map(entry => entry.path),
    ['C:\\a.txt', 'C:\\b.txt']
  )
})

test('skips cached, in-flight, duplicate and empty rows', () => {
  assert.deepEqual(
    select({ icons: new Map([['c:\\a.txt', 'icon']]) }).map(entry => entry.path),
    ['C:\\b.txt']
  )
  assert.deepEqual(
    select({ pendingKeys: new Set(['c:\\a.txt']) }).map(entry => entry.path),
    ['C:\\b.txt']
  )
  assert.deepEqual(
    select({ requests: [request('C:\\a.txt'), request('c:\\A.TXT')] }).map(entry => entry.path),
    ['C:\\a.txt']
  )
  assert.deepEqual(select({ requests: [request('   ')] }), [])
})

test('stops asking once a row has used up its attempts', () => {
  assert.deepEqual(
    select({ attemptsByKey: new Map([['c:\\a.txt', 3]]) }).map(entry => entry.path),
    ['C:\\b.txt']
  )
  assert.deepEqual(
    select({ attemptsByKey: new Map([['c:\\a.txt', 2]]) }).map(entry => entry.path),
    ['C:\\a.txt', 'C:\\b.txt']
  )
})

test('honours the batch limit in viewport order', () => {
  assert.deepEqual(
    select({ batchLimit: 1 }).map(entry => entry.path),
    ['C:\\a.txt']
  )
})

test('carries folder hints through to the batch', () => {
  assert.deepEqual(select({ requests: [request('C:\\Users', true)] }), [
    { path: 'C:\\Users', isFolder: true },
  ])
})

test('merges loaded icons under normalised keys', () => {
  const merged = mergeLoadedIcons({
    icons: new Map(),
    loaded: [{ path: 'C:\\A.txt', iconBase64: 'icon-a' }],
    visibleKeys: new Set(['c:\\a.txt']),
    capacity: 8,
  })

  assert.equal(merged.get('c:\\a.txt'), 'icon-a')
})

test('a batch without usable icons keeps the same map instance', () => {
  const icons = new Map([['c:\\a.txt', 'icon-a']])
  const merged = mergeLoadedIcons({
    icons,
    loaded: [{ path: 'C:\\b.txt', iconBase64: '' }],
    visibleKeys: new Set(),
    capacity: 8,
  })

  assert.equal(merged, icons)
})

test('eviction drops the oldest entries but never a visible row', () => {
  const icons = new Map([
    ['c:\\old.txt', 'icon-old'],
    ['c:\\visible.txt', 'icon-visible'],
  ])
  const merged = mergeLoadedIcons({
    icons,
    loaded: [{ path: 'C:\\new.txt', iconBase64: 'icon-new' }],
    visibleKeys: new Set(['c:\\visible.txt', 'c:\\new.txt']),
    capacity: 2,
  })

  assert.deepEqual([...merged.keys()], ['c:\\visible.txt', 'c:\\new.txt'])
})

test('attempts accumulate for visible rows and reset once a row scrolls away', () => {
  const first = recordIconAttempts({
    attemptsByKey: new Map(),
    requestedKeys: ['c:\\a.txt'],
    visibleKeys: new Set(['c:\\a.txt']),
  })
  assert.equal(first.get('c:\\a.txt'), 1)

  const second = recordIconAttempts({
    attemptsByKey: first,
    requestedKeys: ['c:\\a.txt'],
    visibleKeys: new Set(['c:\\a.txt']),
  })
  assert.equal(second.get('c:\\a.txt'), 2)

  const scrolledAway = recordIconAttempts({
    attemptsByKey: second,
    requestedKeys: [],
    visibleKeys: new Set(['c:\\b.txt']),
  })
  assert.equal(scrolledAway.has('c:\\a.txt'), false)
})
