import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { motionValue } from 'framer-motion'
import * as motionPolicy from './folderResizeMotion.ts'
import * as visualPolicy from './folderVisualPolicy.ts'
import * as previewPolicy from './folderTilePreviewGeometry.ts'
import * as previewMetrics from '../domain/folderPreviewMetrics.ts'
import {
  ICON_GRID_TILE_PADDING_Y,
  ICON_SIZE_CONFIG,
  getIconGridRowHeight,
} from '../../../types/index.ts'
import * as outlineGeometry from '../domain/folderResizeOutlineGeometry.ts'
import * as hitArea from '../domain/folderResizeHitArea.ts'
import { getFolderResizeVisualGeometry } from '../domain/folderResizePolicy.ts'
import * as resizePolicy from '../domain/folderResizePolicy.ts'
import * as gridModel from '../model.ts'
import { planFolderResize } from '../domain/folderResizeTransaction.ts'

const require = createRequire(import.meta.url)
// Execute production hooks/components against a controlled animation clock; no browser or screenshots.
function loadModule(path, modules, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  runInNewContext(code, { ...globals, exports, require: name => modules[name] ?? require(name) })
  return exports
}

function metrics(size) {
  const [cols, rows] = size.split('x').map(Number)
  return visualPolicy.getDesktopFolderTileMetrics({
    span: { cols, rows },
    slotWidth: 96,
    slotHeight: 110,
    gridGap: 12,
    folderSize: size,
  })
}

function loadResizeComponents(rtl) {
  let active = false
  const session = { current: null }
  const { useFolderResizeInteraction } = loadModule('../hooks/useFolderResizeInteraction.ts', {
    react: {
      useRef: () => session,
      useState: () => [
        active,
        value => {
          active = value
        },
      ],
    },
    '../domain/folderResizePolicy': resizePolicy,
  })
  const { OuterFolderTile } = loadModule('./OuterFolderTile.tsx', {
    react: { memo: component => component },
    '../../../lib/i18n': { translate: value => value },
    '../../../stores/iconStore': { useIconStore: selector => selector({ titleLineCount: 'two' }) },
    '../../ui/menu': new Proxy({}, { get: (_, name) => `menu.${name}` }),
    '../../icons/FocusedItemMenu': { FocusedItemMenu: 'FocusedItemMenu' },
    '../model': gridModel,
    './folderVisualPolicy': visualPolicy,
    './FolderTileContents': { FolderTileContents: 'FolderTileContents' },
    './GridItemSizeMenu': { GridItemSizeMenu: 'GridItemSizeMenu' },
    '../hooks/useDocumentDirection': { useDocumentDirection: () => (rtl ? 'rtl' : 'ltr') },
  })
  return { useFolderResizeInteraction, OuterFolderTile }
}

function resizeCommitHarness(size, rtl = false) {
  let items = [{ kind: 'folder', id: 'folder', name: 'Folder', size, children: [] }]
  let slots = ['folder:folder', ...Array(15).fill(null)]
  let preview = null
  const commits = [],
    previews = [],
    cancellations = []
  const { useFolderResizeInteraction, OuterFolderTile } = loadResizeComponents(rtl)
  const plan = targetSize =>
    planFolderResize({
      items,
      slots,
      folderId: 'folder',
      size: targetSize,
      columns: 4,
      pageSize: 16,
    })
  const render = (visible = true) => {
    const renderedFolder = (preview ? plan(preview)?.items : null)?.[0] ?? items[0]
    const tree = OuterFolderTile({
      folder: renderedFolder,
      span: gridModel.getGridItemSpan(renderedFolder),
      slotWidth: 96,
      slotHeight: 110,
      gridGap: 8,
      selectionMode: true,
      resizePreviewSize: preview,
      onPreviewFolderResize: (_id, nextSize) => {
        previews.push(nextSize)
        preview = nextSize
      },
      onCancelFolderResize: () => {
        preview = null
        cancellations.push(true)
      },
      onResizeFolder: (id, nextSize) => {
        const result = plan(nextSize)
        if (result) {
          items = result.items
          slots = result.slots
        }
        commits.push({ id, size: nextSize })
        preview = null
      },
    })
    const contents = tree.props.trigger.props.children.props
    return useFolderResizeInteraction({
      visible,
      span: contents.span,
      cellWidth: 96,
      cellHeight: 110,
      gridGap: 8,
      rtl,
      onPreview: contents.onPreview,
      onCommit: contents.onCommit,
      onCancel: contents.onCancel,
    })
  }
  const captured = new Set()
  const target = {
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
  }
  const event = (x = 0, y = 0) => ({
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 0,
    isPrimary: true,
    currentTarget: target,
    preventDefault() {},
    stopPropagation() {},
  })
  return {
    render,
    event,
    commits,
    previews,
    cancellations,
    captured,
    read: () => ({ size: items[0].size, preview }),
  }
}

