import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as constants from '../constants.ts'
import * as pointerCapture from './dragPointerCapture.ts'
import * as activation from './dragActivationPolicy.ts'
import * as swipePolicy from '../domain/pageSwipePolicy.ts'

function load(path, modules, globals) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(code, {
    exports,
    require: name => {
      assert.ok(name in modules, `Unexpected import: ${name}`)
      return modules[name]
    },
    ...globals,
  })
  return exports
}

function hookRunner() {
  const cells = [],
    effects = []
  let cursor = 0
  return {
    react: {
      useRef: value => (cells[cursor++] ??= { current: value }),
      useState: value => {
        const cell = (cells[cursor++] ??= { value })
        return [
          cell.value,
          next => {
            cell.value = typeof next === 'function' ? next(cell.value) : next
          },
        ]
      },
      useEffect: (effect, deps) => {
        const i = cursor++
        if (cells[i] && deps?.every((d, j) => Object.is(d, cells[i].deps[j]))) return
        effects.push(() => {
          cells[i]?.cleanup?.()
          cells[i] = { deps, cleanup: effect() }
        })
      },
      useEffectEvent: fn => {
        const cell = (cells[cursor++] ??= { fn, stable: (...args) => cell.fn(...args) })
        cell.fn = fn
        return cell.stable
      },
    },
    render(fn) {
      cursor = 0
      const value = fn()
      effects.splice(0).forEach(fn => fn())
      return value
    },
    dispose: () => cells.forEach(cell => cell?.cleanup?.()),
  }
}

function eventTarget() {
  const listeners = []
  return {
    listeners,
    addEventListener(type, callback, options) {
      listeners.push({ type, callback, capture: options === true || !!options?.capture })
    },
    removeEventListener(type, callback, options) {
      const capture = options === true || !!options?.capture
      const i = listeners.findIndex(
        l => l.type === type && l.callback === callback && l.capture === capture
      )
      if (i >= 0) listeners.splice(i, 1)
    },
    emit(type, event = {}) {
      for (const capture of [true, false]) {
        listeners
          .filter(l => l.type === type && l.capture === capture)
          .forEach(l => l.callback(event))
      }
    },
  }
}

class ElementStub {
  constructor(selectors = []) {
    this.selectors = selectors
    this.captured = new Set()
  }
  closest(selector) {
    return selector.split(',').some(value => this.selectors.includes(value.trim())) ? this : null
  }
  getBoundingClientRect() {
    return { width: 1000 }
  }
  setPointerCapture(id) {
    this.captured.add(id)
  }
  hasPointerCapture(id) {
    return this.captured.has(id)
  }
  releasePointerCapture(id) {
    this.captured.delete(id)
  }
}

function pointer(overrides = {}) {
  return {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: 200,
    clientY: 200,
    detail: 1,
    timeStamp: 0,
    defaultPrevented: false,
    stopped: false,
    preventDefault() {
      this.defaultPrevented = true
    },
    stopPropagation() {
      this.stopped = true
    },
    ...overrides,
  }
}

