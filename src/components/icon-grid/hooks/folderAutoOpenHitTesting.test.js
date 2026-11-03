import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveFolderAutoOpenHit,
  FOLDER_AUTO_OPEN_AREA_RATIO,
} from './folderAutoOpenHitTesting.ts'
import { usePagedDragGeometryController } from './usePagedDragGeometryController.ts'
import { useScrollableDragGeometryController } from '../scroll/useScrollableDragGeometryController.ts'
import { getDesktopFolderTileMetrics } from '../views/folderVisualPolicy.ts'
import { ICON_GRID_TILE_PADDING_Y } from '../../../types/index.ts'
import { getGridItemSpan, getId } from '../model.ts'

class Rect {
  constructor(left, top, width, height) {
    Object.assign(this, { left, top, width, height, right: left + width, bottom: top + height })
  }
}
const ref = current => ({ current })

function environment(t, shape = 'superellipse(2)') {
  const originalWindow = globalThis.window
  const originalRect = globalThis.DOMRect
  globalThis.DOMRect = Rect
  globalThis.window = {
    getComputedStyle: node => ({
      width: `${node.rect.width}px`,
      borderTopLeftRadius: `${node.radius}px`,
      getPropertyValue: () => shape,
    }),
  }
  t.after(() => {
    globalThis.window = originalWindow
    globalThis.DOMRect = originalRect
  })
}

function fixture(size, titleLineCount = 'two') {
  const target = { kind: 'folder', id: 'target', name: 'Folder', size, children: [] }
  const source = { kind: 'icon', key: 'source', icon: {} }
  const metrics = getDesktopFolderTileMetrics({
    span: getGridItemSpan(target),
    slotWidth: 100,
    slotHeight: 118,
    gridGap: 8,
    folderSize: size,
    titleLineCount,
    surfaceTitleLineCount: 'two',
  })
  const surfaceRect = new Rect(
    (metrics.footprintWidth - metrics.shapeWidth) / 2,
    ICON_GRID_TILE_PADDING_Y + (metrics.bodyHeight - metrics.shapeHeight) / 2,
    metrics.shapeWidth,
    metrics.shapeHeight
  )
  const surface = {
    rect: surfaceRect,
    radius: metrics.surfaceRadius * 1.773,
    getBoundingClientRect: () => surface.rect,
  }
  const tile = {
    rect: new Rect(0, 0, metrics.footprintWidth, metrics.footprintHeight),
    getBoundingClientRect: () => tile.rect,
    querySelector: selector => (selector.includes('data-folder-body-hitbox') ? surface : null),
  }
  const order = Array(36).fill(null)
  order[0] = getId(target)
  const state = {
    context: 'outer',
    draggingItem: source,
    draggingId: 'source',
    draggingIds: ['source'],
    workingOrder: order,
    offsetX: 50,
    offsetY: 59,
    pointerX: 50,
    pointerY: 50,
  }
  const params = {
    gridGap: 8,
    columns: 6,
    rows: 6,
    itemWidth: 100,
    itemHeight: 118,
    iconImageSize: 48,
    folderColumns: 4,
    folderItemWidth: 100,
    folderItemHeight: 118,
    gridRef: ref({ scrollHeight: 756, getBoundingClientRect: () => new Rect(0, 0, 640, 756) }),
    folderGridRef: ref(null),
    dockGridRef: ref(null),
    dockContainerRef: ref(null),
    tileRefs: ref(new Map([[getId(target), tile]])),
    dockSlotRefs: ref(new Map()),
    dockItemRefs: ref(new Map()),
    itemsRef: ref([target, source]),
    itemById: new Map([
      [getId(target), target],
      ['source', source],
    ]),
    outerSlotsRef: ref(order),
    dockKeysRef: ref([]),
    currentPageRef: ref(0),
    pageSizeRef: ref(36),
    dragPointerRef: ref(null),
    compactOuterPreviewItemsRef: ref(null),
    compactScrollLastHitPointRef: ref(null),
    compactScrollLastHitIdRef: ref(null),
  }
  return { target, source, surfaceRect, surface, tile, state, params }
}

