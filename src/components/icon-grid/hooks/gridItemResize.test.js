import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as transaction from '../domain/itemResizeTransaction.ts'
import * as model from '../model.ts'
import * as dock from '../domain/dock.ts'
import * as gridItems from '../domain/gridItems.ts'
import * as gridGeometry from '../domain/gridGeometry.ts'
import * as topLevel from '../domain/topLevelLayout.ts'
import * as types from '../../../types/index.ts'
import * as metrics from '../views/iconTileMetrics.ts'
import * as visuals from '../views/folderVisualPolicy.ts'

const require = createRequire(import.meta.url)
function load(path, modules) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  runInNewContext(compiled, { exports, require: name => modules[name] ?? require(name) })
  return exports
}

test('shared resize controller previews, cancels and repeatedly commits from the committed layout', () => {
  const state = []
  let cursor = 0
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = initial
      return [state[index], value => (state[index] = value)]
    },
    useMemo: callback => callback(),
  }
  const { useGridItemResizeController } = load('./useGridItemResizeController.ts', {
    react,
    '../model': model,
    '../domain/itemResizeTransaction': transaction,
    '../domain/dock': dock,
    '../domain/gridItems': gridItems,
    '../domain/gridGeometry': gridGeometry,
    '../domain/topLevelLayout': topLevel,
  })
  const items = [
    { kind: 'icon', key: 'app', icon: {} },
    { kind: 'icon', key: 'neighbor', icon: {} },
  ]
  const params = {
    items,
    itemsRef: { current: items },
    outerSlotsRef: { current: ['app', 'neighbor', ...Array(14).fill(null)] },
    dockKeysRef: { current: [] },
    dockEnabled: true,
    columns: 4,
    pageSizeRef: { current: 16 },
    layoutDimensionsTracker: { read: () => ({ columns: 4, pageSize: 16 }) },
    setItems: value => (params.items = value),
    setOuterSlots: value => (params.outerSlotsRef.current = value),
  }
  const render = () => {
    cursor = 0
    return useGridItemResizeController(params)
  }
  render().actions.preview('app', '2x2')
  assert.equal(render().renderItemById.get('app').size, '2x2')
  assert.equal(params.items[0].size, undefined)
  render().actions.cancel()
  assert.equal(render().plan, null)
  assert.equal(params.outerSlotsRef.current[1], 'neighbor')
  for (const size of ['2x2', '1x2', '2x1', '1x1']) {
    render().actions.preview('app', size)
    const preview = render()
    assert.equal(preview.renderItemById.get('app').size, size)
    preview.actions.commit('app', size)
    assert.equal(render().plan, null)
    assert.equal(params.itemsRef.current[0].size, size)
    assert.equal(render().renderItemById.get('app').size, size)
    assert.ok(params.outerSlotsRef.current.includes('neighbor'))
  }
  render().actions.preview('app', '2x2')
  params.items = [...params.items, { kind: 'icon', key: 'imported', icon: {} }]
  params.itemsRef.current = params.items
  assert.equal(render().plan, null, 'external changes invalidate the captured preview')
  render().actions.commit('app', '2x1')
  assert.ok(params.items.some(item => item.key === 'imported'))
  assert.ok(params.outerSlotsRef.current.includes('imported'), 'commit uses the latest layout')

  // Folder preview props must expose the clamped plan, not the raw diagonal gesture.
  params.items = [{ kind: 'folder', id: 'edge', name: 'Edge', size: '1x1', children: [] }]
  params.itemsRef.current = params.items
  params.outerSlotsRef.current = Array(16).fill(null)
  params.outerSlotsRef.current[12] = 'folder:edge'
  render().actions.preview('folder:edge', '2x2')
  assert.equal(render().folderResizeProps.folderResizePreview.size, '2x1')
  assert.equal(render().renderItemById.get('folder:edge').size, '2x1')
  render().actions.preview('folder:edge', '1x2')
  assert.equal(render().plan, null)
  assert.equal(render().folderResizeProps.folderResizePreview, null)
  render().actions.commit('folder:edge', '2x2')
  assert.equal(params.items[0].size, '2x1')
  assert.equal(params.outerSlotsRef.current.indexOf('folder:edge'), 12)
  render().actions.commit('folder:edge', '1x1')
  assert.equal(params.items[0].size, '1x1')
  assert.equal(params.outerSlotsRef.current.indexOf('folder:edge'), 12)
})

