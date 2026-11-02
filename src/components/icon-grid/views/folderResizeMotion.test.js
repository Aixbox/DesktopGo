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
import { ICON_GRID_TILE_PADDING_Y } from '../../../types/index.ts'
import * as outlineGeometry from '../domain/folderResizeOutlineGeometry.ts'
import * as hitArea from '../domain/folderResizeHitArea.ts'
import { getFolderResizeVisualGeometry } from '../domain/folderResizePolicy.ts'

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
