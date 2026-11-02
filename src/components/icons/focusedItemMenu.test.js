import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as geometry from './focusedItemMenuGeometry.ts'
import * as folderVisuals from '../icon-grid/views/folderVisualPolicy.ts'
import * as gridTypes from '../../types/index.ts'
import * as resizePolicy from '../icon-grid/domain/folderResizePolicy.ts'

const require = createRequire(import.meta.url)
const compiled = new Map()
function loadModule(path, modules, globals = {}) {
  if (!compiled.has(path))
    compiled.set(
      path,
      ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      }).outputText
    )
  const exports = {}
  runInNewContext(compiled.get(path), {
    exports,
    ...globals,
    require: name => modules[name] ?? require(name),
  })
  return exports
}

// Execute real hooks and JSX handlers; only React scheduling and the DOM event boundary are controlled.
function hookRuntime() {
  const cells = []
  let cursor, effects, dirty
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const effect = (callback, deps) => {
    const index = cursor++,
      old = cells[index]
    if (same(old?.deps, deps)) return
    effects.push(() => {
      old?.cleanup?.()
      cells[index] = { deps, cleanup: callback() }
    })
  }
  return {
    react: {
      useRef: value => (cells[cursor++] ??= { current: value }),
      useState(initial) {
        const index = cursor++
        if (!(index in cells)) cells[index] = initial
        return [
          cells[index],
          value => {
            const next = typeof value === 'function' ? value(cells[index]) : value
            if (!Object.is(next, cells[index])) {
              cells[index] = next
              dirty = true
            }
          },
        ]
      },
      useCallback(callback, deps) {
        const index = cursor++
        if (!same(cells[index]?.deps, deps)) cells[index] = { value: callback, deps }
        return cells[index].value
      },
      useEffect: effect,
      useLayoutEffect: effect,
    },
    render(callback) {
      for (let pass = 0; pass < 20; pass++) {
        cursor = 0
        effects = []
        dirty = false
        const result = callback()
        for (const run of effects) run()
        if (!dirty) return result
      }
      throw new Error('Render loop')
    },
    unmount() {
      for (const cell of cells) cell?.cleanup?.()
    },
  }
}

function eventHub() {
  const handlers = new Map()
  return {
    addEventListener(name, callback) {
      if (!handlers.has(name)) handlers.set(name, new Set())
      handlers.get(name).add(callback)
    },
    removeEventListener(name, callback) {
      handlers.get(name)?.delete(callback)
    },
    dispatch(name, event) {
      for (const callback of handlers.get(name) ?? []) callback(event)
    },
    listenerCount: () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0),
  }
}

const pointer = (props = {}) => ({
  defaultPrevented: false,
  stopped: false,
  button: 0,
  clientX: 160,
  clientY: 160,
  preventDefault() {
    this.defaultPrevented = true
  },
  stopPropagation() {
    this.stopped = true
  },
  ...props,
})
const element = rect => ({
  focusCount: 0,
  getBoundingClientRect: () => rect,
  contains(node) {
    return node === this || node?.owner === this
  },
  focus() {
    this.focusCount++
  },
  closest() {
    return null
  },
  querySelector() {
    return null
  },
  hasAttribute() {
    return false
  },
})