test('workspace icon wires size actions and renders its handle outside the activation button', () => {
  const motion = {
    motion: new Proxy({}, { get: (_, name) => name }),
    useReducedMotion: () => false,
    useTransform: (value, transform) => ({ get: () => transform(value.get()) }),
  }
  const { useIconTileMotion } = load('./useIconTileMotion.ts', {
    'framer-motion': motion,
    '../../../types': types,
    '../views/folderVisualPolicy': visuals,
    './useFolderResizeMotion': {
      useFolderResizeMotion: (metrics, _reduced, artworkSize) => {
        let value = { ...metrics, artworkSize }
        return {
          get: () => value,
          set: next => {
            value = next
          },
        }
      },
    },
  })
  const calls = [],
    store = {
      iconSize: 'medium',
      titleLineCount: 'two',
      customNames: {},
      launchApp: () => calls.push('launch'),
    }
  const useIconStore = selector => selector(store)
  const actions = {
    preview: (...args) => calls.push(['preview', ...args]),
    commit: (...args) => calls.push(['commit', ...args]),
    cancel: () => calls.push('cancel'),
  }
  const { ResizableIcon } = load('../views/ResizableIcon.tsx', {
    '../../Icon': { Icon: 'Icon' },
    '../../../stores/iconStore': { useIconStore },
    '../../../types': types,
    '../views/iconTileMetrics': metrics,
    './iconTileMetrics': metrics,
    '../hooks/gridItemResizeContext': { useGridItemResizeActions: () => actions },
  })
  const { Icon } = load('../../Icon.tsx', {
    react: {
      memo: component => component,
      useRef: () => ({ current: null }),
      useState: initial => [initial, () => {}],
      useEffect: () => {},
    },
    '../types': types,
    '../stores/iconStore': { useIconStore },
    './icons/IconContextMenu': { IconContextMenu: 'ContextMenu' },
    './icon-grid/views/IconResizeHandle': { IconResizeHandle: 'Handle' },
    './icon-grid/hooks/useIconTileMotion': { useIconTileMotion },
    './icon-grid/views/folderVisualPolicy': visuals,
    './icon-grid/views/iconTileMetrics': metrics,
    './icon-grid/views/IconArtwork': load('../views/IconArtwork.tsx', {
      'framer-motion': motion,
      '../hooks/useRoundedIcon': { useRoundedIcon: source => (source ? 'rounded-image' : null) },
      '../hooks/useIconDominantColor': {
        useIconDominantColor: source => (source ? '#336699' : null),
      },
    }),
    'framer-motion': motion,
  })
  for (const size of ['1x1', '1x2', '2x1', '2x2']) {
    const item = {
      kind: 'icon',
      key: 'app',
      size,
      icon: { name: 'App', path: '/app', icon_base64: 'image' },
    }
    const props = {
      item,
      span: model.getGridItemSpan(item),
      slotWidth: 76,
      slotHeight: 93,
      gridGap: 8,
      selectionMode: false,
      selected: false,
      onToggleSelect: () => {},
    }
    const entry = ResizableIcon(props)
    entry.props.gridTile.onPreview('2x2')
    entry.props.gridTile.onCommit('2x2')
    entry.props.gridTile.onCancel()
    const wrapper = Icon(entry.props).props.children
    assert.equal(wrapper.props['data-icon'], true)
    const [button, handle] = wrapper.props.children
    assert.equal(button.type, 'button')
    assert.equal(handle.type, 'Handle')
    assert.equal(handle.props.tile, entry.props.gridTile)
    assert.equal(button.props.style.width, entry.props.gridTile.metrics.footprintWidth)
    assert.equal(button.props.style.height, entry.props.gridTile.metrics.footprintHeight)
    const image = button.props.children.find(child =>
      child?.props?.className?.includes('icon-image')
    )
    assert.equal(image.props.style.width.get(), entry.props.gridTile.metrics.shapeWidth)
    assert.equal(image.props.style.height.get(), entry.props.gridTile.metrics.shapeHeight)
    const artwork = image.props.children.type(image.props.children.props).props.children
    assert.ok(artwork[1].props.className.includes('object-contain'))
    if (size !== '1x1') {
      const { shapeWidth, shapeHeight } = entry.props.gridTile.metrics
      const expectedSize = size === '2x2' ? shapeWidth / 2 : Math.min(shapeWidth, shapeHeight) * 0.8
      assert.equal(artwork[1].props.style.width.get(), expectedSize)
      assert.equal(artwork[1].props.style.height.get(), expectedSize)
      assert.equal(artwork[1].props.style.flexShrink, 0)
    } else assert.equal(artwork[1].props.style.width.get(), types.ICON_SIZE_CONFIG.medium.imgSize)
    if (size !== '1x1') {
      assert.equal(artwork[1].props.src, 'rounded-image')
      assert.equal(artwork[1].props.style.borderRadius, 0)
      assert.equal(artwork[1].props.style.clipPath, 'none')
      assert.equal(artwork[0].props.style.backgroundColor, '#336699')
      assert.ok(artwork[0].props.style.backgroundImage.includes('radial-gradient('))
      assert.ok(artwork[0].props.style.backgroundImage.includes('linear-gradient('))
      assert.ok(!artwork[0].props.style.backgroundImage.includes('url('))
      assert.equal(artwork[0].props.style.backgroundRepeat, 'no-repeat')
      assert.ok(image.props.className.includes(visuals.DESKTOP_TILE_SURFACE_CLASS))
      const folderMetrics = visuals.getDesktopFolderTileMetrics({
        ...props,
        folderSize: size,
        titleLineCount: store.titleLineCount,
        surfaceTitleLineCount: 'two',
      })
      assert.equal(
        image.props.style.borderRadius.get(),
        visuals.scaledRadius(folderMetrics.surfaceRadius)
      )
    } else assert.equal(artwork[0], null)
    const current = handle.props.display.get()
    handle.props.display.set({ ...current, shapeWidth: 73, shapeHeight: 91, artworkSize: 37 })
    assert.equal(image.props.style.width.get(), 73)
    assert.equal(image.props.style.height.get(), 91)
    assert.equal(artwork[1].props.style.width.get(), 37)
    assert.equal(
      artwork[1].props.style.transition,
      'none',
      'no second CSS transition behind the frame'
    )
    assert.equal(ResizableIcon({ ...props, interactive: false }).props.gridTile.onCommit, undefined)
  }
  assert.deepEqual(calls.slice(0, 3), [
    ['preview', 'app', '2x2'],
    ['commit', 'app', '2x2'],
    'cancel',
  ])
})

