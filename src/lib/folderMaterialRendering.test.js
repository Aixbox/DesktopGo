import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { getColorOsMaterialLayers, getFolderTexturePlacement } from './folderMaterialPolicy.ts'
import { renderFolderMaterialTexture } from './folderMaterialTexture.ts'
import { syncFolderMaterialSurfaces } from './folderMaterialSurfaceSync.ts'

test('material uses separate native day/night mixing instead of placeholder tint', () => {
  assert.deepEqual(getColorOsMaterialLayers(false, 'bright'), {
    mode: 'color-dodge',
    mix: '#00000000',
    blend: '#0000001a',
  })
  assert.deepEqual(getColorOsMaterialLayers(false, 'dark'), {
    mode: 'color-dodge',
    mix: '#37393eff',
    blend: '#2e30333d',
  })
  for (const tone of ['bright', 'dark']) {
    assert.deepEqual(getColorOsMaterialLayers(true, tone), {
      mode: 'overlay',
      mix: '#737373a3',
      blend: '#99999933',
    })
  }
})

test('texture stays in wallpaper coordinates through movement, window insets and scale', () => {
  const wallpaper = { left: 12, top: 12, width: 960, height: 640 }
  const surface = { left: 112, top: 212, width: 100, height: 80 }
  assert.deepEqual(getFolderTexturePlacement(wallpaper, surface, { width: 100, height: 80 }), {
    x: -100,
    y: -200,
    width: 960,
    height: 640,
  })
  assert.deepEqual(
    getFolderTexturePlacement(
      wallpaper,
      { ...surface, width: 50, height: 40 },
      { width: 100, height: 80 }
    ),
    { x: -200, y: -400, width: 1920, height: 1280 }
  )
  assert.equal(
    getFolderTexturePlacement(wallpaper, { ...surface, width: 0 }, { width: 100, height: 80 }),
    null
  )
})

function installRenderer(t) {
  const canvases = [],
    frames = new Map(),
    mutations = [],
    observers = [],
    events = new Map()
  let serial = 0
  function element(rect) {
    const properties = new Map()
    return {
      rect,
      isConnected: true,
      offsetWidth: rect.width,
      offsetHeight: rect.height,
      classList: { contains: () => false },
      style: {
        getPropertyValue: key => properties.get(key) ?? '',
        setProperty: (key, value) => properties.set(key, value),
        removeProperty: key => properties.delete(key),
      },
      getAttribute: () => JSON.stringify([...properties]),
      getBoundingClientRect() {
        return this.rect
      },
      contains(node) {
        return node === this
      },
      matches: () => true,
    }
  }
  const root = element({ left: 0, top: 0, width: 1000, height: 700 })
  const wallpaper = element({ left: 10, top: 10, width: 980, height: 680 })
  const surface = element({ left: 110, top: 210, width: 100, height: 80 })
  const surfaces = [surface]
  const globals = {
    ResizeObserver: class {
      targets = new Set()
      constructor(callback) {
        this.callback = callback
        observers.push(this)
      }
      observe(target) {
        this.targets.add(target)
      }
      unobserve(target) {
        this.targets.delete(target)
      }
      disconnect() {
        this.targets.clear()
      }
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback
        mutations.push(this)
      }
      observe() {}
      disconnect() {
        this.disconnected = true
      }
    },
    requestAnimationFrame: callback => {
      frames.set(++serial, callback)
      return serial
    },
    cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: target => target.style,
    window: {
      addEventListener: (name, fn) => events.set(name, fn),
      removeEventListener: name => events.delete(name),
    },
    document: {
      documentElement: root,
      querySelector: () => wallpaper,
      querySelectorAll: () => surfaces,
      addEventListener: (name, fn) => events.set(name, fn),
      removeEventListener: name => events.delete(name),
      createElement: () => {
        const calls = []
        const context = {
          filter: 'none',
          globalCompositeOperation: 'source-over',
          drawImage(...args) {
            calls.push({ operation: 'drawImage', args, filter: this.filter })
          },
          fillRect(...args) {
            calls.push({
              operation: 'fillRect',
              args,
              color: this.fillStyle,
              mode: this.globalCompositeOperation,
            })
          },
        }
        const canvas = {
          width: 0,
          height: 0,
          calls,
          context,
          getContext: () => context,
          toDataURL: () => 'data:image/png;base64,material',
        }
        canvases.push(canvas)
        return canvas
      },
    },
  }
  const originals = Object.entries(globals).map(([name, value]) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
    return [name, descriptor]
  })
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })
  return {
    canvases,
    root,
    wallpaper,
    surface,
    surfaces,
    element,
    observers,
    mutations,
    frames,
    events,
    flush() {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(fn => fn())
    },
    mutate(target = surface, attributeName = 'style') {
      mutations[0].callback([{ type: 'attributes', target, attributeName }])
    },
  }
}

test('texture applies cover crop, edge extension and blur before material mixing', t => {
  const h = installRenderer(t)
  const result = renderFolderMaterialTexture(
    { naturalWidth: 1600, naturalHeight: 800 },
    {
      width: 800,
      height: 800,
      dark: false,
      tone: 'dark',
      overlay: 0.11,
      backgroundBlur: 0,
      scrim: '240 240 245',
    }
  )
  assert.match(result, /^data:image\/png;/)
  const [source, padded, texture] = h.canvases
  assert.deepEqual(
    source.calls.find(call => call.operation === 'drawImage').args.slice(1),
    [-400, 0, 1600, 800]
  )
  assert.equal(padded.calls.length, 9, 'copy center, four edges and four corners')
  assert.deepEqual([padded.width, padded.height], [992, 992])
  assert.equal(texture.calls[0].filter, 'blur(32px)')
  assert.deepEqual(
    texture.calls.slice(1).map(call => [call.mode, call.color]),
    [
      ['color-dodge', '#37393eff'],
      ['source-over', '#2e30333d'],
    ]
  )
  assert.equal(texture.context.filter, 'none')
})

