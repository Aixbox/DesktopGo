import assert from 'node:assert/strict'
import test from 'node:test'
import { getGridItemSpan, getId } from '../model.ts'
import { buildScrollGroupEntries } from './scrollGroupLayout.ts'
import { canPreviewFolderOnOverlap } from '../domain/folderDropIntent.ts'
import { applyFolderCreateFromSession } from '../domain/folderCreation.ts'
import { usePagedDragGeometryController } from '../hooks/usePagedDragGeometryController.ts'
import { usePagedDragMoveProcessor } from '../hooks/usePagedDragMoveProcessor.ts'
import { useScrollableDragGeometryController } from './useScrollableDragGeometryController.ts'
import { useScrollableDragMoveProcessor } from './useScrollableDragMoveProcessor.ts'
import { useScrollableFolderDragController } from './useScrollableFolderDragController.ts'

const ref = current => ({ current })
const noop = () => {}
const environments = new WeakMap()
class Rect {
  constructor(left, top, width, height) {
    Object.assign(this, { left, top, width, height, right: left + width, bottom: top + height })
  }
}

function environment(t) {
  if (environments.has(t)) return environments.get(t)
  let now = 1000,
    sequence = 0
  const timers = new Map()
  const previousWindow = globalThis.window,
    previousRect = globalThis.DOMRect
  t.mock.method(performance, 'now', () => now)
  globalThis.DOMRect = Rect
  globalThis.window = {
    setTimeout(callback, delay) {
      timers.set(++sequence, { callback, due: now + delay })
      return sequence
    },
    clearTimeout: id => timers.delete(id),
    getComputedStyle: node => ({
      width: `${node.rect.width}px`,
      borderTopLeftRadius: '16px',
      getPropertyValue: () => 'round',
    }),
  }
  t.after(() => {
    globalThis.window = previousWindow
    globalThis.DOMRect = previousRect
  })
  const clock = {
    timers,
    advance(ms) {
      const end = now + ms
      while (true) {
        const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0]
        if (!next || next[1].due > end) break
        now = next[1].due
        timers.delete(next[0])
        next[1].callback()
      }
      now = end
    },
  }
  environments.set(t, clock)
  return clock
}

function fixture(size = '1x1', kind = 'icon', sourceSize = '1x1') {
  const source = { kind: 'icon', key: 'source', size: sourceSize, icon: {} }
  const target =
    kind === 'icon'
      ? { kind, key: 'target', size, icon: {} }
      : { kind, id: 'target', size, children: [], name: 'Folder' }
  const items = [source, target]
  const itemById = new Map(items.map(item => [getId(item), item]))
  const entries = buildScrollGroupEntries([getId(target), 'source'], itemById, 4)
  const order = Array(24).fill(null)
  entries.forEach(entry => {
    order[entry.globalIndex] = entry.id
  })
  const span = getGridItemSpan(target)
  const width = span.cols * 100 + (span.cols - 1) * 8
  const height = span.rows * 118 + (span.rows - 1) * 8
  const small = size === '1x1'
  const surfaceRect = small ? new Rect(26, 8, 48, 48) : new Rect(5, 8, width - 10, height - 30)
  const surface = { rect: surfaceRect, getBoundingClientRect: () => surface.rect }
  const tile = {
    rect: new Rect(0, 0, width, height),
    getBoundingClientRect: () => tile.rect,
    querySelector: selector =>
      (
        kind === 'folder'
          ? /data-folder-(body-hitbox|icon-hitbox)/.test(selector)
          : selector === '.icon-image'
      )
        ? surface
        : null,
  }
  const params = {
    gridGap: 8,
    columns: 4,
    rows: 6,
    itemWidth: 100,
    itemHeight: 118,
    iconImageSize: 48,
    folderColumns: 4,
    folderItemWidth: 100,
    folderItemHeight: 118,
    isCompactOuterDrop: true,
    evasionRearmDistance: 7,
    evasionCooldownMs: 200,
    gridRef: ref({ scrollHeight: 756, getBoundingClientRect: () => new Rect(0, 0, 424, 756) }),
    folderGridRef: ref(null),
    dockGridRef: ref(null),
    dockContainerRef: ref(null),
    tileRefs: ref(new Map([[getId(target), tile]])),
    dockSlotRefs: ref(new Map()),
    dockItemRefs: ref(new Map()),
    folderTileRefs: ref(new Map()),
    itemsRef: ref(items),
    itemById,
    outerSlotsRef: ref(order),
    dockKeysRef: ref([]),
    currentPageRef: ref(0),
    pageSizeRef: ref(24),
    dragPointerRef: ref(null),
    compactOuterPreviewItemsRef: ref(null),
    compactOuterPreviewResultRef: ref(null),
    compactOuterDragBaseOrderRef: ref(order),
    compactOuterDragBaseWithoutDraggingRef: ref(order.map(id => (id === 'source' ? null : id))),
    getActiveScrollGroupItemIds: () => [getId(target), 'source'],
  }
  const state = {
    context: 'outer',
    sourceFolderId: null,
    pointerId: 1,
    dragStartedAt: 1000,
    draggingId: 'source',
    draggingIds: ['source'],
    draggingItem: source,
    pointerX: 50,
    pointerY: 32,
    offsetX: 50,
    offsetY: 59,
    workingOrder: [...order],
    scrollGroupOrder: [getId(target), 'source'],
    sourceSlotIndex: order.indexOf('source'),
    previewSlotIndex: null,
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
  }
  return { params, state, source, target, items, surfaceRect, surface, tile }
}

