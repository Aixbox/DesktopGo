import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as gridTypes from '../../../types/index.ts'
import * as iconBackground from '../../../lib/iconBackground.ts'
import * as gridModel from '../model.ts'
import * as visualPolicy from './folderVisualPolicy.ts'
import * as previewPolicy from './folderPreviewPolicy.ts'
import * as ghostMotion from './dragGhostMotion.ts'
import * as stackMotion from './stackedIconMotion.ts'
import * as iconTileMetrics from './iconTileMetrics.ts'
import * as folderTileGeometry from './folderTilePreviewGeometry.ts'
import * as folderResizePolicy from '../domain/folderResizePolicy.ts'
import * as folderPreviewTheme from '../domain/folderPreviewThemePolicy.ts'
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
  './iconTileMetrics': iconTileMetrics,
  '../model': gridModel,
  './IconArtwork': loadModule('./IconArtwork.tsx', {
    '../../../lib/iconBackground': iconBackground,
    '../hooks/useRoundedIcon': { useRoundedIcon: source => (source ? 'rounded-image' : null) },
    '../hooks/useIconDominantColor': {
      useIconDominantColor: source => (source ? '#336699' : null),
    },
  }),
}
const { FolderTileContents } = loadModule('./FolderTileContents.tsx', {
  ...sharedModules,
  './FolderDropReceiver': loadModule('./FolderDropReceiver.tsx', sharedModules),
  '../hooks/useFolderResizeMotion': { useFolderResizeMotion: value => ({ get: () => value }) },
  './FolderTilePreview': { FolderTilePreview: 'FolderTilePreview' },
  './FolderResizeHandle': { FolderResizeHandle: 'FolderResizeHandle' },
  '../../icons/focusedItemMenuContext': { useItemMenuFocused: () => false },
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
    react: {
      useRef: value => ({ current: value }),
      useMemo: callback => callback(),
      useEffect() {},
      useLayoutEffect() {},
    },
    '../../../stores/iconStore': { useIconStore: select => select({ titleLineCount }) },
    '../model': gridModel,
    './FolderVisuals': { FolderIconVisual: 'FolderIconVisual' },
    './IconGhostArtwork': loadModule('./IconGhostArtwork.tsx', sharedModules),
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
    slotHeight: gridTypes.getIconGridRowHeight(iconSize, titleLineCount),
    gridGap: 12,
    titleLineCount,
  }
  const metrics = visualPolicy.getDesktopFolderTileMetrics({
    ...props,
    folderSize: size,
    surfaceTitleLineCount: titleLineCount,
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
  for (const material of all.filter(node =>
    node.props.className?.includes('folder-icon-surface')
  )) {
    assert.equal(
      material.props.children,
      undefined,
      'glass brightness must not affect preview artwork'
    )
  }
  const leader = all.find(node => node.props.className?.includes('launchpad-drag-ghost'))
  const flight = all.find(
    node => node.props.className === 'launchpad-drop-flight pointer-events-none fixed'
  )
  assert.equal(
    flight.props.style.opacity,
    1,
    'folder flights must not create an opacity backdrop root'
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
  if (size !== '1x1')
    test(`${size}: enlarged icons match folder geometry for every icon and title setting`, () => {
      for (const titleLineCount of ['one', 'two'])
        for (const [iconSize, config] of Object.entries(gridTypes.ICON_SIZE_CONFIG)) {
          for (const slotHeight of [
            gridTypes.getIconGridRowHeight(iconSize, titleLineCount),
            gridTypes.getIconGridLayoutRowHeight(iconSize),
          ]) {
            const input = {
              span: { cols: Number(size[0]), rows: Number(size[2]) },
              slotWidth: config.columnWidth,
              slotHeight,
              gridGap: 12,
              titleLineCount,
            }
            const icon = iconTileMetrics.getIconTileMetrics({ ...input, imageSize: config.imgSize })
            const folder = visualPolicy.getDesktopFolderTileMetrics({
              ...input,
              folderSize: size,
              surfaceTitleLineCount: titleLineCount,
            })
            assert.deepEqual(icon, folder)
            assert.ok(
              iconTileMetrics.ENLARGED_ICON_SURFACE_CLASS.includes(
                visualPolicy.DESKTOP_TILE_SURFACE_CLASS
              )
            )
          }
        }
    })

  test(`${size}: icon drag leader, multi-selection followers and landing flights keep workspace dimensions`, () => {
    const grid = {
      slotWidth: 76,
      slotHeight: 93,
      gridGap: 12,
      imageSize: 48,
      titleLineCount: 'two',
    }
    const item = { kind: 'icon', key: 'app', size, icon: { name: 'App', icon_base64: 'image' } }
    const metrics = iconTileMetrics.getIconTileMetrics({
      ...grid,
      span: gridModel.getGridItemSpan(item),
    })
    const { shapeWidth: width, shapeHeight: height } = metrics
    const overlay = loadOverlays('two')({
      ...grid,
      iconImageSize: grid.imageSize,
      dragPointerRef: { current: { pointerX: 420, pointerY: 310 } },
      ghostItem: item,
      dragSessionId: 1,
      stackedIcons: [{ id: 'other', icon: item.icon, size, sourceCenter: { x: 50, y: 60 } }],
      multiDropFlight: [{ id: 'app', item, width, height }],
    })
    const all = nodes(overlay)
    for (const classPart of [
      'launchpad-drag-ghost-stack',
      'launchpad-drop-flight pointer-events-none',
      'launchpad-drag-ghost pointer-events-none',
    ]) {
      const rect = rectFromStyle(all.find(node => node.props.className?.includes(classPart)))
      assert.equal(rect.width, width)
      assert.equal(rect.height, height)
    }
    for (const img of all.filter(node => node.type === 'img')) {
      assert.ok(img.props.className.includes('object-contain'))
      if (size !== '1x1') {
        const expectedSize = size === '2x2' ? width / 2 : Math.min(width, height) * 0.8
        assert.equal(img.props.style.width, expectedSize)
        assert.equal(img.props.style.height, expectedSize)
      } else if (size === '1x1') assert.equal(img.props.style, undefined)
      if (size !== '1x1') {
        assert.equal(img.props.src, 'rounded-image')
        assert.equal(img.props.style.borderRadius, 0)
        assert.equal(img.props.style.clipPath, 'none')
      }
    }
    const surfaces = all.filter(node =>
      node.props.className?.includes(iconTileMetrics.ENLARGED_ICON_SURFACE_CLASS)
    )
    const fills = all.filter(node => 'data-icon-color-fill' in node.props)
    if (size !== '1x1') {
      assert.equal(surfaces.length, 3, 'leader, follower and landing use the same glass material')
      assert.equal(fills.length, 3)
      for (const surface of surfaces)
        assert.equal(
          surface.props.style.borderRadius,
          visualPolicy.scaledRadius(metrics.surfaceRadius)
        )
      for (const fill of fills) {
        assert.equal(fill.props.style.backgroundColor, '#336699')
        assert.equal(fill.props.style.backgroundImage, fills[0].props.style.backgroundImage)
        assert.ok(fill.props.style.backgroundImage.includes('radial-gradient('))
        assert.ok(!fill.props.style.backgroundImage.includes('url('))
      }
    } else assert.equal(fills.length, 0)
  })

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

test('folder creation preview retains enlarged icon bounds and matches the committed child slots', () => {
  for (const titleLineCount of ['one', 'two']) {
    for (const direction of ['ltr', 'rtl']) {
      const { FolderCreatePreview } = loadModule('./FolderVisuals.tsx', {
        ...sharedModules,
        react: { ...require('react'), memo: component => component },
        '../../../stores/iconStore': { useIconStore: select => select({ titleLineCount }) },
        '../hooks/useDocumentDirection': { useDocumentDirection: () => direction },
        '../domain/folderResizePolicy': folderResizePolicy,
        '../domain/folderPreviewThemePolicy': folderPreviewTheme,
        './folderTilePreviewGeometry': folderTileGeometry,
      })
      for (const size of ['1x1', '1x2', '2x1', '2x2']) {
        const span = { cols: Number(size[0]), rows: Number(size[2]) }
        const metrics = visualPolicy.getDesktopFolderTileMetrics({
          span,
          slotWidth: 104,
          slotHeight: 118,
          gridGap: 12,
          folderSize: size,
          titleLineCount,
          surfaceTitleLineCount: titleLineCount,
        })
        const props = {
          span,
          tileWidth: 104,
          tileHeight: 118,
          gridGap: 12,
          active: true,
          icon: { name: 'Target', icon_base64: 'image' },
          imgSize: 64,
          reorderAnimationMs: 220,
        }
        const preview = nodes(FolderCreatePreview(props))
        const surface = rectFromStyle(
          preview.find(node => 'data-folder-create-surface' in node.props)
        )
        const committed = nodes(
          FolderTileContents({
            folder: { kind: 'folder', id: 'new', name: 'Folder', size, children: [] },
            metrics,
            span,
            titleLineCount,
          })
        )
        const committedSurface = rectFromStyle(
          committed.find(node => 'data-folder-body-hitbox' in node.props)
        )
        assert.deepEqual(surface, committedSurface)
        if (size !== '1x1') {
          const iconMetrics = iconTileMetrics.getIconTileMetrics({
            span,
            slotWidth: 104,
            slotHeight: 118,
            gridGap: 12,
            imageSize: 64,
            titleLineCount,
          })
          assert.equal(surface.width, iconMetrics.shapeWidth)
          assert.equal(surface.height, iconMetrics.shapeHeight)
        }
        const geometry = folderTileGeometry.getFolderTilePreviewGeometry({
          folderSize: size,
          childCount: 2,
          width: metrics.shapeWidth,
          height: metrics.shapeHeight,
          panelBase: metrics.panelBase,
          rtl: direction === 'rtl',
        })
        const slot = geometry.icons[1]
        const dropSlot = rectFromStyle(
          preview.find(node => node.props['data-folder-create-drop-slot'] !== undefined)
        )
        assert.deepEqual(dropSlot, {
          left: surface.left + slot.left,
          top: surface.top + slot.top,
          width: slot.size,
          height: slot.size,
        })
        const first = preview.find(node => node.type === 'img')
        assert.equal(
          first.props.style.width,
          visualPolicy.getFolderPreviewArtworkSize(
            geometry.icons[0].size,
            visualPolicy.FOLDER_PREVIEW_ICON_SCALE,
            20
          )
        )
      }
    }
  }
})
