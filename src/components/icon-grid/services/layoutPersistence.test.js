import assert from 'node:assert/strict'
import test from 'node:test'
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks'
import { setLayoutHistoryPaused } from '../../layout-library/layoutLibrary.ts'
import { buildCanonicalPlacements } from '../domain/canonicalLayout.ts'
import { validatePersistedLayout } from '../domain/layoutValidation.ts'
import { repairLegacyCanonicalPages } from '../domain/legacyCanonicalPageMigration.ts'
import {
  calculateLayoutChecksum,
  parsePersistedLayoutStrict,
  hydrateLayout,
} from './layoutStore.ts'

function fixture() {
  const items = [
    {
      type: 'folder',
      id: 'work',
      name: 'Work',
      size: '2x2',
      children: ['child-a', 'child-b', 'child-c'],
    },
    { type: 'icon', key: 'page-two' },
    { type: 'icon', key: 'page-three' },
    { type: 'icon', key: 'dock-app' },
  ]
  const slots = Array(24).fill(null)
  slots[0] = 'folder:work'
  slots[8] = 'page-two'
  slots[19] = 'page-three'
  const icons = ['child-a', 'child-b', 'child-c', 'page-two', 'page-three', 'dock-app'].map(id => ({
    id,
    name: id,
    path: id,
    target_path: id,
    icon_base64: '',
    item_type: 'shortcut',
    origin: 'import',
  }))
  return {
    icons,
    layout: {
      items,
      slots,
      dockKeys: ['dock-app'],
      pageSize: 8,
      columns: 4,
      revision: 7,
      coordinates: [
        {
          id: 'folder:work',
          cells: [
            { page: 0, row: 0, col: 0 },
            { page: 0, row: 0, col: 1 },
            { page: 0, row: 1, col: 0 },
            { page: 0, row: 1, col: 1 },
          ],
        },
        { id: 'page-two', cells: [{ page: 1, row: 0, col: 0 }] },
        { id: 'page-three', cells: [{ page: 2, row: 0, col: 3 }] },
      ],
    },
  }
}

function payload(layout) {
  return JSON.stringify({ version: 10, ...layout, checksum: calculateLayoutChecksum(layout) })
}

function legacyBrokenLayout() {
  const { layout } = fixture()
  return {
    ...layout,
    placements: buildCanonicalPlacements({ ...layout, pageSize: layout.slots.length }),
  }
}

test('canonical writer keeps each page within its declared capacity', () => {
  const { layout, icons } = fixture()
  const canonical = { ...layout, placements: buildCanonicalPlacements(layout) }
  assert.equal(validatePersistedLayout(canonical).valid, true)
  const second = canonical.placements.find(p => p.id === 'page-two')
  const third = canonical.placements.find(p => p.id === 'page-three')
  assert.deepEqual([second.page, second.row, second.col], [1, 0, 0])
  assert.deepEqual([third.page, third.row, third.col], [2, 0, 3])
  const restored = hydrateLayout(icons, parsePersistedLayoutStrict(payload(canonical), 'paged'))
  assert.deepEqual(restored.layout.slots, layout.slots)
  const folder = restored.items.find(item => item.kind === 'folder')
  assert.equal(folder.size, '2x2')
  assert.deepEqual(
    folder.children.map(child => child.key),
    layout.items[0].children
  )
})

test('exact legacy oversized-page output is repaired without moving original slots or folders', () => {
  const broken = legacyBrokenLayout()
  assert.equal(validatePersistedLayout(broken).valid, false)
  const before = structuredClone(broken)
  const repaired = parsePersistedLayoutStrict(payload(broken), 'paged')
  assert.equal(validatePersistedLayout(repaired).valid, true)
  assert.deepEqual(repaired.items, broken.items)
  assert.deepEqual(repaired.slots, broken.slots)
  assert.deepEqual(repaired.coordinates, broken.coordinates)
  assert.deepEqual(repaired.dockKeys, broken.dockKeys)
  assert.equal(repaired.checksum, calculateLayoutChecksum(repaired))
  assert.deepEqual(broken, before)
})

