import assert from 'node:assert/strict'
import test from 'node:test'
import { getGridItemSpan, getId } from '../model.ts'
import { buildScrollGroupEntries, commitScrollGroupDragResult } from './scrollGroupLayout.ts'
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

function harness(t, { mode = 'compact', size, kind, sourceSize, configure = noop } = {}) {
  const clock = environment(t)
  const f = fixture(size, kind, sourceSize)
  configure(f)
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
    triggerReorder: folder.triggerTopLevelDwellEvasion,
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
        assert.equal(
          canPreviewFolderOnOverlap(f.source, f.target, actual, false),
          x === r.right + 2 || (x === center[0] && y === center[1]),
          'only the near (right) edge and center keep the shared overlap merge policy'
        )
      }
    }
  })
  test(`${size}: immediate merge preserves target footprint on release in both modes`, t => {
    for (const mode of ['paged', 'scroll', 'compact']) {
      const h = harness(t, { mode, size })
      h.move(
        h.surfaceRect.left + h.surfaceRect.width / 2,
        h.surfaceRect.top + h.surfaceRect.height / 2
      )
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

test('legacy paged overlap remains 45% with 400ms evasion', t => {
  for (const mode of ['paged', 'scroll']) {
    const dwell = 400
    const h = harness(t, { mode })
    h.move(23.59, 32) // (23.59 + 24 - 26) / 48 < 0.45
    assert.equal(h.dragRef.current.folderPreviewTargetId, null)
    h.advance(dwell - 1)
    assert.equal(h.reordered.length, 0)
    h.move(23.61, 32)
    assert.equal(h.dragRef.current.folderPreviewTargetId, 'target')
    h.advance(500)
    assert.equal(h.reordered.length, 0, 'merge cancels the pending evasion')
    h.move(23.59, 32)
    assert.equal(h.dragRef.current.folderPreviewTargetId, null)
    h.advance(dwell - 1)
    assert.equal(h.reordered.length, 0)
    h.advance(1)
    assert.equal(h.reordered.length, 1)
  }
})

for (const size of ['1x1', '1x2', '2x1', '2x2']) {
  test(`${size}: three 20% edges reorder; only the near edge allows merging`, t => {
    for (const [rx, ry] of [
      [0.1, 0.5],
      [0.9, 0.5],
      [0.5, 0.1],
      [0.5, 0.9],
    ]) {
      const h = harness(t, { size })
      const r = h.surfaceRect
      h.move(r.left + r.width * rx, r.top + r.height * ry)
      assert.ok(h.dragRef.current.hoverIou >= 0.45)
      if (rx === 0.9) {
        assert.equal(h.dragRef.current.folderPreviewTargetId, 'target')
        h.advance(500)
        assert.equal(h.reordered.length, 0)
        continue
      }
      assert.equal(h.dragRef.current.folderPreviewTargetId, null)
      assert.deepEqual(h.commit().items, h.items, 'releasing on an edge must not create a folder')
      h.advance(159)
      assert.equal(h.reordered.length, 0)
      h.advance(1)
      assert.equal(h.reordered.length, 1)
    }
  })
}

test('entering the central 60% cancels evasion; returning to the far edge clears folder preview', t => {
  const h = harness(t)
  const r = h.surfaceRect
  h.move(r.left + r.width * 0.199, r.top + r.height / 2)
  h.advance(100)
  h.move(r.left + r.width * 0.201, r.top + r.height / 2)
  assert.equal(h.dragRef.current.folderPreviewTargetId, 'target')
  h.advance(300)
  assert.equal(h.reordered.length, 0)
  h.move(r.left + r.width * 0.199, r.top + r.height / 2)
  assert.equal(h.dragRef.current.folderPreviewTargetId, null)
  h.advance(159)
  assert.equal(h.reordered.length, 0)
  h.advance(1)
  assert.equal(h.reordered.length, 1)
})

function setDragDirection(f, direction) {
  const horizontal = direction === 'left' || direction === 'right'
  const span = getGridItemSpan(f.target)
  const columns = horizontal ? 4 : span.cols
  const order =
    direction === 'left' || direction === 'up' ? ['target', 'source'] : ['source', 'target']
  const entries = buildScrollGroupEntries(order, f.params.itemById, columns)
  const target = entries.find(entry => entry.id === 'target')
  const left = target.col * 108,
    top = target.row * 126
  const r = f.surfaceRect
  f.surfaceRect = new Rect(r.left + left, r.top + top, r.width, r.height)
  f.surface.rect = f.surfaceRect
  f.tile.rect = new Rect(left, top, f.tile.rect.width, f.tile.rect.height)
  const slots = Array(24).fill(null)
  entries.forEach(entry => {
    slots[entry.globalIndex] = entry.id
  })
  f.params.columns = columns
  f.params.outerSlotsRef.current = slots
  f.params.compactOuterDragBaseOrderRef.current = slots
  f.params.compactOuterDragBaseWithoutDraggingRef.current = slots.map(id =>
    id === 'source' ? null : id
  )
  f.params.getActiveScrollGroupItemIds = () => order
  Object.assign(f.state, {
    scrollGroupOrder: order,
    workingOrder: [...slots],
    sourceSlotIndex: slots.indexOf('source'),
  })
}

for (const direction of ['left', 'right', 'up', 'down']) {
  test(`${direction}: all three outer 8px tolerances survive grid scaling and deep scrolling`, t => {
    const scale = 0.97,
      top = -3500
    const h = harness(t, {
      configure(f) {
        setDragDirection(f, direction)
        f.params.iconImageSize = 8
        const r = f.surfaceRect,
          tile = f.tile.rect
        f.surfaceRect = new Rect(
          r.left * scale,
          top + r.top * scale,
          r.width * scale,
          r.height * scale
        )
        f.surface.rect = f.surfaceRect
        f.tile.rect = new Rect(
          tile.left * scale,
          top + tile.top * scale,
          tile.width * scale,
          tile.height * scale
        )
        f.params.gridRef.current = {
          offsetWidth: 424,
          getBoundingClientRect: () => new Rect(0, top, 424 * scale, 756 * scale),
        }
      },
    })
    const r = h.surfaceRect
    const horizontal = direction === 'left' || direction === 'right'
    const forward = direction === 'right' || direction === 'down'
    const farPoint = outset =>
      horizontal
        ? [forward ? r.right + outset : r.left - outset, r.top + r.height / 2]
        : [r.left + r.width / 2, forward ? r.bottom + outset : r.top - outset]
    const lateralPoint = (outset, positive) =>
      horizontal
        ? [r.left + r.width / 2, positive ? r.bottom + outset : r.top - outset]
        : [positive ? r.right + outset : r.left - outset, r.top + r.height / 2]
    for (const point of [
      farPoint,
      outset => lateralPoint(outset, false),
      outset => lateralPoint(outset, true),
    ]) {
      h.move(...point(8))
      assert.equal(h.dragRef.current.hoverTargetId, 'target')
      assert.equal(h.dragRef.current.hoverIou, 0)
      h.move(...point(8.01))
      assert.equal(h.dragRef.current.hoverTargetId, null)
      assert.equal(h.timers.size, 0)
    }
    h.cancel()
  })
  for (const size of ['1x1', '1x2', '2x1', '2x2']) {
    test(`${direction} into ${size}: near side waits, center merges, far side reorders`, t => {
      const h = harness(t, { size, configure: f => setDragDirection(f, direction) })
      const r = h.surfaceRect
      const horizontal = direction === 'left' || direction === 'right'
      const forward = direction === 'right' || direction === 'down'
      const length = horizontal ? r.width : r.height
      const point = progress =>
        horizontal
          ? [r.left + (forward ? progress : length - progress), r.top + r.height / 2]
          : [r.left + r.width / 2, r.top + (forward ? progress : length - progress)]
      const order = [...h.dragRef.current.scrollGroupOrder]
      h.move(...point(-8))
      assert.equal(h.dragRef.current.hoverTargetId, 'target')
      assert.ok(h.dragRef.current.hoverIou < 0.45)
      assert.equal(h.dragRef.current.folderPreviewTargetId, null)
      h.advance(1000)
      assert.equal(h.reordered.length, 0, 'a long pause on the near side must not reorder')
      assert.deepEqual(h.dragRef.current.scrollGroupOrder, order)
      h.move(...point(length * 0.1))
      assert.equal(h.dragRef.current.folderPreviewTargetId, 'target', 'near-side overlap may merge')
      h.move(...point(length * 0.5))
      assert.equal(h.dragRef.current.folderPreviewTargetId, 'target')
      assert.equal(h.timers.size, 0)
      h.move(...point(length * 0.9))
      assert.equal(h.dragRef.current.folderPreviewTargetId, null)
      h.advance(100)
      h.move(...point(-8))
      assert.equal(h.timers.size, 0, 'returning to the near side cancels the far-side timer')
      h.triggerReorder('target', h.dragRef.current.hoverZone)
      assert.deepEqual(
        h.dragRef.current.scrollGroupOrder,
        order,
        'alarm rechecks near-side blocking'
      )
      h.move(...point(length * 0.9))
      h.advance(159)
      assert.equal(h.reordered.length, 0)
      h.advance(1)
      assert.equal(h.reordered.length, 1)
      assert.notDeepEqual(h.dragRef.current.scrollGroupOrder, order)
      h.cancel()
    })
    test(`${direction} into ${size}: either perpendicular side cancels merging and reorders`, t => {
      for (const fraction of [0.1, 0.9]) {
        const h = harness(t, { size, configure: f => setDragDirection(f, direction) })
        const r = h.surfaceRect
        const horizontal = direction === 'left' || direction === 'right'
        const point = horizontal
          ? [r.left + r.width / 2, r.top + r.height * fraction]
          : [r.left + r.width * fraction, r.top + r.height / 2]
        const order = [...h.dragRef.current.scrollGroupOrder]
        h.move(r.left + r.width / 2, r.top + r.height / 2)
        assert.equal(h.dragRef.current.folderPreviewTargetId, 'target')
        h.move(...point)
        assert.equal(h.dragRef.current.hoverTargetId, 'target')
        assert.ok(h.dragRef.current.hoverIou >= 0.45)
        assert.equal(h.dragRef.current.folderPreviewTargetId, null)
        assert.deepEqual(
          h.commit().items,
          h.items,
          'dropping on either lateral edge must not merge'
        )
        h.advance(100)
        h.move(r.left + r.width / 2, r.top + r.height / 2)
        h.advance(200)
        assert.equal(h.reordered.length, 0, 'returning to center cancels the lateral timer')
        h.move(...point)
        h.advance(159)
        assert.equal(h.reordered.length, 0)
        h.advance(1)
        assert.equal(h.reordered.length, 1)
        assert.notDeepEqual(h.dragRef.current.scrollGroupOrder, order)
        const settled = [...h.dragRef.current.scrollGroupOrder]
        h.move(...point)
        h.advance(500)
        assert.deepEqual(
          h.dragRef.current.scrollGroupOrder,
          settled,
          'holding still cannot reverse the tie-break'
        )
        h.cancel()
      }
    })
  }
}

test('near-side protection also applies to large icons pointing directly at the target surface', t => {
  for (const sourceSize of ['1x2', '2x1', '2x2']) {
    const h = harness(t, { sourceSize })
    h.move(69, 32)
    assert.equal(h.dragRef.current.hoverTargetId, 'target')
    assert.equal(h.dragRef.current.folderPreviewTargetId, null)
    h.advance(1000)
    assert.equal(h.reordered.length, 0)
    h.cancel()
  }
})

test('outer 8px edge accepts a small ghost without overlap, and leaving it cancels the alarm', t => {
  const h = harness(t, {
    configure(f) {
      f.params.iconImageSize = 8
    },
  })
  const r = h.surfaceRect
  h.move(r.left - 8, r.top + r.height / 2)
  assert.equal(h.dragRef.current.hoverTargetId, 'target')
  assert.equal(h.dragRef.current.hoverIou, 0)
  assert.equal(h.dragRef.current.folderPreviewTargetId, null)
  h.advance(100)
  h.move(r.left - 8.01, r.top + r.height / 2)
  assert.equal(h.dragRef.current.hoverTargetId, null)
  h.advance(200)
  assert.equal(h.reordered.length, 0)
  h.move(r.left - 8, r.top + r.height / 2)
  h.advance(160)
  assert.equal(h.reordered.length, 1)
})

test('three outer edges follow the stable surface while the grid is scaled and scrolled', t => {
  const scale = 0.97,
    top = -3500
  const h = harness(t, {
    configure(f) {
      crowdedGrid(f, { scale, top, count: 200 })
      f.params.iconImageSize = 8
    },
  })
  const row = 45
  const left = 26 * scale,
    right = 74 * scale
  const upper = top + (row * 126 + 8) * scale
  const lower = upper + 48 * scale
  for (const [x, y] of [
    [left - 8, (upper + lower) / 2],
    [right + 8, (upper + lower) / 2],
    [(left + right) / 2, upper - 8],
    [(left + right) / 2, lower + 8],
  ]) {
    const state = { ...h.state, pointerX: x, pointerY: y }
    const before = h.geometry.findTopLevelMaxOverlapHit(state)
    if (y === lower + 8) {
      assert.equal(before, null, 'only the near edge has no no-overlap fallback')
      continue
    }
    assert.equal(before?.targetId, 'cell-180', `point (${x}, ${y})`)
    assert.equal(before.reorderOnly, true)
    assert.equal(before.intersectionArea, 0)
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
  const edgeGeometry = useScrollableDragGeometryController({ ...f.params, iconImageSize: 8 })
  const edgeHit = edgeGeometry.findTopLevelMaxOverlapHit({ ...f.state, pointerX: 18, pointerY: 32 })
  assert.equal(edgeHit.targetId, 'target')
  assert.equal(edgeHit.intersectionArea, 0)
  assert.equal(measured, 0)
})

function crowdedGrid(f, { scale = 1, top = 0, count = 40, foreignGroup = false } = {}) {
  const items = Array.from({ length: count }, (_, i) => ({
    kind: 'icon',
    key: `cell-${i}`,
    icon: {},
  }))
  items.push(f.source)
  const groupIds = items.map(getId)
  const all = foreignGroup ? [{ kind: 'icon', key: 'other-group', icon: {} }, ...items] : items
  const itemById = new Map(all.map(item => [getId(item), item]))
  const entries = buildScrollGroupEntries(groupIds, itemById, 4)
  const rows = Math.max(...entries.map(entry => entry.row + entry.span.rows))
  const slots = Array(rows * 4).fill(null)
  const nodes = new Map()
  entries.forEach(entry => {
    slots[entry.globalIndex] = entry.id
    const left = entry.col * 108 * scale
    const y = top + entry.row * 126 * scale
    const rect = new Rect(left, y, 100 * scale, 118 * scale)
    const large = entry.span.cols > 1 || entry.span.rows > 1
    const surface = large
      ? new Rect(
          left + 5 * scale,
          y + 8 * scale,
          (entry.span.cols * 108 - 18) * scale,
          (entry.span.rows * 126 - 38) * scale
        )
      : new Rect(left + 26 * scale, y + 8 * scale, 48 * scale, 48 * scale)
    nodes.set(entry.id, {
      getBoundingClientRect: () => rect,
      querySelector: selector =>
        selector === '.icon-image' ? { getBoundingClientRect: () => surface } : null,
    })
  })
  f.items.splice(0, f.items.length, ...all)
  Object.assign(f.params, {
    itemById,
    tileRefs: ref(nodes),
    gridRef: ref({
      offsetWidth: 424,
      scrollHeight: rows * 126,
      getBoundingClientRect: () => new Rect(0, top, 424 * scale, rows * 126 * scale),
    }),
    getActiveScrollGroupItemIds: () => groupIds,
    // Legacy pages intentionally differ from this group's actual continuous grid.
    outerSlotsRef: ref(foreignGroup ? ['other-group', ...slots] : slots),
    compactOuterDragBaseOrderRef: ref(foreignGroup ? ['other-group', ...slots] : slots),
    compactOuterDragBaseWithoutDraggingRef: ref(null),
  })
  Object.assign(f.state, {
    workingOrder: [...f.params.outerSlotsRef.current],
    scrollGroupOrder: groupIds,
    sourceSlotIndex: f.params.outerSlotsRef.current.indexOf('source'),
  })
}

for (const size of ['1x2', '2x1', '2x2']) {
  test(`${size}: evasion starts under the dragged footprint and commits the same compact layout`, t => {
    const h = harness(t, {
      sourceSize: size,
      configure: f => crowdedGrid(f, { foreignGroup: true }),
    })
    const span = getGridItemSpan(h.source)
    h.move(108 + (span.cols * 108 - 8) / 2, 126 + (span.rows * 126 - 8) / 2)
    assert.equal(h.dragRef.current.hoverTargetIndex, 5)
    h.advance(159)
    assert.equal(h.reordered.length, 0)
    h.advance(1)
    const state = h.dragRef.current
    const entries = buildScrollGroupEntries(state.scrollGroupOrder, h.params.itemById, 4)
    const source = entries.find(entry => entry.id === 'source')
    assert.equal(
      source.globalIndex,
      5,
      'reserve the footprint under the pointer, not the max-overlap neighbor index'
    )
    assert.notEqual(entries.find(entry => entry.id === 'cell-5').globalIndex, 5)
    assert.equal(entries.find(entry => entry.id === 'cell-0').globalIndex, 0)
    assert.ok(state.workingOrder.includes('other-group'))
    assert.equal(new Set(state.scrollGroupOrder).size, state.scrollGroupOrder.length)
    const committed = commitScrollGroupDragResult({
      groups: [
        { id: 'other', itemIds: ['other-group'] },
        { id: 'active', itemIds: h.state.scrollGroupOrder },
      ],
      targetGroupId: 'active',
      previewItemIds: state.scrollGroupOrder,
      availableItemIds: h.items.map(getId),
      draggingIds: state.draggingIds,
    })
    assert.deepEqual(committed[0].itemIds, ['other-group'])
    assert.deepEqual(buildScrollGroupEntries(committed[1].itemIds, h.params.itemById, 4), entries)
    const settled = [...state.scrollGroupOrder]
    h.move(h.dragRef.current.pointerX, h.dragRef.current.pointerY)
    h.advance(500)
    assert.deepEqual(
      h.dragRef.current.scrollGroupOrder,
      settled,
      'stationary ghost must not repeatedly repack neighbors'
    )
  })
}

test('crossing neighbors inside one large destination footprint does not restart evasion', t => {
  const h = harness(t, { sourceSize: '2x2', configure: f => crowdedGrid(f) })
  h.move(208, 240)
  h.advance(100)
  h.move(216, 250)
  assert.equal(h.dragRef.current.hoverTargetIndex, 5)
  h.advance(59)
  assert.equal(h.reordered.length, 0)
  h.advance(1)
  assert.equal(h.reordered.length, 1)
})

test('scaled and scrolled grids hit the visible row, even well beyond one legacy page', t => {
  const scale = 0.97,
    top = -3500
  const h = harness(t, { configure: f => crowdedGrid(f, { scale, top, count: 200 }) })
  const targetCell = 180,
    row = targetCell / 4
  h.move(50 * scale, top + (row * 126 + 32) * scale)
  assert.equal(h.dragRef.current.hoverTargetId, 'cell-180')
  assert.equal(h.dragRef.current.folderPreviewTargetId, 'cell-180')
  assert.equal(h.dragRef.current.hoverTargetIndex, targetCell)
})

test('large icon hit area excludes the title and padding that its ghost does not display', t => {
  const h = harness(t, { sourceSize: '2x2', configure: f => crowdedGrid(f) })
  const hit = h.geometry.findTopLevelMaxOverlapHit({ ...h.state, pointerX: 50, pointerY: -105 })
  assert.equal(hit, null, 'a neighbor outside the visible ghost must not evade')
})

for (const [direction, columns, reverse, before, after] of [
  ['right', 4, false, [210, 56], [214, 56]],
  ['left', 4, true, [214, 56], [210, 56]],
  ['down', 1, false, [50, 244], [50, 248.5]],
  ['up', 1, true, [50, 249], [50, 244]],
]) {
  test(`${direction} far side frees the hovered cell without skipping its next neighbor`, t => {
    const h = harness(t, {
      configure(f) {
        crowdedGrid(f, { count: 3 })
        f.params.iconImageSize = 96
        f.params.columns = columns
        f.params.gridRef.current = {
          offsetWidth: columns === 1 ? 100 : 424,
          scrollHeight: 504,
          getBoundingClientRect: () => new Rect(0, 0, columns === 1 ? 100 : 424, 504),
        }
        f.state.scrollGroupOrder = reverse
          ? ['cell-0', 'cell-1', 'cell-2', 'source']
          : ['source', 'cell-0', 'cell-1', 'cell-2']
        f.params.tileRefs.current.forEach(node => {
          const r = node.getBoundingClientRect()
          node.querySelector = selector =>
            selector === '.icon-image'
              ? { getBoundingClientRect: () => new Rect(r.left + 2, r.top + 8, 96, 96) }
              : null
        })
      },
    })
    const target = reverse ? 'cell-2' : 'cell-0'
    h.move(...before)
    assert.equal(h.dragRef.current.hoverTargetId, target)
    h.move(...after)
    assert.equal(
      h.dragRef.current.hoverTargetId,
      target,
      'overlap hysteresis keeps the same neighbor'
    )
    assert.equal(h.dragRef.current.folderPreviewTargetId, null)
    h.advance(160)
    const expected = reverse
      ? ['cell-0', 'cell-1', 'source', 'cell-2']
      : ['cell-0', 'source', 'cell-1', 'cell-2']
    assert.deepEqual(h.dragRef.current.scrollGroupOrder, expected)
    assert.equal(h.dragRef.current.previewSlotIndex, reverse ? 2 : 1)
    h.move(...after)
    h.advance(500)
    assert.deepEqual(
      h.dragRef.current.scrollGroupOrder,
      expected,
      'holding still must not evade twice'
    )
  })
}