function harness(t, { mode = 'compact', size, kind, sourceSize } = {}) {
  const clock = environment(t)
  const f = fixture(size, kind, sourceSize)
  const dragRef = ref({
    ...f.state,
    scrollGroupOrder: mode === 'compact' ? f.state.scrollGroupOrder : null,
  })
  const params = { ...f.params, isCompactOuterDrop: mode === 'compact' }
  const geometry =
    mode === 'paged'
      ? usePagedDragGeometryController(params)
      : useScrollableDragGeometryController(params)
  const opened = [],
    reordered = []
  const outerDwellTimerRef = ref(null),
    outerDwellTargetIdRef = ref(null)
  const outerDwellZoneRef = ref(null),
    outerDwellIntentRef = ref(null)
  const folderAutoOpenTimerRef = ref(null),
    folderAutoOpenTargetIdRef = ref(null)
  const clearTimer = (timerRef, ...related) => {
    window.clearTimeout(timerRef.current)
    timerRef.current = null
    related.forEach(value => {
      value.current = null
    })
  }
  const clearOuterDwellTimer = () =>
    clearTimer(outerDwellTimerRef, outerDwellTargetIdRef, outerDwellZoneRef, outerDwellIntentRef)
  const clearFolderAutoOpenTimer = () =>
    clearTimer(folderAutoOpenTimerRef, folderAutoOpenTargetIdRef)
  const publishMoveDragState = next => {
    if (
      folderAutoOpenTargetIdRef.current &&
      (next?.context !== 'outer' ||
        next.hoverZone !== 'center' ||
        next.folderPreviewTargetId !== folderAutoOpenTargetIdRef.current)
    )
      clearFolderAutoOpenTimer()
    dragRef.current = next
  }
  const runtime = {
    ...params,
    ...geometry,
    dragRef,
    publishMoveDragState,
    syncDragRuntime: publishMoveDragState,
    commitDragState: publishMoveDragState,
    clearOuterDwellTimer,
    clearFolderAutoOpenTimer,
    outerDwellTimerRef,
    outerDwellTargetIdRef,
    outerDwellZoneRef,
    outerDwellIntentRef,
    folderAutoOpenTimerRef,
    folderAutoOpenTargetIdRef,
    folderExitTimerRef: ref(null),
    dragStartedInFolderRef: ref(false),
    enteredFolderContentRef: ref(false),
    dragPointerCaptureTargetRef: ref(null),
    containerRef: ref(null),
    folderPanelRef: ref(null),
    evasionDwellMs: 400,
    clearFolderExitTimer: noop,
    clearEdgeSwitchTimer: noop,
    maybeHandleOuterEdgeSwitch: noop,
    onOpenFolder: id => opened.push(id),
    setOpenFolderId: noop,
    commitIntoExistingFolderForAutoOpen: () => [f.source],
  }
  const folder = useScrollableFolderDragController(runtime)
  const process = (mode === 'paged' ? usePagedDragMoveProcessor : useScrollableDragMoveProcessor)({
    ...runtime,
    ...folder,
    triggerTopLevelDwellEvasion: (...args) => {
      reordered.push(args)
      if (mode !== 'paged') folder.triggerTopLevelDwellEvasion(...args)
    },
  })
  return {
    ...f,
    ...clock,
    geometry,
    dragRef,
    opened,
    reordered,
    move(x, y) {
      params.dragPointerRef.current = { pointerX: x, pointerY: y }
      process(1, x, y)
    },
    commit() {
      return applyFolderCreateFromSession(f.items, dragRef.current)
    },
    cancel() {
      clearOuterDwellTimer()
      publishMoveDragState(null)
    },
  }
}