test('pointerup commits the preview size even when the rendered folder already has that size', () => {
  const sizes = ['1x1', '1x2', '2x1', '2x2']
  for (const rtl of [false, true])
    for (const from of sizes)
      for (const to of sizes) {
        if (from === to) continue
        const h = resizeCommitHarness(from, rtl)
        const [fromX, fromY] = from.split('x').map(Number),
          [toX, toY] = to.split('x').map(Number)
        const moved = h.event((toX - fromX) * 100 * (rtl ? -1 : 1), (toY - fromY) * 100)
        h.render().startPointerResize(h.event())
        h.render().movePointerResize(moved)
        assert.equal(h.read().preview, to)
        assert.equal(h.read().size, from)
        // A real preview re-render supplies the changed FolderItem before pointerup.
        h.render().finishPointerResize(moved)
        assert.equal(h.read().size, to, `${from} -> ${to}, RTL=${rtl}`)
        assert.equal(h.read().preview, null)
        assert.equal(h.commits.length, 1)
        assert.equal(h.cancellations.length, 0)
        assert.equal(h.captured.size, 0)
        h.render().finishPointerResize(moved)
        assert.equal(h.commits.length, 1)
      }
})

test('cancelling or returning to the original size discards the preview without committing', () => {
  for (const cancel of [false, true]) {
    const h = resizeCommitHarness('1x1')
    h.render().startPointerResize(h.event())
    h.render().movePointerResize(h.event(100, 100))
    if (!cancel) h.render().movePointerResize(h.event())
    h.render().finishPointerResize(h.event(), cancel)
    assert.deepEqual(h.read(), { size: '1x1', preview: null })
    assert.equal(h.commits.length, 0)
    assert.equal(h.cancellations.length, 1)
    assert.equal(h.captured.size, 0)
  }
})

test('resize movement publishes a preview only when the requested size changes', () => {
  const h = resizeCommitHarness('1x1')
  h.render().startPointerResize(h.event())
  for (let index = 0; index < 120; index += 1) {
    h.render().movePointerResize(h.event(100 + index / 10, 100 + index / 10))
  }
  assert.deepEqual(
    h.previews,
    ['2x2'],
    '120 pointer moves within one size need only one layout plan'
  )
  h.render().movePointerResize(h.event(110, 0))
  h.render().movePointerResize(h.event())
  h.render().movePointerResize(h.event(100, 100))
  assert.deepEqual(h.previews, ['2x2', '2x1', '1x1', '2x2'])
  h.render().finishPointerResize(h.event(100, 100))
  assert.equal(h.read().size, '2x2')
  assert.equal(h.commits.length, 1)
})

test('closing the focus menu after handle press preserves capture and the resize until release', () => {
  const h = resizeCommitHarness('1x1')
  h.render().startPointerResize(h.event())
  assert.equal(h.captured.has(1), true)
  // The same pointerdown closes the menu. Visibility goes false without cancelling the gesture.
  assert.equal(h.render(false).active, true)
  h.render(false).movePointerResize(h.event(100, 100))
  assert.equal(h.read().preview, '2x2')
  h.render(false).finishPointerResize(h.event(100, 100))
  assert.equal(h.read().size, '2x2')
  assert.equal(h.render(false).active, false)
  assert.equal(h.captured.size, 0)
})