test('only a focused resize handle prepares icon assets, and it reuses the surface animation', () => {
  let focused = false
  const effects = [],
    prepared = []
  const display = { get: () => ({ shapeWidth: 48, shapeHeight: 48 }) }
  const { IconResizeHandle } = load('../views/IconResizeHandle.tsx', {
    react: { useEffect: callback => effects.push(callback) },
    '../../icons/focusedItemMenuContext': { useItemMenuFocused: () => focused },
    '../hooks/useDocumentDirection': { useDocumentDirection: () => 'ltr' },
    '../services/iconColor': { loadIconColor: source => prepared.push(['color', source]) },
    '../services/roundedIcon': { loadRoundedIcon: source => prepared.push(['rounded', source]) },
    './FolderResizeHandle': { FolderResizeHandle: 'FolderResizeHandle' },
  })
  const props = {
    source: 'data:image/png;base64,icon',
    display,
    tile: {
      span: { cols: 1, rows: 1 },
      slotWidth: 96,
      slotHeight: 110,
      gridGap: 8,
      onPreview() {},
      onCommit() {},
      onCancel() {},
    },
  }
  assert.equal(IconResizeHandle(props).props.display, display)
  effects.splice(0).forEach(callback => callback())
  assert.equal(prepared.length, 0)
  focused = true
  assert.equal(IconResizeHandle(props).props.display, display)
  effects.splice(0).forEach(callback => callback())
  assert.deepEqual(prepared, [
    ['color', props.source],
    ['rounded', props.source],
  ])
})

for (const [hook, service, read, loadValue] of [
  ['useIconDominantColor', 'iconColor', 'readCachedIconColor', 'loadIconColor'],
  ['useRoundedIcon', 'roundedIcon', 'readCachedRoundedIcon', 'loadRoundedIcon'],
]) {
  test(`${hook} discards stale results and retains cached results in drag clones`, async () => {
    let state,
      effect,
      writes = 0
    const pending = new Map(),
      cache = new Map([['cached', '#336699']])
    const { [hook]: useValue } = load(`./${hook}.ts`, {
      react: {
        useState: initial => {
          state ??= initial()
          return [
            state,
            next => {
              state = next
              writes += 1
            },
          ]
        },
        useEffect: callback => {
          effect = callback
        },
      },
      [`../services/${service}`]: {
        [read]: source => cache.get(source) ?? null,
        [loadValue]: source => new Promise(resolve => pending.set(source, resolve)),
      },
    })
    assert.equal(useValue('cached'), '#336699')
    const cleanupCached = effect()
    cleanupCached()
    assert.equal(useValue('new'), null)
    const cleanupNew = effect()
    pending.get('cached')('#ff0000')
    await Promise.resolve()
    assert.equal(writes, 0)
    pending.get('new')('#00ff00')
    await Promise.resolve()
    assert.equal(useValue('new'), '#00ff00')
    cleanupNew()
    assert.equal(useValue(undefined), null)
    assert.equal(effect(), undefined)
    assert.equal(pending.size, 2, 'compact icons request no color decoding')
  })
}