// Run Radix's actual deferred FocusScope cleanup against a controlled focus/event boundary.
function backgroundMenuFocus(doc, onCloseAutoFocus) {
  const { ContextMenuContent } = loadModule('../ui/context-menu.tsx', {
    react: { forwardRef: render => render },
    '@radix-ui/react-context-menu': new Proxy({}, { get: (_, name) => name }),
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    './native-scroll-area': { NativeScrollArea: 'NativeScrollArea' },
    './menu-styles': {},
  })
  const content = ContextMenuContent({ onCloseAutoFocus }, null).props.children
  const runtime = hookRuntime(),
    timers = []
  const noop = () => {}
  const radixRequire = createRequire(require.resolve('@radix-ui/react-menu'))
  const scopeUrl = pathToFileURL(
    radixRequire.resolve('@radix-ui/react-focus-scope').replace(/\.js$/, '.mjs')
  )
  const { FocusScope } = loadModule(
    scopeUrl.href,
    {
      react: { ...runtime.react, forwardRef: render => render },
      '@radix-ui/react-compose-refs': { useComposedRefs: (_, setNode) => setNode },
      '@radix-ui/react-primitive': { Primitive: { div: 'div' } },
      '@radix-ui/react-use-callback-ref': { useCallbackRef: callback => callback ?? noop },
    },
    {
      document: doc,
      HTMLInputElement: class {},
      setTimeout: callback => timers.push(callback),
      CustomEvent: class {
        defaultPrevented = false
        constructor(type) {
          this.type = type
        }
        preventDefault() {
          this.defaultPrevented = true
        }
      },
    }
  )
  const node = {
    ...element({}),
    ...eventHub(),
    ownerDocument: doc,
    dispatchEvent(event) {
      event.target = this
      this.dispatch(event.type, event)
    },
    focus() {
      doc.activeElement = this
    },
  }
  const props = {
    onMountAutoFocus: event => {
      event.preventDefault()
      node.focus()
    },
    onUnmountAutoFocus: content.props.onCloseAutoFocus,
  }
  runtime.render(() => FocusScope(props)).props.ref(node)
  runtime.render(() => FocusScope(props))
  return {
    node,
    close: () => runtime.unmount(),
    flushClose: () => timers.splice(0).forEach(callback => callback()),
  }
}