for (const size of ['1x1', '1x2', '2x1', '2x2']) {
  test(`${size}: scroll and paged overlap geometry agree from every direction, regardless of grab offset`, t => {
    environment(t)
    const f = fixture(size)
    const paged = usePagedDragGeometryController(f.params)
    const scroll = useScrollableDragGeometryController(f.params)
    const r = f.surfaceRect
    const center = [r.left + r.width / 2, r.top + r.height / 2]
    for (const [x, y] of [
      [r.left - 2, center[1]],
      [r.right + 2, center[1]],
      [center[0], r.top - 2],
      [center[0], r.bottom + 2],
      center,
    ]) {
      const expected = paged.findTopLevelMaxOverlapHit({ ...f.state, pointerX: x, pointerY: y })
      for (const [offsetX, offsetY] of [
        [0, 0],
        [50, 59],
        [99, 117],
      ]) {
        const actual = scroll.findTopLevelMaxOverlapHit({
          ...f.state,
          pointerX: x,
          pointerY: y,
          offsetX,
          offsetY,
        })
        assert.equal(actual?.targetId, expected?.targetId)
        assert.equal(actual?.iou, expected?.iou)
        assert.equal(canPreviewFolderOnOverlap(f.source, f.target, actual, false), true)
      }
    }
  })
  test(`${size}: immediate merge preserves target footprint on release in both modes`, t => {
    for (const mode of ['paged', 'scroll', 'compact']) {
      const h = harness(t, { mode, size })
      h.move(h.surfaceRect.left - 2, h.surfaceRect.top + h.surfaceRect.height / 2)
      assert.equal(h.dragRef.current.folderPreviewTargetId, 'target')
      assert.equal(h.timers.size, 0, 'no pre-merge delay or pending evasion')
      const result = h.commit()
      assert.equal(result.items.length, 1)
      assert.equal(result.items[0].kind, 'folder')
      assert.equal(result.items[0].size, size)
      assert.deepEqual(result.items[0].children.map(getId), ['target', 'source'])
      assert.equal(result.slots[0], getId(result.items[0]))
    }
  })
  test(`${size}: existing scroll folder opens exactly 500ms after entering the 75% region`, t => {
    const h = harness(t, { size, kind: 'folder' })
    const r = h.surfaceRect
    h.move(r.left + r.width * 0.2, r.top + r.height / 2)
    assert.equal(h.dragRef.current.folderPreviewTargetId, 'folder:target')
    assert.equal(h.timers.size, 1)
    h.advance(499)
    assert.deepEqual(h.opened, [])
    h.advance(1)
    assert.deepEqual(h.opened, ['target'])
    assert.equal(h.dragRef.current.context, 'folder')
  })
}