test('recovery rejects checksum damage, unrelated coordinates and invalid source references', () => {
  const broken = legacyBrokenLayout()
  const damaged = JSON.parse(payload(broken))
  damaged.items[0].name = 'Changed without checksum'
  assert.throws(
    () => parsePersistedLayoutStrict(JSON.stringify(damaged), 'paged'),
    /checksum mismatch/
  )
  const unrelated = structuredClone(broken)
  unrelated.placements[1].row += 1
  assert.equal(repairLegacyCanonicalPages(unrelated), unrelated)
  assert.throws(
    () => parsePersistedLayoutStrict(payload(unrelated), 'paged'),
    /Invalid persisted layout/
  )
  const invalidSource = {
    ...broken,
    slots: broken.slots.map((id, index) => (index === 1 ? 'folder:work' : id)),
  }
  assert.equal(repairLegacyCanonicalPages(invalidSource), invalidSource)
  assert.throws(
    () => parsePersistedLayoutStrict(payload(invalidSource), 'paged'),
    /Invalid persisted layout/
  )
})

function mockDatabase(t, initialEntries = []) {
  const previousWindow = globalThis.window
  globalThis.window = {}
  const entries = new Map(initialEntries),
    writes = []
  setLayoutHistoryPaused(true)
  mockIPC((command, args) => {
    if (command === 'get_layout_payload') return entries.get(args.key) ?? null
    if (command === 'set_layout_payload') {
      entries.set(args.key, args.payload)
      writes.push(args)
      return
    }
    throw new Error(`Unexpected command: ${command}`)
  })
  t.after(() => {
    clearMocks()
    globalThis.window = previousWindow
    setLayoutHistoryPaused(false)
  })
  return { entries, writes }
}

for (const scope of ['paged', 'scroll']) {
  test(`${scope}: saving a folder survives a fresh persistence module and hydration`, async t => {
    const db = mockDatabase(t)
    const first = await import(`./layoutStore.ts?save-${scope}`)
    const { layout, icons } = fixture()
    const items = hydrateLayout(icons, layout).items
    await first.writeLayout(items, layout.slots, layout.dockKeys, 8, 4, undefined, undefined, scope)
    assert.equal(db.writes.length, 1)
    const coldStart = await import(`./layoutStore.ts?restart-${scope}`)
    const restored = coldStart.hydrateLayout(icons, await coldStart.readLayoutStrict(scope))
    assert.deepEqual(restored.layout.slots, layout.slots)
    assert.equal(restored.items.find(item => item.kind === 'folder').children.length, 3)
    assert.equal(restored.layout.pageSize, 8)
  })

  test(`${scope}: recovered content is saved once, not lost to the write deduplication cache`, async t => {
    const key =
      scope === 'paged' ? 'desktopgo.launchpad.layout.v1' : 'desktopgo.launchpad.layout.scroll.v1'
    const db = mockDatabase(t, [[key, payload(legacyBrokenLayout())]])
    const store = await import(`./layoutStore.ts?recover-${scope}`)
    const recovered = await store.readLayoutStrict(scope)
    assert.equal(store.getLayoutHydrationDiagnostic(scope), null)
    await store.writePersistedLayout(recovered, scope)
    assert.equal(db.writes.length, 1)
    const saved = JSON.parse(db.entries.get(key))
    assert.equal(saved.revision, 8)
    assert.equal(validatePersistedLayout(saved).valid, true)
    await store.writePersistedLayout(recovered, scope)
    assert.equal(db.writes.length, 1)
    const coldStart = await import(`./layoutStore.ts?recovered-restart-${scope}`)
    assert.deepEqual((await coldStart.readLayoutStrict(scope)).items, recovered.items)
  })
}

test('invalid writes cannot overwrite a previously saved layout', async t => {
  const db = mockDatabase(t)
  const store = await import('./layoutStore.ts?invalid-write')
  const { layout } = fixture()
  await store.writePersistedLayout(layout, 'paged')
  const saved = db.writes[0].payload
  const invalid = {
    ...layout,
    slots: [...layout.slots],
    columns: 1,
    pageSize: 1,
    coordinates: undefined,
  }
  await assert.rejects(
    store.writePersistedLayout(invalid, 'paged'),
    /Refusing to persist invalid layout/
  )
  assert.equal(db.writes.length, 1)
  assert.equal(db.entries.get('desktopgo.launchpad.layout.v1'), saved)
  assert.match(store.getLayoutWriteDiagnostic('paged').error, /invalid layout/)
  await store.writePersistedLayout(layout, 'paged')
  assert.equal(store.getLayoutWriteDiagnostic('paged'), null)
})