function fixture(t, overrides = {}) {
  const hooks = hookRunner(),
    window = eventTarget(),
    document = eventTarget()
  const timers = new Map(),
    pages = [],
    selected = [],
    closed = [],
    dragged = [],
    motions = []
  let timerId = 0
  window.setTimeout = fn => {
    timers.set(++timerId, fn)
    return timerId
  }
  window.clearTimeout = id => timers.delete(id)
  document.visibilityState = 'visible'
  const viewport = new ElementStub(),
    background = new ElementStub()
  const globals = {
    window,
    document,
    Element: ElementStub,
    getComputedStyle: () => ({ direction: viewport.direction ?? 'ltr' }),
  }
  const track = { style: {} }
  hooks.react.useLayoutEffect = hooks.react.useEffect
  hooks.react.useCallback = fn => fn
  const modules = {
    'framer-motion': { useReducedMotion: () => viewport.reducedMotion ?? false },
    '../domain/pageSwipePolicy': swipePolicy,
    '../views/pageTranslationMotion': {
      animatePageTranslation(node, from, to, duration) {
        node.style.transform = `translate3d(${from}px, 0, 0)`
        let resolve
        const motion = {
          from,
          to,
          duration,
          finished: new Promise(r => {
            resolve = r
          }),
          cancel: () => resolve(),
          finish() {
            node.style.transform = `translate3d(${to}px, 0, 0)`
            resolve()
          },
        }
        motions.push(motion)
        return motion
      },
    },
    react: hooks.react,
    '../constants': constants,
    '../icon-grid/constants': constants,
    './dragPointerCapture': pointerCapture,
    './dragActivationPolicy': activation,
  }
  modules['./usePageSwipePreview'] = load('./usePageSwipePreview.ts', modules, globals)
  const { useMousePageSwipe } = load('./useMousePageSwipe.ts', modules, globals)
  const { usePointerDragController } = load('./usePointerDragController.ts', modules, globals)
  const { useLaunchpadSurfaceInteractions } = load(
    '../../launchpad/useLaunchpadSurfaceInteractions.ts',
    modules,
    globals
  )
  const params = {
    enabled: true,
    pageCount: 3,
    currentPage: 1,
    currentPageRef: { current: 1 },
    dragRef: { current: null },
    setCurrentPage: page => {
      pages.push(page)
      params.currentPage = page
    },
    clearEdgeSwitchTimer: () => {},
    ...overrides,
  }
  const pendingRef = { current: null }
  let itemTimer = null
  const clearPending = () => {
    pendingRef.current = null
    window.clearTimeout(itemTimer)
  }
  const beginDrag = pending => {
    params.dragRef.current = pending
    dragged.push(pending)
    clearPending()
  }
  const controller = {
    pendingRef,
    dragRef: params.dragRef,
    pendingMoveTolerance: constants.DRAG_PENDING_MOVE_TOLERANCE,
    beginDragFnRef: { current: beginDrag },
    onDragMoveFnRef: { current: () => {} },
    flushDragMoveFnRef: { current: () => {} },
    finishDragFnRef: {
      current: () => {
        params.dragRef.current = null
      },
    },
    clearPendingFnRef: { current: clearPending },
    abortPendingFnRef: { current: clearPending },
    cancelDragFnRef: { current: clearPending },
  }
  const surfaceParams = {
    selectionMode: false,
    selectedIconKeys: [],
    setSelectedIconKeys: () => {},
    clearSelection: () => {},
    enterSelectionMode: () => selected.push(true),
    isInteractionLocked: false,
    hasSearchKeyword: false,
    isSearchPanelOpen: false,
    closeSearchPanel: () => {},
    windowMode: 'fullscreen',
    windowPersistentEnabled: false,
    isBackgroundCloseSuppressed: () => false,
    requestCloseLaunchpad: () => closed.push(true),
  }
  let swipe, surface
  const render = () =>
    hooks.render(() => {
      // Deliberately register item drag first; paging must inspect it in capture phase.
      usePointerDragController(controller)
      swipe = useMousePageSwipe(params)
      swipe.visual.trackRef.current = track
      surface = useLaunchpadSurfaceInteractions(surfaceParams)
    })
  render()
  const api = {
    params,
    surfaceParams,
    globals,
    render,
    window,
    document,
    viewport,
    pages,
    selected,
    closed,
    dragged,
    motions,
    track,
    visual: () => {
      render()
      return swipe.visual
    },
    down(options = {}) {
      const event = pointer({ target: background, currentTarget: viewport, ...options })
      swipe.handlers.onPointerDownCapture(event)
      if (!event.stopped) surface.handleBackgroundPointerDown(event)
      return event
    },
    downOnIcon() {
      const event = api.down({ target: new ElementStub(['[data-icon]']) })
      pendingRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      }
      itemTimer = window.setTimeout(() => {
        if (pendingRef.current) beginDrag(pendingRef.current)
      })
    },
    move(x, y = 200, options = {}) {
      const event = pointer({ clientX: x, clientY: y, ...options })
      window.emit('pointermove', event)
      return event
    },
    up(x, y = 200, options = {}) {
      const event = pointer({ clientX: x, clientY: y, buttons: 0, ...options })
      window.emit('pointerup', event)
      surface.handleBackgroundPointerUp(event)
    },
    click(options = {}) {
      const event = pointer({ target: background, ...options })
      swipe.handlers.onClickCapture(event)
      if (!event.stopped) surface.handleBackgroundClick(event)
      return event
    },
    nativeDrag() {
      const event = pointer()
      swipe.handlers.onDragStartCapture(event)
      return event
    },
    elapseLongPress() {
      const callbacks = [...timers.values()]
      timers.clear()
      callbacks.forEach(fn => fn())
    },
    dispose: () => hooks.dispose(),
  }
  t.after(api.dispose)
  return api
}