test('45% overlap boundary and 400ms evasion use the same rules in both modes', t => {
  for (const mode of ['paged', 'scroll', 'compact']) {
    const h = harness(t, { mode })
    h.move(23.59, 32) // (23.59 + 24 - 26) / 48 < 0.45
    assert.equal(h.dragRef.current.folderPreviewTargetId, null)
    h.advance(399)
    assert.equal(h.reordered.length, 0)
    h.move(23.61, 32)
    assert.equal(h.dragRef.current.folderPreviewTargetId, 'target')
    h.advance(500)
    assert.equal(h.reordered.length, 0, 'merge cancels the pending evasion')
    h.move(23.59, 32)
    assert.equal(h.dragRef.current.folderPreviewTargetId, null)
    h.advance(399)
    assert.equal(h.reordered.length, 0)
    h.advance(1)
    assert.equal(h.reordered.length, 1)
  }
})

test('scroll hit geometry remains at the layout anchor while neighbors animate', t => {
  const h = harness(t)
  const before = h.geometry.findTopLevelMaxOverlapHit(h.state)
  h.tile.rect = new Rect(80, 40, 100, 118)
  h.surface.rect = new Rect(106, 48, 48, 48)
  const during = h.geometry.findTopLevelMaxOverlapHit(h.state)
  assert.deepEqual(during, before)
})

test('leaving and re-entering the folder area restarts 500ms; its rounded corners do not open', t => {
  const h = harness(t, { size: '2x2', kind: 'folder' })
  const r = h.surfaceRect
  h.move(r.left + r.width * 0.2, r.top + r.height / 2)
  h.advance(400)
  h.move(r.left + r.width * 0.126, r.top + r.height * 0.126)
  assert.notEqual(h.dragRef.current.hoverZone, 'center')
  h.advance(500)
  assert.deepEqual(h.opened, [])
  h.move(r.left + r.width * 0.2, r.top + r.height / 2)
  h.advance(499)
  assert.deepEqual(h.opened, [])
  h.advance(1)
  assert.deepEqual(h.opened, ['target'])
})

test('cancel clears a pending auto-open and multiple icons cannot create a new folder', t => {
  const h = harness(t, { kind: 'folder' })
  h.move(50, 32)
  h.cancel()
  h.advance(1000)
  assert.deepEqual(h.opened, [])
  const multi = harness(t)
  multi.dragRef.current.draggingIds.push('other')
  multi.move(50, 32)
  assert.equal(multi.dragRef.current.folderPreviewTargetId, null)
})

test('large dragged icon can open a small folder by its center without a 45% overlap requirement', t => {
  for (const mode of ['paged', 'scroll', 'compact']) {
    const h = harness(t, { mode, kind: 'folder', sourceSize: '2x2' })
    h.move(50, 32)
    assert.ok(h.dragRef.current.hoverIou < 0.45)
    h.advance(500)
    assert.deepEqual(h.opened, ['target'])
  }
})

test('merge wins over the reorder movement lock and dropping outside the target clears it', t => {
  const h = harness(t)
  Object.assign(h.dragRef.current, {
    hoverTargetId: 'old-target',
    lastEvasionTriggerPointer: { x: 50, y: 32 },
    lastEvasionAt: performance.now(),
  })
  h.move(51, 32)
  assert.equal(h.dragRef.current.folderPreviewTargetId, 'target')
  h.move(350, 600)
  assert.equal(h.dragRef.current.folderPreviewTargetId, null)
  assert.deepEqual(h.commit().items, h.items, 'release must not commit the previous merge')
})

test('offscreen icons do not add DOM measurements to scroll hit testing', t => {
  environment(t)
  const f = fixture()
  let measured = 0
  for (let i = 0; i < 200; i++) {
    const item = { kind: 'icon', key: `extra-${i}`, icon: {} }
    f.items.push(item)
    f.params.itemById.set(item.key, item)
    f.state.scrollGroupOrder.push(item.key)
    f.params.tileRefs.current.set(item.key, {
      getBoundingClientRect() {
        measured++
        return new Rect(0, 0, 100, 118)
      },
      querySelector: () => null,
    })
  }
  const geometry = useScrollableDragGeometryController(f.params)
  const hit = geometry.findTopLevelMaxOverlapHit(f.state)
  assert.equal(hit.targetId, 'target')
  assert.equal(measured, 0)
})