test('right click on a visible handle does not capture or begin resizing', () => {
  const h = resizeCommitHarness('1x1')
  h.render().startPointerResize({ ...h.event(), button: 2 })
  assert.equal(h.render().active, false)
  assert.equal(h.captured.size, 0)
})

function animationHarness() {
  let value, previousDeps, cleanup
  const animations = []
  const { useFolderResizeMotion } = loadModule('../hooks/useFolderResizeMotion.ts', {
    react: {
      useLayoutEffect(effect, deps) {
        if (previousDeps && deps.every((value, i) => Object.is(value, previousDeps[i]))) return
        cleanup?.()
        previousDeps = deps
        cleanup = effect()
      },
    },
    'framer-motion': {
      useMotionValue: initial => (value ??= motionValue(initial)),
      animate: (_from, _to, options) => {
        const animation = {
          options,
          stopped: false,
          stop() {
            this.stopped = true
          },
        }
        animations.push(animation)
        return animation
      },
    },
    '../views/folderResizeMotion': motionPolicy,
  })
  return { render: useFolderResizeMotion, animations, unmount: () => cleanup?.() }
}

test('resize retargets from the displayed geometry; release does not restart; unmount stops', () => {
  const h = animationHarness()
  const small = metrics('1x1'),
    large = metrics('2x2')
  const value = h.render(small, false)
  assert.equal(h.animations.length, 0)
  h.render(large, false)
  h.animations[0].options.onUpdate(0.5)
  const halfway = value.get()
  assert.ok(halfway.shapeWidth > small.shapeWidth && halfway.shapeWidth < large.shapeWidth)
  h.render({ ...large }, false)
  assert.equal(h.animations.length, 1)
  h.render(small, false)
  assert.equal(h.animations[0].stopped, true)
  h.animations[1].options.onUpdate(0)
  assert.equal(value.get().shapeWidth, halfway.shapeWidth)
  h.animations[1].options.onUpdate(1)
  assert.equal(value.get().shapeWidth, small.shapeWidth)
  assert.equal(value.get().bodyHeight, small.bodyHeight)
  h.unmount()
  assert.equal(h.animations[1].stopped, true)
})

test('icon foreground size follows the surface clock through enlargement and interrupted shrink', () => {
  const h = animationHarness()
  const small = metrics('1x1'),
    large = metrics('2x2')
  const value = h.render(small, false, 48)
  h.render(large, false, 90)
  h.animations[0].options.onUpdate(0.5)
  assert.equal(value.get().artworkSize, 69)
  assert.equal(value.get().shapeWidth, (small.shapeWidth + large.shapeWidth) / 2)
  h.render(small, false, 48)
  h.animations[1].options.onUpdate(0)
  assert.equal(value.get().artworkSize, 69)
  h.animations[1].options.onUpdate(1)
  assert.equal(value.get().artworkSize, 48)
  h.render(large, true, 90)
  assert.equal(value.get().shapeWidth, large.shapeWidth)
  assert.equal(value.get().artworkSize, 90)
  h.unmount()
})

