import assert from 'node:assert/strict'
import test from 'node:test'
import { getGridItemSpan, getId } from '../model.ts'
import { OUTER_DRAG_RULES } from '../constants.ts'
import { getFootprintIndices, buildTopLevelOccupancy } from '../domain/topLevelLayout.ts'
import { applyOuterDropFromSession } from '../domain/dropPolicy.ts'
import { usePagedDragGeometryController } from './usePagedDragGeometryController.ts'
import { usePagedDragMoveProcessor } from './usePagedDragMoveProcessor.ts'
import { useTopLevelDwellEvasion } from './useTopLevelDwellEvasion.ts'

class TestRect {
  constructor(x, y, width, height) {
    Object.assign(this, {
      x,
      y,
      left: x,
      top: y,
      width,
      height,
      right: x + width,
      bottom: y + height,
    })
  }
}

const ref = current => ({ current })

function installTestEnvironment(t) {
  let now = 1000
  let timerId = 0
  const timers = new Map()
  t.mock.method(performance, 'now', () => now)
  const previousWindow = globalThis.window
  const previousRect = globalThis.DOMRect
  globalThis.DOMRect = TestRect
  globalThis.window = {
    setTimeout: (callback, delay) => {
      timers.set(++timerId, { callback, due: now + delay })
      return timerId
    },
    clearTimeout: id => timers.delete(id),
  }
  t.after(() => {
    globalThis.window = previousWindow
    globalThis.DOMRect = previousRect
  })
  return {
    timers,
    advance(ms = OUTER_DRAG_RULES.evasionDwellMs) {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.due > now) continue
        timers.delete(id)
        timer.callback()
      }
    },
  }
}

function createGridFixture(size, neighbors) {
  const folder = { kind: 'folder', id: 'source', name: 'Folder', size, children: [] }
  const items = [folder, ...neighbors.map(([, item]) => item)]
  const baseOrder = Array(36).fill(null)
  neighbors.forEach(([index, item]) => {
    baseOrder[index] = getId(item)
  })
  const storedOrder = [...baseOrder]
  storedOrder[24] = getId(folder)
  const params = {
    gridGap: 0,
    evasionCooldownMs: 200,
    columns: 6,
    rows: 6,
    itemWidth: 100,
    itemHeight: 100,
    folderColumns: 4,
    folderItemWidth: 100,
    folderItemHeight: 100,
    iconImageSize: 100,
    gridRef: ref({ getBoundingClientRect: () => new TestRect(0, 0, 600, 600) }),
    folderGridRef: ref(null),
    dockContainerRef: ref(null),
    dockGridRef: ref(null),
    tileRefs: ref(new Map()),
    dockSlotRefs: ref(new Map()),
    dockItemRefs: ref(new Map()),
    itemsRef: ref(items),
    itemById: new Map(items.map(item => [getId(item), item])),
    outerSlotsRef: ref(storedOrder),
    dockKeysRef: ref([]),
    currentPageRef: ref(0),
    pageSizeRef: ref(36),
  }
  return { folder, items, baseOrder, storedOrder, params }
}

function createDragSession(folder, baseOrder) {
  return ref({
    context: 'outer',
    sourceFolderId: null,
    pointerId: 1,
    dragStartedAt: performance.now(),
    draggingId: getId(folder),
    draggingItem: folder,
    draggingIds: [getId(folder)],
    pointerX: 50,
    pointerY: 450,
    offsetX: 50,
    offsetY: 50,
    workingOrder: [...baseOrder],
    sourceSlotIndex: 24,
    previewSlotIndex: 24,
    dockPreviewIndex: null,
    hoverTargetId: null,
    hoverZone: null,
    hoverIou: 0,
    centerStartedAt: null,
    dwellStartedAt: null,
    folderPreviewTargetId: null,
    lastEvasionSignature: null,
    lastEvasionTriggerPointer: null,
    lastEvasionAt: null,
    initialCenters: {},
  })
}

