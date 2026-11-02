import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as gridTypes from '../../../types/index.ts'
import * as gridModel from '../model.ts'
import * as visualPolicy from './folderVisualPolicy.ts'
import * as previewPolicy from './folderPreviewPolicy.ts'
import * as ghostMotion from './dragGhostMotion.ts'
import * as stackMotion from './stackedIconMotion.ts'
import {
  removeElementTranslateFromRect,
  resolveRectAtUnitScale,
} from '../hooks/gridMotionGeometry.ts'

const require = createRequire(import.meta.url)
const readValue = value => (typeof value?.get === 'function' ? value.get() : value)
const motion = {
  motion: new Proxy({}, { get: (_, name) => `motion.${name}` }),
  useReducedMotion: () => false,
  useTransform: (value, transform) => ({ get: () => transform(readValue(value)) }),
}

// Evaluate the production JSX with controlled hooks, without a browser or screenshots.
function loadModule(path, modules) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  runInNewContext(code, { exports, require: name => modules[name] ?? require(name) })
  return exports
}

const sharedModules = {
  'framer-motion': motion,
  '../../../types': gridTypes,
  './folderVisualPolicy': visualPolicy,
}
const { FolderTileContents } = loadModule('./FolderTileContents.tsx', {
  ...sharedModules,
  './FolderDropReceiver': loadModule('./FolderDropReceiver.tsx', sharedModules),
  '../hooks/useFolderResizeMotion': { useFolderResizeMotion: value => ({ get: () => value }) },
  './FolderTilePreview': { FolderTilePreview: 'FolderTilePreview' },
  './FolderResizeHandle': { FolderResizeHandle: 'FolderResizeHandle' },
})

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props))
  return [tree, ...nodes(tree.props?.children)]
}

function rectFromStyle(node) {
  const style = node.props.style
  return {
    left: Number(readValue(style.x ?? style.left ?? 0)),
    top: Number(readValue(style.y ?? style.top ?? 0)),
    width: parseFloat(readValue(style.width)),
    height: parseFloat(readValue(style.height)),
  }
}

function loadOverlays(titleLineCount) {
  return loadModule('./DragOverlays.tsx', {
    ...sharedModules,
    react: { useRef: value => ({ current: value }), useEffect() {}, useLayoutEffect() {} },
    '../../../stores/iconStore': { useIconStore: select => select({ titleLineCount }) },
    '../model': gridModel,
    './FolderVisuals': { FolderIconVisual: 'FolderIconVisual' },
    './WidgetTile': { WidgetTile: 'WidgetTile' },
    './folderPreviewPolicy': previewPolicy,
    './dragGhostMotion': ghostMotion,
    './stackedIconMotion': stackMotion,
    '../hooks/useDocumentDirection': { useDocumentDirection: () => 'ltr' },
  }).DragOverlays
}

function renderCase(size, titleLineCount, iconSize) {
  const config = gridTypes.ICON_SIZE_CONFIG[iconSize]
  const span = { cols: Number(size[0]), rows: Number(size[2]) }
  const props = {
    folder: { kind: 'folder', id: 'folder', name: 'Folder', size, children: [] },
    span,
    slotWidth: config.columnWidth,
    slotHeight: gridTypes.getIconGridRowHeight(iconSize),
    gridGap: 12,
    titleLineCount,
  }
  const metrics = visualPolicy.getDesktopFolderTileMetrics({
    ...props,
    folderSize: size,
    surfaceTitleLineCount: 'two',
  })
  const tile = nodes(FolderTileContents({ ...props, metrics }))
  const body = rectFromStyle(tile.find(node => 'data-folder-visual-body' in node.props))
  const surface = rectFromStyle(tile.find(node => 'data-folder-body-hitbox' in node.props))
  const pointer = { pointerX: 420, pointerY: 310 }
  const overlay = loadOverlays(titleLineCount)({
    ...props,
    iconImageSize: config.imgSize,
    dragPointerRef: { current: pointer },
    ghostItem: props.folder,
    dragSessionId: 1,
    stackedIcons: [],
    multiDropFlight: [{ id: 'folder', item: props.folder, ...body }],
  })
  const all = nodes(overlay)
  const leader = all.find(node => node.props.className?.includes('launchpad-drag-ghost'))
  const flight = all.find(
    node => node.props.className === 'launchpad-drop-flight pointer-events-none fixed'
  )
  const ghostComponent = flight.props.children.props.children
  const ghost = ghostComponent.type(ghostComponent.props)
  return {
    body,
    surface,
    leader: rectFromStyle(leader),
    ghost: rectFromStyle(ghost),
    ghostSurface: rectFromStyle(ghost.props.children),
    pointer,
  }
}

function centeredSurface(outer, shape) {
  return {
    left: outer.left + (outer.width - shape.width) / 2,
    top: outer.top + (outer.height - shape.height) / 2,
    width: shape.width,
    height: shape.height,
  }
}

for (const size of ['1x1', '1x2', '2x1', '2x2']) {
  test(`${size}: releasing a folder keeps its surface aligned through drag, flight and tile handoff`, () => {
    for (const title of ['one', 'two']) {
      for (const iconSize of Object.keys(gridTypes.ICON_SIZE_CONFIG)) {
        const { body, surface, leader, ghost, ghostSurface, pointer } = renderCase(
          size,
          title,
          iconSize
        )
        assert.equal(body.width, ghost.width, 'flight target width must exclude tile padding')
        assert.equal(
          body.height,
          ghost.height,
          'flight target height must exclude title and padding'
        )
        const start = box => ({
          ...box,
          left: pointer.pointerX - box.width / 2,
          top: pointer.pointerY - box.height / 2,
        })
        assert.deepEqual(
          centeredSurface(start(leader), ghostSurface),
          centeredSurface(start(body), ghostSurface)
        )
        assert.deepEqual(centeredSurface(body, ghostSurface), surface)
        // Paged and scroll drop readers both restore scale and remove the tile's FLIP translation.
        for (const scale of [1, 0.97]) {
          const translation = { x: 12, y: -8 }
          const grid = { left: 115, top: 59, width: 970, height: 582 }
          const originX = grid.left + grid.width / 2,
            originY = grid.top + grid.height / 2
          const measured = {
            left: originX + (body.left + translation.x - originX) * scale,
            top: originY + (body.top + translation.y - originY) * scale,
            width: body.width * scale,
            height: body.height * scale,
          }
          const target = removeElementTranslateFromRect(
            resolveRectAtUnitScale(measured, grid, scale, scale),
            translation
          )
          const landedSurface = centeredSurface(target, ghostSurface)
          for (const key of ['left', 'top', 'width', 'height']) {
            assert.ok(
              Math.abs(landedSurface[key] - surface[key]) < 1e-9,
              `${title}/${iconSize}/${scale}: ${key}`
            )
          }
        }
      }
    }
  })
}