test('outline and hit area follow intermediate geometry without scaling the handle stroke', () => {
  const effects = [],
    nodes = []
  const display = motionValue(metrics('1x1'))
  const { FolderResizeOutline } = loadModule(
    './FolderResizeOutline.tsx',
    {
      react: {
        useLayoutEffect: effect => effects.push(effect),
        useRef: () => {
          const node = {
            attributes: {},
            style: {},
            setAttribute(name, value) {
              this.attributes[name] = value
            },
          }
          nodes.push(node)
          return { current: node }
        },
      },
      'framer-motion': {
        motion: new Proxy({}, { get: (_, name) => `motion.${name}` }),
        useTransform: (value, transform) => transform(value.get()),
      },
      './folderVisualPolicy': visualPolicy,
      '../domain/folderResizeOutlineGeometry': outlineGeometry,
      '../domain/folderResizeHitArea': hitArea,
    },
    {
      window: {
        getComputedStyle: () => ({
          getPropertyValue: name =>
            name === '--ui-corner-radius-scale' ? '1.773' : 'superellipse(2)',
        }),
      },
    }
  )
  const geometry = getFolderResizeVisualGeometry({ cols: 2, rows: 2 })
  const tree = FolderResizeOutline({ display, geometry, rtl: false, interaction: {} })
  const cleanup = effects[0]()
  const [_surface, frame, handle, button, svg] = nodes
  const before = button.style.clipPath
  const midpoint = motionPolicy.interpolateFolderGeometry(metrics('1x1'), metrics('2x2'), 0.5)
  display.set(midpoint)
  assert.equal(svg.attributes.viewBox, `0 0 ${midpoint.shapeWidth} ${midpoint.shapeHeight}`)
  assert.notEqual(button.style.clipPath, before)
  const points = [...handle.attributes.d.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map(([, x, y]) => ({
    x: +x,
    y: +y,
  }))
  const length = points
    .slice(1)
    .reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
  assert.ok(Math.abs(length - geometry.handleArcLength) < 0.001)
  const strokes = tree.props.children[0].props.children
  assert.equal(
    tree.props.children[0].props['data-item-focus-part'],
    true,
    'the complete SVG must be lifted above focus glass'
  )
  assert.equal(strokes[0].props.strokeWidth, 2)
  assert.equal(strokes[1].props.strokeWidth, 6)
  assert.equal(strokes[1].props.vectorEffect, 'non-scaling-stroke')
  cleanup()
  const lastFrame = frame.attributes.d
  display.set(metrics('2x2'))
  assert.equal(frame.attributes.d, lastFrame)
})

test('reduced motion snaps all geometry and cancels any in-flight animation', () => {
  const h = animationHarness()
  const value = h.render(metrics('1x1'), true)
  h.render(metrics('2x2'), true)
  assert.equal(h.animations.length, 0)
  assert.equal(value.get().shapeWidth, metrics('2x2').shapeWidth)
  h.render(metrics('1x2'), false)
  h.animations[0].options.onUpdate(0.3)
  h.render(metrics('1x2'), true)
  assert.equal(h.animations[0].stopped, true)
  assert.equal(value.get().shapeHeight, metrics('1x2').shapeHeight)
  assert.equal(value.get().shapeWidth, metrics('1x2').shapeWidth)
})

const { FolderTilePreview } = loadModule('./FolderTilePreview.tsx', {
  'framer-motion': { motion: new Proxy({}, { get: (_, name) => `motion.${name}` }) },
  './folderResizeMotion': motionPolicy,
  './folderTilePreviewGeometry': previewPolicy,
  '../domain/folderPreviewMetrics': previewMetrics,
  '../../../types': { ICON_GRID_TILE_PADDING_Y },
})

test('compact preview renders four separated ordinary artworks at every desktop icon size', () => {
  for (const [iconSize, config] of Object.entries(ICON_SIZE_CONFIG)) {
    for (const withImage of [true, false]) {
      const children = Array.from({ length: 12 }, (_, index) => ({
        key: `child-${index}`,
        icon: { name: `App ${index}`, icon_base64: withImage ? 'image' : '' },
      }))
      const compactMetrics = visualPolicy.getDesktopFolderTileMetrics({
        span: { cols: 1, rows: 1 },
        slotWidth: config.columnWidth,
        slotHeight: getIconGridRowHeight(iconSize),
        gridGap: 8,
        folderSize: '1x1',
      })
      const preview = FolderTilePreview({
        folder: { id: 'compact', name: 'Folder', size: '1x1', children },
        metrics: compactMetrics,
        rtl: false,
        reducedMotion: true,
      })
      const visible = preview.props.children
        .flat()
        .filter(node => node.type === 'motion.button' && !node.props.disabled)
      assert.equal(visible.length, 4)
      const bounds = visible.map(node => {
        assert.equal(node.props['data-folder-preview-slot'], 'standard')
        const artwork = node.props.children
        const wrapper = artwork.type(artwork.props)
        const size = wrapper.props.animate.scale * 40
        return { x: node.props.animate.x, y: node.props.animate.y, size }
      })
      const horizontalGap = bounds[1].x - bounds[0].x - (bounds[0].size + bounds[1].size) / 2
      const verticalGap = bounds[2].y - bounds[0].y - (bounds[0].size + bounds[2].size) / 2
      assert.ok(
        horizontalGap >= 2,
        `${iconSize}, image=${withImage}: horizontal gap=${horizontalGap}`
      )
      assert.ok(verticalGap >= 2, `${iconSize}, image=${withImage}: vertical gap=${verticalGap}`)
    }
  }
})

test('preview preserves icon keys across all sizes, disables hidden children and retains click behavior', () => {
  const children = Array.from({ length: 12 }, (_, i) => ({
    key: `icon-${i}`,
    icon: { name: `App ${i}`, path: `path-${i}` },
  }))
  const opened = [],
    launched = []
  const render = (size, selectionMode = false) =>
    FolderTilePreview({
      folder: { id: 'folder', name: 'Folder', size, children },
      metrics: metrics(size),
      rtl: false,
      selectionMode,
      reducedMotion: true,
      onOpenFolder: id => opened.push(id),
      onLaunchIcon: path => launched.push(path),
    })
      .props.children.flat()
      .filter(node => node.type === 'motion.button')
  const original = render('2x2')
  for (const size of ['1x1', '1x2', '2x1', '2x2']) {
    const nodes = render(size)
    assert.deepEqual(
      nodes.map(node => node.key),
      original.map(node => node.key)
    )
    assert.ok(nodes.every(node => node.props.transition.duration === 0))
    assert.ok(
      nodes
        .filter(node => node.props.disabled)
        .every(node => node.props['aria-hidden'] && node.props.style.pointerEvents === 'none')
    )
  }
  const event = { stopPropagation() {} }
  render('1x2')[0].props.onClick(event)
  render('1x2')[2].props.onClick(event)
  render('1x2', true)[0].props.onClick(event)
  render('2x2')[0].props.onClick(event)
  assert.deepEqual(launched, ['path-0'])
  assert.deepEqual(opened, ['folder', 'folder', 'folder'])
})

test('stacked preview buttons forward presses to folder dragging while retaining folder clicks', () => {
  for (const size of ['1x2', '2x1'])
    for (const selectionMode of [false, true])
      for (const rtl of [false, true])
        for (const count of [4, 5, 6, 12]) {
          const opened = [],
            launched = []
          const preview = FolderTilePreview({
            folder: {
              id: 'folder',
              name: 'Folder',
              size,
              children: Array.from({ length: count }, (_, index) => ({
                key: `child-${index}`,
                icon: { name: `App ${index}`, path: `path-${index}` },
              })),
            },
            metrics: metrics(size),
            rtl,
            selectionMode,
            reducedMotion: true,
            onOpenFolder: id => opened.push(id),
            onLaunchIcon: path => launched.push(path),
          })
          const buttons = preview.props.children
            .flat()
            .filter(node => node.type === 'motion.button' && !node.props.disabled)
          const stacked = buttons.filter(
            node => node.props['data-folder-preview-slot'] === 'stacked'
          )
          assert.equal(stacked.length, Math.min(4, count - 2))
          for (const button of stacked) {
            let stopped = false
            const event = {
              stopPropagation() {
                stopped = true
              },
            }
            button.props.onPointerDown(event)
            assert.equal(
              stopped,
              false,
              `${size}/${count}/RTL=${rtl}/edit=${selectionMode}: folder must receive the press`
            )
            button.props.onClick(event)
            assert.equal(stopped, true, 'click must open the folder only once')
          }
          assert.deepEqual(opened, Array(stacked.length).fill('folder'))
          assert.deepEqual(launched, [])
          // The first two slots keep their existing direct-launch pointer behavior.
          let stopped = false
          buttons[0].props.onPointerDown({
            stopPropagation() {
              stopped = true
            },
          })
          assert.equal(stopped, true)
        }
})
