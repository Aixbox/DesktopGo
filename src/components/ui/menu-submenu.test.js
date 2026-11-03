import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const radixFile = require.resolve('@radix-ui/react-menu').replace(/\.js$/, '.mjs')
const radixRequire = createRequire(radixFile)
const sources = new Map()
function load(file, modules, globals = {}) {
  if (!sources.has(String(file)))
    sources.set(
      String(file),
      ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      }).outputText
    )
  const exports = {}
  runInNewContext(sources.get(String(file)), {
    exports,
    ...globals,
    require: name => modules[name] ?? radixRequire(name),
  })
  return exports
}

function runtime() {
  const cells = []
  let cursor = 0
  return {
    reset() {
      cursor = 0
    },
    useState(initial) {
      const i = cursor++
      if (!(i in cells)) cells[i] = initial
      return [
        cells[i],
        value => {
          cells[i] = typeof value === 'function' ? value(cells[i]) : value
        },
      ]
    },
    useRef(initial) {
      return (cells[cursor++] ??= { current: initial })
    },
  }
}

// Execute installed Radix Sub/Trigger/Portal/Content code, with controlled React state,
// context and timers. The real event handlers must change visibility, not just fire callbacks.
function harness(props = {}, direction = 'ltr') {
  let active
  const react = {
    forwardRef: render => render,
    useState: initial => active.useState(initial),
    useRef: initial => active.useRef(initial),
    useCallback: callback => callback,
    useEffect() {},
  }
  const contexts = []
  const timers = new Map()
  let timerId = 0,
    nextId = 0
  const noop = () => {}
  const radix = load(
    radixFile,
    {
      react,
      '@radix-ui/react-context': {
        createContextScope: () => [
          (name, value) => {
            const entry = { name, value }
            contexts.push(entry)
            const Provider = () => null
            Provider.entry = entry
            return [Provider, () => entry.value]
          },
          () => () => ({}),
        ],
      },
      '@radix-ui/react-collection': {
        createCollection: () => [
          { Provider: 'Collection', Slot: 'CollectionSlot' },
          () => () => [],
          () => () => ({}),
        ],
      },
      '@radix-ui/react-popper': { Root: 'PopperRoot', createPopperScope: () => () => ({}) },
      '@radix-ui/react-roving-focus': { createRovingFocusGroupScope: () => () => ({}) },
      '@radix-ui/react-compose-refs': { useComposedRefs: () => noop },
      '@radix-ui/react-use-callback-ref': { useCallbackRef: callback => callback ?? noop },
      '@radix-ui/react-id': { useId: () => active.useRef(`radix-${++nextId}`).current },
    },
    {
      window: {
        setTimeout: (callback, delay) => {
          timers.set(++timerId, { callback, delay })
          return timerId
        },
        clearTimeout: id => timers.delete(id),
      },
    }
  )
  const [menuContext, rootContext] = contexts.filter(entry => entry.name === 'Menu')
  rootContext.value = { dir: direction, isUsingKeyboardRef: { current: false }, onClose: noop }
  contexts.find(entry => entry.name === 'MenuContent').value = {
    pointerGraceTimerRef: { current: 0 },
    searchRef: { current: '' },
    onPointerGraceIntentChange: noop,
    onItemEnter: noop,
    onTriggerLeave: noop,
  }
  const wrappers = load(new URL('./menu-submenu.tsx', import.meta.url), {
    react,
    '@radix-ui/react-menu': radix,
    '@/lib/utils': { cn: (...parts) => parts.filter(Boolean).join(' ') },
    './menu-styles': {},
    './native-scroll-area': { NativeScrollArea: 'ScrollArea' },
  })
  const runtimes = new Map()
  const render = (key, callback) => {
    if (!runtimes.has(key)) runtimes.set(key, runtime())
    active = runtimes.get(key)
    active.reset()
    return callback()
  }
  let currentProps = props
  const refresh = () => {
    const sub = render('wrapper', () => wrappers.MenuSub(currentProps))
    menuContext.value = { open: true }
    const provider = render('sub', () => radix.Sub(sub.props)).props.children
    provider.type.entry.value = provider.props
    const nested = provider.props.children
    nested.type.entry.value = nested.props
    const trigger = render('trigger', () => radix.SubTrigger({})).props.children
    const portal = render('portal', () => radix.Portal({ children: 'sizes' }))
    const content = render('content', () => radix.SubContent({ children: 'sizes' }))
    return {
      sub,
      trigger,
      portalVisible: portal.props.children.props.present,
      contentVisible: content.props.children.props.present,
    }
  }
  return {
    refresh,
    close: () => menuContext.value.onOpenChange(false),
    update: next => {
      currentProps = next
    },
    tick: () => {
      const pending = [...timers.values()]
      timers.clear()
      pending.forEach(timer => timer.callback())
    },
    get delays() {
      return [...timers.values()].map(timer => timer.delay)
    },
  }
}

const event = (extra = {}) => {
  const node = { focus() {} }
  return {
    currentTarget: node,
    target: node,
    pointerType: 'mouse',
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    },
    ...extra,
  }
}
const assertOpen = (state, expected) => {
  assert.equal(state.trigger.props['aria-expanded'], expected)
  assert.equal(Boolean(state.portalVisible), expected)
  assert.equal(Boolean(state.contentVisible), expected)
}

test('Radix pointer hover opens submenu after its delay and leaving beforehand cancels opening', () => {
  const h = harness()
  assertOpen(h.refresh(), false)
  h.refresh().trigger.props.onPointerMove(event())
  assert.deepEqual(h.delays, [100])
  h.tick()
  assertOpen(h.refresh(), true)
  h.close()
  assertOpen(h.refresh(), false)
  const trigger = h.refresh().trigger
  trigger.props.onPointerMove(event())
  trigger.props.onPointerLeave(event())
  h.tick()
  assertOpen(h.refresh(), false)
})

test('Radix click and keyboard activation open both submenu portal and content', () => {
  for (const direction of ['ltr', 'rtl']) {
    const h = harness({}, direction)
    h.refresh().trigger.props.onClick(event())
    assertOpen(h.refresh(), true)
    h.close()
    for (const key of ['Enter', ' ', direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight']) {
      h.refresh().trigger.props.onKeyDown(event({ key }))
      assertOpen(h.refresh(), true)
      h.close()
    }
  }
})

test('controlled submenu reports requests and respects the supplied open state', () => {
  const calls = []
  const onOpenChange = open => calls.push(open)
  const h = harness({ open: false, onOpenChange })
  h.refresh().trigger.props.onClick(event())
  assert.deepEqual(calls, [true])
  assertOpen(h.refresh(), false)
  h.update({ open: true, onOpenChange })
  assertOpen(h.refresh(), true)
  h.close()
  assert.deepEqual(calls, [true, false])
})