for (const size of ['1x1', '1x2', '2x1', '2x2']) {
  test(`${size}: paged and scroll hits use the same rounded 75% surface area`, t => {
    environment(t)
    assert.equal(FOLDER_AUTO_OPEN_AREA_RATIO, 0.75)
    for (const title of ['one', 'two']) {
      const f = fixture(size, title)
      const rect = f.surfaceRect
      const paged = usePagedDragGeometryController(f.params)
      const scroll = useScrollableDragGeometryController({ ...f.params, isCompactOuterDrop: false })
      const compact = useScrollableDragGeometryController({ ...f.params, isCompactOuterDrop: true })
      const groupState = { ...f.state, scrollGroupOrder: [getId(f.target)] }
      const zone = (controller, state, point, compactMode = false) => {
        const next = { ...state, pointerX: point.x, pointerY: point.y }
        const hit = controller.findTopLevelMaxOverlapHit(next)
        return (
          hit &&
          (compactMode ? controller.resolveCompactScrollHoverZone(next, f.target, hit) : hit.zone)
        )
      }
      for (const [x, y, inside] of [
        [0.5, 0.5, true],
        [0.2, 0.5, true],
        [0.8, 0.5, true],
        [0.5, 0.2, true],
        [0.5, 0.8, true],
        [0.124, 0.5, false],
        [0.876, 0.5, false],
        [0.5, 0.124, false],
        [0.5, 0.876, false],
        [0.126, 0.126, false],
        [0.874, 0.874, false],
        [0.126, 0.874, false],
        [0.874, 0.126, false],
        [0.5, 1.1, false],
      ]) {
        const point = { x: rect.left + rect.width * x, y: rect.top + rect.height * y }
        for (const [label, result] of [
          ['paged', zone(paged, f.state, point)],
          ['scroll', zone(scroll, f.state, point)],
          ['compact', zone(compact, f.state, point, true)],
          ['group', zone(compact, groupState, point, true)],
        ])
          assert.equal(result === 'center', inside, `${size}/${title}/${label}/${x},${y}`)
      }
    }
  })
}

test('folder area stays anchored during neighbor animation and supports round fallback', t => {
  environment(t, 'round')
  const f = fixture('2x2')
  const paged = usePagedDragGeometryController(f.params)
  const point = {
    pointerX: f.surfaceRect.left + f.surfaceRect.width * 0.2,
    pointerY: f.surfaceRect.top + f.surfaceRect.height / 2,
  }
  const initial = paged.findTopLevelMaxOverlapHit({ ...f.state, ...point })
  f.tile.rect = new Rect(80, 30, f.tile.rect.width, f.tile.rect.height)
  f.surface.rect = new Rect(
    f.surfaceRect.left + 80,
    f.surfaceRect.top + 30,
    f.surfaceRect.width,
    f.surfaceRect.height
  )
  assert.equal(initial.zone, 'center')
  assert.equal(paged.findTopLevelMaxOverlapHit({ ...f.state, ...point }).zone, 'center')
})

test('folder opening area does not change icon merging, multi-drag or folder dragging rules', t => {
  environment(t)
  const f = fixture('2x2')
  const hit = { targetRect: f.surfaceRect, zone: 'left' }
  const base = { hit, node: f.tile, target: f.target, state: f.state }
  for (const input of [
    { ...base, target: f.source },
    { ...base, state: { ...f.state, context: 'dock' } },
    { ...base, state: { ...f.state, draggingIds: ['source', 'other'] } },
    { ...base, state: { ...f.state, draggingItem: f.target } },
    { ...base, node: undefined },
  ])
    assert.equal(resolveFolderAutoOpenHit(input), hit)
})