function menuFixture({
  direction = 'ltr',
  item = { left: 100, top: 100, width: 176, height: 208 },
  scale = 1,
} = {}) {
  const viewport = { left: 24, top: 24, width: 800, height: 600 }
  const target = element(item),
    root = element(viewport),
    menuNode = element({})
  const bodyRect = {
    left: item.left + 16,
    top: item.top + 8,
    width: item.width - 32,
    height: item.height - 40,
  }
  const surface = element(bodyRect)
  surface.hasAttribute = name => name === 'data-folder-body-hitbox'
  target.querySelector = () => surface
  Object.assign(menuNode, { scrollHeight: 260, offsetHeight: 200, clientHeight: 198 })
  const doc = { ...eventHub(), body: {}, getElementById: () => root }
  const win = {
    ...eventHub(),
    getComputedStyle: node => ({
      direction,
      width: `${node.getBoundingClientRect().width / scale}px`,
      borderTopLeftRadius: '18px',
      getPropertyValue: name => (name === 'corner-shape' ? 'superellipse(2)' : ''),
    }),
  }
  let currentRuntime,
    disabled = false,
    opened = 0
  const react = new Proxy(
    {},
    {
      get:
        (_, key) =>
        (...args) =>
          currentRuntime.react[key](...args),
    }
  )
  const observers = []
  const globals = {
    document: doc,
    window: win,
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback
        observers.push(this)
      }
      observe(node) {
        this.node = node
      }
      disconnect() {
        this.disconnected = true
      }
    },
  }
  const visualPolicy = loadModule(
    './focusedItemVisual.ts',
    { './focusedItemMenuGeometry': geometry },
    globals
  )
  const { useFocusedItemMenu } = loadModule(
    './useFocusedItemMenu.ts',
    { react, './focusedItemVisual': visualPolicy },
    globals
  )
  const presentationModule = loadModule(
    './FocusedItemPresentation.tsx',
    {
      react,
      'react-dom': { createPortal: node => node },
      './focusedItemForeground': { mountFocusedItemForeground: () => () => {} },
      './focusedItemMenuGeometry': geometry,
    },
    globals
  )
  const { FocusedItemMenu } = loadModule(
    './FocusedItemMenu.tsx',
    {
      react,
      'react-dom': { createPortal: node => node },
      '@radix-ui/react-slot': { Slot: 'Slot' },
      '../ui/menu': { Menu: 'Menu', MenuAnchor: 'MenuAnchor', MenuContent: 'MenuContent' },
      './focusedItemMenuContext': { FocusedItemMenuContext: { Provider: 'FocusProvider' } },
      './useFocusedItemMenu': { useFocusedItemMenu },
      './FocusedItemPresentation': presentationModule,
      './focusedItemMenuGeometry': geometry,
    },
    globals
  )
  const runtime = hookRuntime(),
    contentRuntime = hookRuntime(),
    presentationRuntime = hookRuntime()
  const resizeRuntimes = []
  const trigger = { type: 'button', props: { onPointerDown: () => 'original drag handler' } }
  let tree
  const render = () => {
    currentRuntime = runtime
    tree = runtime.render(() =>
      FocusedItemMenu({
        trigger,
        children: 'actions',
        disabled,
        onOpen: () => opened++,
        label: 'Folder',
      })
    )
    return tree
  }
  const slot = () => tree.props.children.props.children[0].props.children
  const overlayChildren = () => tree.props.children.props.children[1].props.children
  const renderContent = () => {
    const content = overlayChildren()[1]
    currentRuntime = contentRuntime
    return contentRuntime.render(() => content.type(content.props))
  }
  const presentation = () => {
    const node = overlayChildren()[0]
    currentRuntime = presentationRuntime
    return presentationRuntime.render(() => node.type(node.props))
  }
  const resizeHandle = () => {
    const resizeRuntime = hookRuntime()
    resizeRuntimes.push(resizeRuntime)
    const { useFolderResizeInteraction } = loadModule(
      '../icon-grid/hooks/useFolderResizeInteraction.ts',
      {
        react,
        '../domain/folderResizePolicy': resizePolicy,
      }
    )
    const { useFolderResizeHandleFocus } = loadModule(
      '../icon-grid/hooks/useFolderResizeHandleFocus.ts',
      { react },
      globals
    )
    const { FolderResizeHandle } = loadModule('../icon-grid/views/FolderResizeHandle.tsx', {
      'framer-motion': { motion: { div: 'motion.div' }, useTransform: () => 0 },
      '../hooks/useFolderResizeInteraction': { useFolderResizeInteraction },
      '../hooks/useFolderResizeHandleFocus': { useFolderResizeHandleFocus },
      '../domain/folderResizePolicy': resizePolicy,
      './FolderResizeOutline': { FolderResizeOutline: 'Outline' },
      '../../../types': gridTypes,
      '../../icons/focusedItemMenuContext': {
        useDismissItemMenu: () => tree.props.children.props.value.dismiss,
      },
    })
    const preview = [],
      commits = [],
      cancellations = [],
      captured = new Set()
    const node = {
      owner: target,
      closest: () => node,
      setPointerCapture: id => captured.add(id),
      hasPointerCapture: id => captured.has(id),
      releasePointerCapture: id => captured.delete(id),
    }
    return {
      preview,
      commits,
      cancellations,
      captured,
      event: (x = 160, y = 160) =>
        pointer({
          target: node,
          currentTarget: node,
          pointerId: 1,
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      render() {
        currentRuntime = resizeRuntime
        const result = resizeRuntime.render(() =>
          FolderResizeHandle({
            visible: tree.props.open,
            span: { cols: 1, rows: 1 },
            display: {},
            cellWidth: 96,
            cellHeight: 110,
            gridGap: 8,
            onPreview: size => preview.push(size),
            onCommit: size => commits.push(size),
            onCancel: () => cancellations.push(true),
          })
        )
        if (result) result.props.ref.current = { contains: target => target === node }
        return result
      },
    }
  }
  render()
  slot().props.ref.current = target
  return {
    render,
    slot,
    trigger,
    doc,
    win,
    target,
    bodyRect,
    visual: () => overlayChildren()[0].props.visual,
    menuNode,
    observers,
    renderContent,
    resizeHandle,
    presentation,
    hasPresentation: () => !!tree.props.children.props.children[1],
    open() {
      slot().props.onContextMenu(pointer({ button: 2 }))
      return render()
    },
    backdrop() {
      return presentation().props.children[0]
    },
    shield() {
      return presentation().props.children[1]
    },
    disable(value) {
      disabled = value
      return render()
    },
    opened: () => opened,
    unmount() {
      runtime.unmount()
      contentRuntime.unmount()
      presentationRuntime.unmount()
      for (const resizeRuntime of resizeRuntimes) resizeRuntime.unmount()
    },
  }
}

test('right click focuses the original tile; a primary press leaves its existing long-press drag intact', () => {
  const h = menuFixture()
  assert.equal(h.render().props.open, false)
  const opened = h.open()
  assert.equal(opened.props.open, true)
  assert.equal(opened.props.modal, false, 'resize must remain reachable outside the menu')
  assert.equal(
    h.slot().props.children,
    h.trigger,
    'do not clone or reparent the tile into a portal'
  )
  assert.equal(h.slot().props['data-item-menu-focused'], 'true')
  const down = pointer()
  h.slot().props.onPointerDownCapture(down)
  assert.equal(down.defaultPrevented, false)
  assert.equal(down.stopped, false)
  assert.equal(h.trigger.props.onPointerDown(), 'original drag handler')
  assert.equal(h.render().props.open, false)
  h.unmount()
})

test('closing the background menu cannot restore stale focus and dismiss a newly opened folder menu', () => {
  const h = menuFixture()
  let oldFocusRestores = 0
  h.doc.activeElement = {
    ...element({}),
    focus() {
      oldFocusRestores++
      h.doc.activeElement = this
      const outside = pointer({ target: this })
      h.renderContent().props.onInteractOutside(outside)
      if (!outside.defaultPrevented) h.render().props.onOpenChange(false)
    },
  }
  const background = backgroundMenuFocus(h.doc)
  background.close()
  h.open()
  h.doc.activeElement = {
    closest: selector =>
      selector === '[data-radix-menu-content][data-state="open"]' ? h.menuNode : null,
  }
  background.flushClose()
  assert.equal(oldFocusRestores, 0, 'the previous menu must not take focus back from its successor')
  assert.equal(h.render().props.open, true)
  assert.equal(h.hasPresentation(), true)
  // The new menu still supports normal dismissal after the handoff.
  h.doc.dispatch('click', pointer({ target: {} }))
  assert.equal(h.render().props.open, false)
  h.unmount()
})

test('ordinary background-menu closing still restores focus and respects an explicit autofocus override', () => {
  for (const override of [false, true]) {
    let restores = 0,
      callbacks = 0
    const doc = { activeElement: { focus: () => restores++ } }
    const background = backgroundMenuFocus(doc, event => {
      callbacks++
      if (override) event.preventDefault()
    })
    background.close()
    background.flushClose()
    assert.equal(callbacks, 1)
    assert.equal(restores, override ? 0 : 1)
  }
})

test('outside presses and clicks are consumed, including the clear margin around the focused tile', () => {
  const h = menuFixture()
  h.open()
  for (const target of [{}, { closest: () => ({}) }]) {
    const down = pointer({ target })
    h.doc.dispatch('pointerdown', down)
    assert.equal(down.defaultPrevented, true)
    assert.equal(down.stopped, true)
    assert.equal(h.render().props.open, true, 'wait for the click so it cannot hit the desktop')
    const click = pointer({ target })
    h.doc.dispatch('click', click)
    assert.equal(click.defaultPrevented, true)
    assert.equal(click.stopped, true)
    assert.equal(h.render().props.open, false)
    h.open()
  }
  const handlePress = pointer({ target: { owner: h.target } })
  h.doc.dispatch('pointerdown', handlePress)
  assert.equal(handlePress.defaultPrevented, false)
  h.unmount()
  assert.equal(h.doc.listenerCount(), 0)
  assert.equal(h.win.listenerCount(), 0)
})

test('only the measured folder surface stays clear; clicking its blurred title dismisses without opening', () => {
  for (const scale of [1, 0.97]) {
    const h = menuFixture({ scale })
    h.open()
    const visual = h.visual()
    for (const key of ['left', 'top', 'width', 'height']) assert.equal(visual[key], h.bodyRect[key])
    assert.ok(Math.abs(visual.radius - 18 * scale) < 1e-8)
    assert.equal(visual.exponent, 4)
    const contour = geometry.getFocusVisualContour(visual)
    assert.equal(
      Math.min(...contour.map(p => p.x)),
      h.bodyRect.left,
      'no clear ring outside the folder'
    )
    assert.equal(Math.max(...contour.map(p => p.y)), h.bodyRect.top + h.bodyRect.height)
    const title = pointer({
      target: { owner: h.target },
      clientX: h.bodyRect.left + h.bodyRect.width / 2,
      clientY: h.bodyRect.top + h.bodyRect.height + 4,
    })
    h.doc.dispatch('pointerdown', title)
    assert.equal(title.stopped, true)
    assert.equal(title.defaultPrevented, true)
    h.doc.dispatch('click', title)
    assert.equal(h.render().props.open, false)
    h.unmount()
  }
})

test('tightening the visual cutout does not shrink the resize hit area outside the folder', () => {
  const h = menuFixture()
  h.open()
  const handle = pointer({
    target: {
      owner: h.target,
      closest: selector => (selector === '[data-folder-resize-hit-area]' ? {} : null),
    },
    clientX: h.bodyRect.left + h.bodyRect.width + 8,
    clientY: h.bodyRect.top + h.bodyRect.height - 16,
  })
  assert.equal(geometry.isPointInFocusVisual(h.visual(), handle.clientX, handle.clientY), false)
  h.doc.dispatch('pointerdown', handle)
  assert.equal(handle.defaultPrevented, false)
  assert.equal(handle.stopped, false)
  h.slot().props.onPointerDownCapture(handle)
  assert.equal(
    h.render().props.open,
    true,
    'the resize handler must accept the press before focus closes'
  )
  h.unmount()
})

test('capture-phase rerender cannot remove the handle before resize starts; release commits and cancel rolls back', () => {
  for (const cancelled of [false, true]) {
    const h = menuFixture()
    h.open()
    const handle = h.resizeHandle()
    assert.ok(handle.render())
    const down = handle.event()
    h.doc.dispatch('pointerdown', down)
    h.slot().props.onPointerDownCapture(down)
    // Browser capture and bubble are separate dispatches: flush updates between them.
    h.render()
    const ready = handle.render()
    assert.ok(ready, 'handle was removed during parent capture before receiving pointerdown')
    ready.props.children.props.interaction.startPointerResize(down)
    assert.equal(handle.captured.has(1), true)
    assert.equal(h.render().props.open, false, 'close blur/menu only after accepting resize')
    assert.equal(
      h.hasPresentation(),
      false,
      'the entire glass/foreground portal must unmount at resize start'
    )
    const active = handle.render()
    assert.equal(active.props['data-folder-resize-frame'], 'active')
    active.props.children.props.interaction.movePointerResize(handle.event(260, 260))
    assert.equal(handle.preview.at(-1), '2x2')
    handle
      .render()
      .props.children.props.interaction.finishPointerResize(handle.event(260, 260), cancelled)
    assert.deepEqual(handle.commits, cancelled ? [] : ['2x2'])
    assert.equal(handle.cancellations.length, cancelled ? 1 : 0)
    assert.equal(handle.captured.size, 0)
    assert.equal(handle.render().props['data-folder-resize-frame'], 'idle')
    assert.equal(h.hasPresentation(), false)
    h.doc.dispatch('pointerdown', pointer({ target: {} }))
    assert.equal(handle.render(), null, 'the next outside press dismisses the retained handle')
    h.unmount()
    assert.equal(h.doc.listenerCount(), 0)
  }
})

test('a released handle stays reusable without reopening the menu or glass, even after a click without movement', () => {
  const h = menuFixture()
  h.open()
  const handle = h.resizeHandle()
  for (const moved of [true, false, true]) {
    const down = handle.event()
    h.doc.dispatch('pointerdown', down)
    h.slot().props.onPointerDownCapture(down)
    h.render()
    const ready = handle.render()
    assert.ok(ready, 'pressing the retained handle must not dismiss it')
    ready.props.children.props.interaction.startPointerResize(down)
    assert.equal(h.render().props.open, false)
    assert.equal(h.hasPresentation(), false)
    const drag = handle.render().props.children.props.interaction
    if (moved) drag.movePointerResize(handle.event(260, 260))
    drag.finishPointerResize(handle.event(260, 260))
    // Resizing can move the folder away from the release point. Its resulting click is not a new press.
    h.doc.dispatch('pointerup', pointer({ target: {} }))
    h.doc.dispatch('click', pointer({ target: {} }))
    assert.equal(handle.render().props['data-folder-resize-frame'], 'idle')
    assert.equal(handle.captured.size, 0)
  }
  assert.deepEqual(handle.commits, ['2x2', '2x2'])
  assert.equal(handle.cancellations.length, 1)
  h.unmount()
  assert.equal(h.doc.listenerCount(), 0)
})

test('pressing the folder body, title, desktop or another handle clears retention without consuming the press', () => {
  for (const location of ['body', 'title', 'desktop', 'other handle']) {
    const h = menuFixture()
    h.open()
    const handle = h.resizeHandle()
    handle.render().props.children.props.interaction.startPointerResize(handle.event())
    h.render()
    handle.render().props.children.props.interaction.finishPointerResize(handle.event())
    assert.ok(handle.render())
    const target = location === 'desktop' ? {} : { owner: h.target }
    if (location === 'other handle') target.closest = () => target
    const down = pointer({ target, button: location === 'other handle' ? 2 : 0 })
    h.doc.dispatch('pointerdown', down)
    assert.equal(handle.render(), null, location)
    assert.equal(down.defaultPrevented, false, 'the newly clicked control should still work')
    assert.equal(down.stopped, false)
    h.unmount()
    assert.equal(h.doc.listenerCount(), 0)
  }
})

test('all folder sizes exclude both one-line and two-line titles from the clear contour', () => {
  for (const cols of [1, 2])
    for (const rows of [1, 2])
      for (const titleLineCount of ['one', 'two']) {
        const m = folderVisuals.getDesktopFolderTileMetrics({
          span: { cols, rows },
          folderSize: `${cols}x${rows}`,
          slotWidth: 96,
          slotHeight: 110,
          gridGap: 12,
          titleLineCount,
          surfaceTitleLineCount: 'two',
        })
        for (const scale of [0.97, 1]) {
          const visual = {
            left: ((m.footprintWidth - m.shapeWidth) / 2) * scale,
            top: (gridTypes.ICON_GRID_TILE_PADDING_Y + (m.bodyHeight - m.shapeHeight) / 2) * scale,
            width: m.shapeWidth * scale,
            height: m.shapeHeight * scale,
            radius: m.surfaceRadius * scale,
            exponent: 4,
            padding: 0,
          }
          const titleTop =
            (gridTypes.ICON_GRID_TILE_PADDING_Y + m.bodyHeight + gridTypes.ICON_GRID_TITLE_GAP) *
            scale
          assert.ok(
            Math.max(...geometry.getFocusVisualContour(visual).map(p => p.y)) < titleTop,
            `${cols}x${rows}/${titleLineCount}/scale=${scale}`
          )
        }
      }
})

test('glass and sharp foreground share one lifetime without a clipping stencil on the glass', () => {
  const h = menuFixture()
  h.open()
  const backdrop = h.backdrop()
  assert.equal(backdrop.type, 'div')
  assert.ok(backdrop.props.className.includes('backdrop-blur-[2px]'))
  assert.ok(backdrop.props.className.includes('pointer-events-none'))
  assert.ok(backdrop.props.className.includes('window-portal-overlay'))
  assert.equal(
    backdrop.props.style?.clipPath,
    undefined,
    'never cut through a folder edge or handle stroke'
  )
  assert.equal(backdrop.props.children, undefined, 'no clipping ancestor may isolate the blur')
  assert.ok(
    !h.shield().props.className.includes('pointer-events-none'),
    'background hover must not animate blurred items'
  )
  assert.notEqual(
    h.shield().props.style.clipPath,
    backdrop.props.style?.clipPath,
    'the shield controls hits, not painted glass'
  )
  const foreground = h.presentation().props.children[2]
  assert.equal(foreground.props.inert, true)
  assert.equal(foreground.props['aria-hidden'], 'true')
  assert.ok(foreground.props.className.includes('overflow-visible'))
  const click = pointer({ target: {} })
  h.doc.dispatch('click', click)
  assert.equal(click.defaultPrevented, true)
  assert.equal(click.stopped, true)
  assert.equal(h.render().props.open, false)
  assert.equal(h.hasPresentation(), false)
  h.unmount()
})

test('keyboard context menu and Escape restore focus without escaping the launchpad', () => {
  const h = menuFixture()
  const key = pointer({ key: 'F10', shiftKey: true })
  h.slot().props.onKeyDown(key)
  assert.equal(key.defaultPrevented, true)
  assert.equal(h.render().props.open, true)
  const menu = h.renderContent()
  const escape = pointer({ key: 'Escape' })
  h.win.dispatch('keydown', escape)
  assert.equal(escape.defaultPrevented, true)
  assert.equal(escape.stopped, true)
  menu.props.onCloseAutoFocus(pointer())
  assert.equal(h.target.focusCount, 1)
  assert.equal(h.render().props.open, false)
  h.unmount()
})

test('disabled targets and native-menu interception cannot leave a stale focus session', () => {
  const h = menuFixture()
  h.slot().props.onContextMenu(pointer({ defaultPrevented: true }))
  assert.equal(h.render().props.open, false)
  assert.equal(h.opened(), 0)
  h.open()
  assert.equal(h.disable(true).props.open, false)
  h.open()
  assert.equal(h.opened(), 1)
  assert.equal(h.disable(false).props.open, false)
  h.unmount()
})

test('scrolling the menu is allowed; layout scroll, window resize and blur dismiss and clean up', () => {
  const h = menuFixture()
  for (const [hub, name] of [
    [h.doc, 'scroll'],
    [h.win, 'resize'],
    [h.win, 'blur'],
  ]) {
    h.open()
    h.renderContent().props.ref(h.menuNode)
    const inside = pointer({ target: { owner: h.menuNode } })
    h.doc.dispatch('scroll', inside)
    assert.equal(h.render().props.open, true)
    hub.dispatch(name, pointer({ target: {} }))
    assert.equal(h.render().props.open, false)
    assert.equal(h.doc.listenerCount(), 0)
    assert.equal(h.win.listenerCount(), 0)
  }
  h.unmount()
})

test('menu measures after portal mount, uses collision-free positioning and retains RTL alignment', () => {
  const h = menuFixture({ direction: 'rtl', item: { left: 250, top: 80, width: 400, height: 100 } })
  assert.equal(h.open().props.dir, 'rtl')
  const initial = h.renderContent()
  assert.equal(initial.props.side, 'bottom')
  assert.equal(initial.props.align, 'end')
  assert.equal(initial.props.avoidCollisions, false)
  initial.props.ref(h.menuNode)
  const measured = h.renderContent()
  assert.equal(measured.props.style.maxHeight, 416)
  assert.ok(measured.props.style.maxHeight > h.menuNode.scrollHeight + 2)
  assert.equal(h.observers[0].node, h.menuNode)
  const internal = pointer({ target: h.target })
  measured.props.onInteractOutside(internal)
  assert.equal(internal.defaultPrevented, true)
  for (const handler of ['onPointerDown', 'onClick', 'onKeyDown']) {
    const event = pointer()
    measured.props[handler](event)
    assert.equal(event.stopped, true)
  }
  h.unmount()
  assert.equal(h.observers[0].disconnected, true)
})

test('folder handles follow focus state in either selection mode, never the selection mode alone', () => {
  let focused = false
  const { FolderTileContents } = loadModule('../icon-grid/views/FolderTileContents.tsx', {
    'framer-motion': {
      motion: new Proxy({}, { get: (_, name) => `motion.${name}` }),
      useReducedMotion: () => false,
      useTransform: () => 0,
    },
    '../../../types': gridTypes,
    '../hooks/useFolderResizeMotion': { useFolderResizeMotion: () => ({}) },
    './folderVisualPolicy': folderVisuals,
    './FolderTilePreview': { FolderTilePreview: 'Preview' },
    './FolderResizeHandle': { FolderResizeHandle: 'Handle' },
    './FolderDropReceiver': { FolderDropReceiver: 'Receiver' },
    '../../icons/focusedItemMenuContext': { useItemMenuFocused: () => focused },
  })
  for (const selectionMode of [false, true])
    for (const menuOpen of [false, true]) {
      focused = menuOpen
      const props = {
        folder: { id: 'folder' },
        metrics: {},
        span: { cols: 2, rows: 2 },
        selectionMode,
      }
      assert.equal(FolderTileContents(props).props.children[1].props.visible, menuOpen)
      assert.equal(
        FolderTileContents({ ...props, folderOpen: true }).props.children[1].props.visible,
        false
      )
      assert.equal(
        FolderTileContents({ ...props, folderPreview: true }).props.children[1].props.visible,
        false
      )
    }
})

test('focused menu interactions do not close the search panel in the launchpad capture handler', () => {
  const runtime = hookRuntime()
  let closed = 0
  const { useLaunchpadSurfaceInteractions } = loadModule(
    '../launchpad/useLaunchpadSurfaceInteractions.ts',
    { react: runtime.react },
    { window: eventHub() }
  )
  const handlers = runtime.render(() =>
    useLaunchpadSurfaceInteractions({
      isSearchPanelOpen: true,
      closeSearchPanel: () => closed++,
      selectedIconKeys: [],
    })
  )
  for (const marker of ['data-focused-item-menu', 'data-item-focus-backdrop']) {
    const target = { closest: selector => (selector.includes(`[${marker}]`) ? {} : null) }
    handlers.handleSurfacePointerDownCapture(pointer({ target }))
  }
  assert.equal(closed, 0)
  handlers.handleSurfacePointerDownCapture(pointer({ target: { closest: () => null } }))
  assert.equal(closed, 1)
  runtime.unmount()
})