// Exercise the production hit-testing, alarms and placement solver without a browser.
function createHarness(t, size, neighbors = [[8, { kind: 'icon', key: 'b', icon: {} }]]) {
  const clock = installTestEnvironment(t)
  const { folder, items, baseOrder, storedOrder, params } = createGridFixture(size, neighbors)
  const dragRef = createDragSession(folder, baseOrder)
  const outerDwellTimerRef = ref(null)
  const outerDwellIntentRef = ref(null)
  const publishMoveDragState = state => {
    dragRef.current = state
  }
  const geometry = usePagedDragGeometryController(params)
  const triggerTopLevelDwellEvasion = useTopLevelDwellEvasion({
    ...params,
    ...geometry,
    dragRef,
    publishMoveDragState,
  })
  const move = usePagedDragMoveProcessor({
    ...params,
    ...geometry,
    dragRef,
    publishMoveDragState,
    triggerTopLevelDwellEvasion,
    evasionRearmDistance: 7,
    evasionDwellMs: OUTER_DRAG_RULES.evasionDwellMs,
    outerDwellTimerRef,
    outerDwellIntentRef,
    folderPanelRef: ref(null),
    enteredFolderContentRef: ref(false),
    scheduleFolderExit() {},
    clearFolderExitTimer() {},
    maybeHandleOuterEdgeSwitch() {},
    clearEdgeSwitchTimer() {},
    scheduleFolderAutoOpen() {},
    clearOuterDwellTimer() {
      clock.timers.delete(outerDwellTimerRef.current)
      outerDwellTimerRef.current = null
      outerDwellIntentRef.current = null
    },
    moveDragToTopLevelContext: state => state,
  })
  const span = getGridItemSpan(folder)
  return {
    baseOrder,
    storedOrder,
    dragRef,
    params,
    ...clock,
    moveTo: anchor =>
      move(
        1,
        ((anchor % 6) + span.cols / 2) * 100,
        (Math.floor((anchor % 36) / 6) + span.rows / 2) * 100
      ),
    commit: () =>
      applyOuterDropFromSession({
        base: items,
        session: dragRef.current,
        pageSize: 36,
        columns: 6,
        sourceSlots: storedOrder,
        resolveNearestSlotIndexByContext: geometry.resolveNearestSlotIndexByContext,
      }),
  }
}

for (const size of ['1x1', '1x2', '2x1', '2x2']) {
  for (const dwellInClearedArea of [false, true]) {
    test(`${size}: keep evasion in cleared area and restore on leaving (dwell=${dwellInClearedArea})`, t => {
      const h = createHarness(t, size)
      h.moveTo(8)
      h.advance(OUTER_DRAG_RULES.evasionDwellMs - 1)
      assert.deepEqual(h.dragRef.current.workingOrder, h.baseOrder, 'dwell threshold still applies')
      h.advance(1)
      assert.notEqual(h.dragRef.current.workingOrder.indexOf('b'), 8, 'neighbor must evade')
      const displaced = [...h.dragRef.current.workingOrder]
      h.moveTo(8)
      if (dwellInClearedArea) h.advance()
      assert.deepEqual(
        h.dragRef.current.workingOrder,
        displaced,
        'neighbor stays out while covered'
      )
      h.moveTo(24)
      h.advance()
      assert.deepEqual(
        h.dragRef.current.workingOrder,
        h.baseOrder,
        'leaving restores original layout'
      )
      assert.equal(h.dragRef.current.evasionBaseOrder, null)
      assert.equal(h.dragRef.current.previewSlotIndex, 24)
      assert.deepEqual(
        h.params.outerSlotsRef.current,
        h.storedOrder,
        'preview never persists moves'
      )
      assert.deepEqual(
        h.commit().slots,
        h.storedOrder,
        'drop after returning keeps original neighbors'
      )
    })
  }
}

test('2x2: leaving the anchor cell while still covering a neighbor must keep it displaced', t => {
  const h = createHarness(t, '2x2')
  h.moveTo(8)
  h.advance()
  h.moveTo(7)
  h.advance()
  const footprint = getFootprintIndices(7, { cols: 2, rows: 2 }, 6, 36)
  assert.ok(!footprint.includes(h.dragRef.current.workingOrder.indexOf('b')))
  h.moveTo(24)
  h.advance()
  assert.deepEqual(h.dragRef.current.workingOrder, h.baseOrder)
})

test('2x2: all occupied cells, including the bottom-right cell, are restored together', t => {
  const neighbors = [8, 9, 14, 15].map(index => [
    index,
    { kind: 'icon', key: `icon-${index}`, icon: {} },
  ])
  const h = createHarness(t, '2x2', neighbors)
  h.moveTo(8)
  h.advance()
  const preview = [...h.dragRef.current.workingOrder]
  neighbors.forEach(([index, item]) => assert.notEqual(preview.indexOf(item.key), index))
  h.moveTo(8)
  h.advance()
  assert.deepEqual(h.dragRef.current.workingOrder, preview)
  assert.equal(h.timers.size, 0, 'unchanged footprint must not repeatedly arm alarms')
  h.moveTo(24)
  h.advance()
  assert.deepEqual(h.dragRef.current.workingOrder, h.baseOrder)
})

