import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const noop = () => {}

function load(file, modules) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  runInNewContext(code, {
    exports,
    require: name => {
      assert.ok(name in modules, `Unexpected module: ${name}`)
      return modules[name]
    },
  })
  return exports
}

function findElement(tree, predicate) {
  if (Array.isArray(tree)) {
    return tree.map(child => findElement(child, predicate)).find(Boolean) ?? null
  }
  if (!tree?.props) return null
  return predicate(tree) ? tree : findElement(tree.props.children, predicate)
}

function createDrawer({ collapsed = false, scrollWidth = 1600, clientWidth = 400 } = {}) {
  const effects = []
  const hook = load('./useLayoutDrawerWheel.ts', {
    react: {
      useRef: current => ({ current }),
      useEffect: effect => effects.push(effect),
    },
  })
  const { LayoutLibraryDrawer } = load('./LayoutLibraryDrawer.tsx', {
    react: { useEffect: noop, useMemo: compute => compute(), useState: value => [value, noop] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': {},
    '@/lib/i18n': { translate: value => value },
    '@/lib/utils': { cn: (...parts) => parts.filter(Boolean).join(' ') },
    '@/components/ui/button': { Button: 'Button' },
    '@/components/ui/native-scroll-area': { NativeScrollArea: 'NativeScrollArea' },
    '@/components/ui/toast': { useToast: () => ({ error: noop }) },
    '@/stores/iconStore': { useIconStore: select => select({ icons: [] }) },
    './layoutLibrary': {},
    './LayoutHoverPreview': {},
    './LayoutThumbnailView': {},
    './useLayoutHoverPreview': {},
    './useLayoutDrawerWheel': hook,
  })
  const tree = LayoutLibraryDrawer({ collapsed, currentGeometryKey: 'current', previewId: null })
  const drawer = findElement(tree, element => 'data-layout-drawer' in element.props)
  const viewport = findElement(tree, element =>
    element.props.className?.includes('overflow-x-auto')
  )
  const listeners = new Map()
  const element = {
    addEventListener: (name, listener, options) => listeners.set(name, { listener, options }),
    removeEventListener: (name, listener) => {
      assert.equal(listeners.get(name)?.listener, listener)
      listeners.delete(name)
    },
  }
  const scroller = { scrollLeft: 0, scrollWidth, clientWidth }
  drawer.props.ref.current = element
  if (viewport) viewport.props.ref.current = scroller
  const cleanups = effects.map(effect => effect())

  return {
    drawer,
    viewport,
    scroller,
    listeners,
    dispose: () => cleanups.forEach(cleanup => cleanup?.()),
    wheel(overrides = {}) {
      const event = {
        deltaX: 0,
        deltaY: 0,
        deltaMode: 0,
        cancelable: true,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true
        },
        ...overrides,
      }
      listeners.get('wheel')?.listener(event)
      // 同时执行组件的合成事件处理器，防止重新引入抽屉向网格转发滚轮的路径。
      drawer.props.onWheel?.(event)
      return event
    },
  }
}

test('drawer wheel scrolls cards horizontally using a non-passive native listener', () => {
  const view = createDrawer()
  assert.equal(view.listeners.get('wheel').options.passive, false)
  assert.equal(view.wheel({ deltaY: 120 }).defaultPrevented, true)
  assert.equal(view.scroller.scrollLeft, 120)
  view.wheel({ deltaY: -40 })
  assert.equal(view.scroller.scrollLeft, 80)
  assert.ok(view.viewport.props.className.includes('overscroll-contain'))
  view.dispose()
  assert.equal(view.listeners.size, 0)
})

test('horizontal and diagonal touchpad input uses the dominant axis only once', () => {
  const view = createDrawer()
  view.wheel({ deltaX: 30, deltaY: 5 })
  assert.equal(view.scroller.scrollLeft, 30)
  view.wheel({ deltaX: 4, deltaY: 20 })
  assert.equal(view.scroller.scrollLeft, 50)
  view.wheel({ deltaX: -0.5 })
  assert.equal(view.scroller.scrollLeft, 49.5)
})

test('line and page deltas are converted to pixels', () => {
  const view = createDrawer()
  view.wheel({ deltaY: 3, deltaMode: 1 })
  assert.equal(view.scroller.scrollLeft, 48)
  view.wheel({ deltaY: 1, deltaMode: 2 })
  assert.equal(view.scroller.scrollLeft, 448)
})

test('both boundaries and a list without overflow consume scrolling without forwarding it', () => {
  for (const scrollWidth of [1600, 400, 200]) {
    const view = createDrawer({ scrollWidth })
    assert.equal(view.wheel({ deltaY: -120 }).defaultPrevented, true)
    assert.equal(view.scroller.scrollLeft, 0)
    assert.equal(view.wheel({ deltaY: 5000 }).defaultPrevented, true)
    assert.equal(view.scroller.scrollLeft, Math.max(0, scrollWidth - 400))
    assert.equal(view.wheel({ deltaY: 120 }).defaultPrevented, true)
    assert.equal(view.scroller.scrollLeft, Math.max(0, scrollWidth - 400))
  }
})

test('collapsed drawer consumes scrolling and reopening uses the new viewport', () => {
  const collapsed = createDrawer({ collapsed: true })
  assert.equal(collapsed.viewport, null)
  assert.equal(collapsed.wheel({ deltaY: 120 }).defaultPrevented, true)

  const view = createDrawer()
  view.wheel({ deltaY: 80 })
  view.viewport.props.ref.current = null
  assert.equal(view.wheel({ deltaY: 120 }).defaultPrevented, true)
  const reopened = { scrollLeft: 0, scrollWidth: 800, clientWidth: 400 }
  view.viewport.props.ref.current = reopened
  view.wheel({ deltaY: 60 })
  assert.equal(reopened.scrollLeft, 60)
  assert.equal(view.scroller.scrollLeft, 80)
})

test('zoom gestures and already handled or non-cancelable events do not move cards', () => {
  const view = createDrawer()
  assert.equal(view.wheel({ deltaY: 120, ctrlKey: true }).defaultPrevented, false)
  assert.equal(view.wheel({ deltaY: 120, cancelable: false }).defaultPrevented, false)
  view.wheel({ deltaY: 120, defaultPrevented: true })
  assert.equal(view.scroller.scrollLeft, 0)
})