for (const [x, expected] of [
  [100, 2],
  [300, 0],
]) {
  test(`horizontal mouse swipe to ${x} changes exactly one page on release`, t => {
    const h = fixture(t)
    h.down()
    h.move(x)
    assert.deepEqual(h.pages, [])
    assert.ok(h.viewport.hasPointerCapture(1))
    h.elapseLongPress()
    assert.deepEqual(h.selected, [], 'a slow swipe cannot become a background long press')
    h.up(x)
    assert.deepEqual(h.pages, [expected])
    assert.equal(h.params.currentPageRef.current, expected)
    assert.equal(h.viewport.hasPointerCapture(1), false)
    assert.equal(h.click().stopped, true)
    assert.deepEqual(h.closed, [])
  })
}

test('swiping from an icon cancels its pending long press and suppresses release click', t => {
  const h = fixture(t)
  h.downOnIcon()
  assert.equal(h.nativeDrag().defaultPrevented, true)
  h.move(190)
  h.elapseLongPress()
  assert.deepEqual(h.dragged, [])
  h.move(80)
  h.up(80)
  assert.deepEqual(h.pages, [2])
  assert.equal(h.click({ target: new ElementStub(['[data-icon]']) }).stopped, true)
})

test('a stationary icon long press retains item dragging and never changes pages', t => {
  const h = fixture(t)
  h.downOnIcon()
  h.elapseLongPress()
  assert.equal(h.dragged.length, 1)
  h.move(50)
  h.up(50)
  assert.deepEqual(h.pages, [])
})

test('pointerup checks active item drag before the item controller finishes it', t => {
  const h = fixture(t)
  h.downOnIcon()
  h.elapseLongPress()
  h.up(20)
  assert.deepEqual(h.pages, [])
  assert.equal(h.params.dragRef.current, null)
})

test('small pointer jitter still permits stationary background long press', t => {
  const h = fixture(t)
  h.down()
  h.move(204, 203)
  h.elapseLongPress()
  assert.deepEqual(h.selected, [true])
  h.up(204, 203)
  h.click()
  assert.deepEqual(h.closed, [])
  assert.deepEqual(h.pages, [])
})

for (const [x, y] of [
  [180, 200],
  [200, 100],
  [205, 180],
]) {
  test(`movement to ${x},${y} cancels long press without meeting horizontal paging threshold`, t => {
    const h = fixture(t)
    h.down()
    h.move(x, y)
    h.elapseLongPress()
    h.up(x, y)
    assert.deepEqual(h.selected, [])
    assert.deepEqual(h.pages, [])
    assert.equal(h.click().stopped, true)
    assert.deepEqual(h.closed, [])
  })
}

test('vertical gestures stay vertical even when the pointer later moves horizontally', t => {
  const h = fixture(t)
  h.down()
  h.move(200, 175)
  h.move(50, 180)
  h.up(50, 180)
  assert.deepEqual(h.pages, [])
})

for (const [page, x] of [
  [0, 300],
  [2, 100],
]) {
  test(`outward swipe on boundary page ${page} stays put and suppresses click`, t => {
    const h = fixture(t, { currentPageRef: { current: page } })
    h.down()
    h.move(x)
    h.up(x)
    assert.deepEqual(h.pages, [])
    assert.equal(h.click().stopped, true)
  })
}

test('a new ordinary click and keyboard activation remain usable after a swipe', t => {
  const h = fixture(t)
  h.down()
  h.move(100)
  h.up(100)
  assert.equal(h.click({ detail: 0 }).stopped, false)
  assert.equal(h.click().stopped, true)
  h.down()
  h.up(200)
  assert.equal(h.click().stopped, false)
  assert.equal(h.closed.length, 1)
})

for (const type of ['pointercancel', 'lostpointercapture', 'blur', 'keydown', 'visibilitychange']) {
  test(`${type} cancels an in-progress page swipe`, t => {
    const h = fixture(t)
    h.down()
    h.move(100)
    if (type === 'visibilitychange') {
      h.document.visibilityState = 'hidden'
      h.document.emit(type)
    } else h.window.emit(type, pointer({ key: 'Escape' }))
    h.up(100)
    assert.deepEqual(h.pages, [])
    assert.equal(h.viewport.hasPointerCapture(1), false)
  })
}

test('unmount releases capture and removes every listener and pending background timer', t => {
  const h = fixture(t)
  h.down()
  h.move(100)
  h.dispose()
  assert.equal(h.viewport.hasPointerCapture(1), false)
  assert.equal(h.window.listeners.length, 0)
  assert.equal(h.document.listeners.length, 0)
  h.elapseLongPress()
  assert.deepEqual(h.selected, [])
})