test('one shared texture tracks scroll, transformed portals, theme, resize and cleanup', t => {
  const h = installRenderer(t)
  const stop = syncFolderMaterialSurfaces({ naturalWidth: 1600, naturalHeight: 900 }, 'dark')
  h.flush()
  assert.match(
    h.root.style.getPropertyValue('--folder-material-texture'),
    /^url\("data:image\/png;/
  )
  assert.equal(h.surface.style.getPropertyValue('background-position'), '-100.000px -200.000px')
  assert.equal(h.surface.style.getPropertyValue('background-size'), '980.000px 680.000px')
  assert.equal(h.frames.size, 0, 'idle grid does not continuously repaint')
  h.mutate()
  assert.equal(h.frames.size, 0, 'own CSS writes do not create an observer loop')
  h.surface.rect.top = 110
  h.events.get('scroll')()
  h.flush()
  assert.equal(h.surface.style.getPropertyValue('background-position'), '-100.000px -100.000px')
  assert.equal(h.canvases.length, 3, 'movement only updates texture coordinates')

  const portal = h.element({ left: 210, top: 310, width: 50, height: 40 })
  portal.style.setProperty('background-image', 'url("stale-focus-copy")')
  portal.style.setProperty('--folder-material-texture', 'url("stale-focus-copy")')
  portal.offsetWidth = 100
  portal.offsetHeight = 80
  h.surfaces.push(portal)
  h.mutations[0].callback([{ type: 'childList' }])
  h.flush()
  assert.equal(portal.style.getPropertyValue('background-size'), '1960.000px 1360.000px')
  assert.equal(portal.style.getPropertyValue('background-position'), '-400.000px -600.000px')
  assert.equal(
    portal.style.getPropertyValue('background-image'),
    'var(--folder-material-texture, none)'
  )
  assert.equal(portal.style.getPropertyValue('--folder-material-texture'), '')
  h.root.classList.contains = () => true
  h.mutate(h.root, 'class')
  h.flush()
  assert.equal(h.canvases.at(-1).calls[1].mode, 'overlay')
  h.wallpaper.rect.width = 800
  h.observers[0].callback()
  h.flush()
  assert.equal(portal.style.getPropertyValue('background-size'), '1600.000px 1360.000px')
  stop()
  assert.equal(h.root.style.getPropertyValue('--folder-material-texture'), '')
  assert.equal(portal.style.getPropertyValue('background-position'), '')
  assert.equal(h.events.size, 0)
  assert.equal(h.observers[0].targets.size, 0)
  assert.equal(h.mutations[0].disconnected, true)
  h.observers[0].callback()
  assert.equal(h.frames.size, 0, 'a late observer callback cannot restart a disposed material')
})

test('CSS transform transitions repaint only for their active duration', t => {
  const h = installRenderer(t)
  const stop = syncFolderMaterialSurfaces({ naturalWidth: 1600, naturalHeight: 900 }, 'bright')
  h.flush()
  h.events.get('transitionrun')({
    type: 'transitionrun',
    target: h.surface,
    propertyName: 'transform',
  })
  h.flush()
  assert.equal(h.frames.size, 1)
  h.surface.rect.left = 160
  h.flush()
  assert.equal(h.surface.style.getPropertyValue('background-position'), '-150.000px -200.000px')
  assert.equal(h.canvases.length, 3)
  h.events.get('transitionend')({
    type: 'transitionend',
    target: h.surface,
    propertyName: 'transform',
  })
  h.flush()
  assert.equal(h.frames.size, 0)
  stop()
})

test('missing Canvas blur safely leaves the material fallback and can recover after a theme change', t => {
  const h = installRenderer(t)
  const createCanvas = document.createElement
  document.createElement = () => {
    const canvas = createCanvas()
    delete canvas.context.filter
    return canvas
  }
  const stop = syncFolderMaterialSurfaces({ naturalWidth: 1600, naturalHeight: 900 }, 'bright')
  h.flush()
  assert.equal(h.root.style.getPropertyValue('--folder-material-texture'), '')
  assert.equal(h.frames.size, 0)
  document.createElement = createCanvas
  h.root.classList.contains = () => true
  h.mutate(h.root, 'class')
  h.flush()
  assert.match(h.root.style.getPropertyValue('--folder-material-texture'), /data:image\/png/)
  stop()
})

test('material keeps its texture without decorative outlines or corner overrides', () => {
  const css = postcss.parse(
    readFileSync(new URL('../styles/folder-material.css', import.meta.url), 'utf8')
  )
  const declarations = []
  css.walkDecls(decl => declarations.push(decl))
  for (const decl of declarations) {
    if (decl.prop.includes('backdrop-filter')) assert.equal(decl.value, 'none')
    assert.equal(decl.prop.includes('radius'), false)
    assert.notEqual(decl.prop, 'corner-shape')
    if (decl.prop === 'box-shadow') assert.equal(decl.value, 'none')
    if (decl.prop === 'border-color') {
      assert.equal(
        decl.value,
        decl.parent.parent.type === 'atrule' &&
          decl.parent.parent.params === '(forced-colors: active)'
          ? 'CanvasText'
          : 'transparent'
      )
    }
  }
  css.walkRules(rule => assert.equal(/::(?:before|after)/.test(rule.selector), false))
  assert.ok(
    declarations.some(
      decl => decl.prop === 'background-image' && decl.value.includes('--folder-material-texture')
    )
  )
})