test('2x2: a non-anchor cell can trigger evasion without resetting the folder alarm identity', t => {
  const h = createHarness(t, '2x2', [[15, { kind: 'icon', key: 'b', icon: {} }]])
  h.moveTo(8)
  h.advance()
  assert.equal(h.dragRef.current.lastReorderCellIndex, 8)
  assert.equal(h.dragRef.current.hoverTargetIndex, 8)
  h.moveTo(8)
  assert.equal(h.timers.size, 0)
  h.moveTo(24)
  h.advance()
  assert.deepEqual(h.dragRef.current.workingOrder, h.baseOrder)
})

test('2x2: switching targets restores the old neighbor and only commits the current preview', t => {
  const h = createHarness(t, '2x2', [
    [8, { kind: 'icon', key: 'b', icon: {} }],
    [16, { kind: 'icon', key: 'c', icon: {} }],
  ])
  h.moveTo(8)
  h.advance()
  h.moveTo(16)
  h.advance()
  assert.equal(h.dragRef.current.workingOrder.indexOf('b'), 8)
  assert.notEqual(h.dragRef.current.workingOrder.indexOf('c'), 16)
  assert.deepEqual(h.dragRef.current.evasionBaseOrder, h.baseOrder)
  const committed = h.commit()
  assert.equal(committed.slots.indexOf('folder:source'), 16)
  assert.equal(committed.slots.indexOf('b'), 8)
  const occupancy = buildTopLevelOccupancy(committed.slots, committed.items, 6, 36)
  for (const index of [16, 17, 22, 23]) assert.equal(occupancy.cells[index], 'folder:source')
})

test('return alarm uses the latest pointer when the folder re-enters before it fires', t => {
  const h = createHarness(t, '2x2')
  h.moveTo(8)
  h.advance()
  h.moveTo(24)
  h.advance(100)
  h.moveTo(8)
  h.advance(300)
  assert.notEqual(h.dragRef.current.workingOrder.indexOf('b'), 8)
  h.moveTo(24)
  h.advance()
  assert.deepEqual(h.dragRef.current.workingOrder, h.baseOrder)
})

test('a displaced multi-cell folder returns with its full footprint', t => {
  const neighbor = { kind: 'folder', id: 'neighbor', name: 'Other', size: '2x2', children: [] }
  const h = createHarness(t, '2x2', [[8, neighbor]])
  h.moveTo(8)
  h.advance()
  assert.notEqual(h.dragRef.current.workingOrder.indexOf('folder:neighbor'), 8)
  h.moveTo(24)
  h.advance()
  assert.deepEqual(h.dragRef.current.workingOrder, h.baseOrder)
})

test('moving to another page restores the previous page before solving the new target', t => {
  const h = createHarness(t, '2x2', [
    [8, { kind: 'icon', key: 'b', icon: {} }],
    [44, { kind: 'icon', key: 'c', icon: {} }],
  ])
  h.moveTo(8)
  h.advance()
  h.params.currentPageRef.current = 1
  h.moveTo(44)
  h.advance()
  assert.equal(h.dragRef.current.workingOrder.indexOf('b'), 8)
  assert.notEqual(h.dragRef.current.workingOrder.indexOf('c'), 44)
})

test('restoring neighbors preserves a new empty page and commits the folder on that page', t => {
  const h = createHarness(t, '2x2')
  h.moveTo(8)
  h.advance()
  // Match the temporary page expansion performed by useEdgeAutoPaging.
  h.dragRef.current = {
    ...h.dragRef.current,
    workingOrder: [...h.dragRef.current.workingOrder, ...Array(36).fill(null)],
  }
  h.params.currentPageRef.current = 1
  h.moveTo(44)
  h.advance()
  assert.equal(h.dragRef.current.workingOrder.indexOf('b'), 8)
  assert.equal(h.dragRef.current.workingOrder.length, 72, 'the active temporary page must survive')
  assert.equal(h.dragRef.current.previewSlotIndex, 44)
  const committed = h.commit()
  assert.equal(committed.slots.indexOf('folder:source'), 44)
  assert.equal(committed.slots.indexOf('b'), 8)
})