test('wrong pointer events cannot move or end the current mouse gesture', t => {
  const h = fixture(t)
  h.down()
  h.move(100, 200, { pointerId: 2 })
  h.up(100, 200, { pointerId: 2 })
  assert.deepEqual(h.pages, [])
  h.move(100)
  h.up(100)
  assert.deepEqual(h.pages, [2])
})

test('releasing the mouse outside the window cancels instead of paging on re-entry', t => {
  const h = fixture(t)
  h.down()
  h.move(100)
  h.move(80, 200, { buttons: 0 })
  h.up(80)
  assert.deepEqual(h.pages, [])
})

for (const options of [
  { pointerType: 'touch' },
  { pointerType: 'pen' },
  { button: 2 },
  { isPrimary: false },
]) {
  test(`non-primary mouse input is ignored: ${JSON.stringify(options)}`, t => {
    const h = fixture(t)
    h.down(options)
    h.move(100)
    h.up(100)
    assert.deepEqual(h.pages, [])
  })
}

for (const selector of [
  '[data-dock]',
  '[data-pagination]',
  '[data-focused-item-menu]',
  '[data-folder-resize-hit-area]',
  'input',
  'button:not([data-icon]):not([data-folder-preview-key])',
]) {
  test(`paging does not claim controls matching ${selector}`, t => {
    const h = fixture(t)
    h.down({ target: new ElementStub([selector]) })
    assert.equal(h.nativeDrag().defaultPrevented, false)
    h.move(100)
    h.up(100)
    assert.deepEqual(h.pages, [])
  })
}

for (const overrides of [
  { enabled: false },
  { pageCount: 1 },
  { dragRef: { current: { pointerId: 1 } } },
]) {
  test(`paging is disabled for ${JSON.stringify(overrides)}`, t => {
    const h = fixture(t, overrides)
    h.down()
    h.move(100)
    h.up(100)
    assert.deepEqual(h.pages, [])
  })
}

test('disabling paging midway cancels capture and uses latest options', t => {
  const h = fixture(t)
  h.down()
  h.move(100)
  h.params.enabled = false
  h.render()
  assert.equal(h.viewport.hasPointerCapture(1), false)
  h.up(100)
  assert.deepEqual(h.pages, [])
})

test('page changes from another control during a swipe cannot trigger an extra page step', t => {
  const h = fixture(t)
  h.down()
  h.move(100)
  h.params.currentPageRef.current = 0
  h.up(100)
  assert.deepEqual(h.pages, [])
})

test('RTL direction follows the existing page translation direction', t => {
  const h = fixture(t)
  h.viewport.direction = 'rtl'
  h.down()
  h.move(100)
  h.up(100)
  assert.deepEqual(h.pages, [0])
})

for (const [distance, pages] of [
  [47, []],
  [48, [2]],
]) {
  test(`horizontal paging distance boundary: ${distance}px`, t => {
    const h = fixture(t)
    h.down()
    h.move(200 - distance)
    h.up(200 - distance)
    assert.deepEqual(h.pages, pages)
  })
}

test('a swipe that returns to its starting point suppresses click without paging', t => {
  const h = fixture(t)
  h.down()
  h.move(100)
  h.move(200)
  h.up(200)
  assert.deepEqual(h.pages, [])
  assert.equal(h.click().stopped, true)
})

test('window listeners still finish paging when pointer capture is unavailable', t => {
  const h = fixture(t)
  h.viewport.setPointerCapture = () => {
    throw new Error('capture unavailable')
  }
  h.down()
  h.move(100)
  h.up(100)
  assert.deepEqual(h.pages, [2])
  assert.equal(h.click().stopped, true)
})

test('selection-mode background dragging keeps marquee selection and does not page', t => {
  const h = fixture(t, { enabled: false })
  h.surfaceParams.selectionMode = true
  h.render()
  h.down()
  h.move(100)
  h.up(100)
  h.elapseLongPress()
  assert.deepEqual(h.pages, [])
  assert.deepEqual(h.selected, [])
  assert.equal(h.click().stopped, false)
  assert.deepEqual(h.closed, [])
})

for (const type of ['blur', 'keydown', 'visibilitychange']) {
  test(`background long press is cleared by ${type} before any movement`, t => {
    const h = fixture(t)
    h.down()
    if (type === 'visibilitychange') {
      h.document.visibilityState = 'hidden'
      h.document.emit(type)
    } else h.window.emit(type, pointer({ key: 'Escape' }))
    h.elapseLongPress()
    assert.deepEqual(h.selected, [])
  })
}

test('both neighboring pages share the live track displacement before pointerup', t => {
  const h = fixture(t)
  h.down()
  h.move(120)
  assert.deepEqual(h.pages, [])
  assert.equal(h.track.style.transform, 'translate3d(-80px, 0, 0)')
  const preview = h.visual().preview
  assert.equal(preview.page, 1)
  assert.equal(preview.width, 1000)
  assert.equal(preview.pageCount, 3)
  h.move(50)
  assert.equal(h.track.style.transform, 'translate3d(-150px, 0, 0)')
  assert.equal(h.visual().preview, preview, 'movement does not replace preview state')
  h.move(300)
  assert.equal(h.track.style.transform, 'translate3d(100px, 0, 0)')
})

test('release hands the exact pointer position to the existing page transition', t => {
  const h = fixture(t)
  h.down()
  h.move(100)
  h.up(80)
  const visual = h.visual()
  assert.deepEqual(h.pages, [2])
  assert.equal(visual.preview, null)
  const handoff = visual.takeHandoff(1, 2)
  assert.equal(handoff.offset, -120)
  assert.equal(handoff.toPage, 2)
  assert.equal(handoff.width, 1000)
  assert.equal(visual.takeHandoff(1, 2), null)
  assert.equal(h.track.style.transform, 'translate3d(0px, 0, 0)')
})

test('short drags keep neighbors mounted while bouncing to the current page', async t => {
  const h = fixture(t)
  h.down()
  h.move(180)
  h.visual()
  h.up(180)
  assert.deepEqual(h.pages, [])
  const bounce = h.motions.at(-1)
  assert.equal(bounce.from, -20)
  assert.equal(bounce.to, 0)
  assert.ok(h.visual().preview)
  bounce.finish()
  await Promise.resolve()
  assert.equal(h.visual().preview, null)
  assert.equal(h.track.style.transform, 'translate3d(0px, 0, 0)')
})

test('the outermost page has limited resistance and returns without inventing another page', async t => {
  const h = fixture(t, { currentPage: 0, currentPageRef: { current: 0 } })
  h.down()
  h.move(600)
  assert.equal(h.track.style.transform, 'translate3d(64px, 0, 0)')
  h.up(600)
  assert.deepEqual(h.pages, [])
  h.motions.at(-1).finish()
  await Promise.resolve()
  assert.equal(h.visual().preview, null)
})

test('quick short flicks turn a page, but holding or reversing before release returns it', t => {
  const flick = fixture(t)
  flick.down()
  flick.move(175, 200, { timeStamp: 25 })
  flick.up(175, 200, { timeStamp: 40 })
  assert.deepEqual(flick.pages, [2])
  const hold = fixture(t)
  hold.down()
  hold.move(175, 200, { timeStamp: 25 })
  hold.up(175, 200, { timeStamp: 200 })
  assert.deepEqual(hold.pages, [])
  const reverse = fixture(t)
  reverse.down()
  reverse.move(50, 200, { timeStamp: 100 })
  reverse.move(100, 200, { timeStamp: 125 })
  reverse.up(100, 200, { timeStamp: 130 })
  assert.deepEqual(reverse.pages, [])
})

test('a second press during page settling cannot start an item long press or competing swipe', t => {
  const h = fixture(t)
  h.visual().setPageTransitioning(true)
  const down = h.down()
  assert.equal(down.stopped, true)
  h.elapseLongPress()
  h.move(100)
  h.up(100)
  assert.deepEqual(h.pages, [])
  assert.deepEqual(h.selected, [])
})

test('window resize clears the old page width and any unfinished bounce', async t => {
  const h = fixture(t)
  h.down()
  h.move(180)
  h.visual()
  h.up(180)
  const bounce = h.motions.at(-1)
  h.window.emit('resize')
  assert.equal(h.visual().preview, null)
  assert.equal(h.track.style.transform, 'translate3d(0px, 0, 0)')
  bounce.finish()
  await Promise.resolve()
  assert.deepEqual(h.pages, [])
})

test('reduced motion keeps direct mouse following and returns without a bounce animation', t => {
  const h = fixture(t)
  h.viewport.reducedMotion = true
  h.render()
  h.down()
  h.move(180)
  assert.equal(h.track.style.transform, 'translate3d(-20px, 0, 0)')
  h.up(180)
  assert.equal(h.visual().preview, null)
  assert.equal(h.track.style.transform, 'translate3d(0px, 0, 0)')
  assert.equal(h.motions.length, 0)
})
