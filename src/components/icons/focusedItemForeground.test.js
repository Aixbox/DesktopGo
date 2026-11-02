import test from 'node:test'
import assert from 'node:assert/strict'
import { focusMirrorLayout, mountFocusedItemForeground } from './focusedItemForeground.ts'
import { getFolderResizeOutlinePaths } from '../icon-grid/domain/folderResizeOutlineGeometry.ts'

class Style {
  values = new Map()
  setProperty(name, value, priority = '') {
    this.values.set(name, { value, priority })
  }
  getPropertyValue(name) {
    return this.values.get(name)?.value ?? ''
  }
  getPropertyPriority(name) {
    return this.values.get(name)?.priority ?? ''
  }
  removeProperty(name) {
    this.values.delete(name)
  }
}

// DOM boundary only: exercise production cloning, source suppression, overflow and cleanup.
class Element {
  nodeType = 1
  childNodes = []
  style = new Style()
  paint = {}
  parent = null
  constructor(tag, attributes = {}, rect = { left: 0, top: 0, width: 80, height: 80 }) {
    this.tag = tag
    this.attributes = { ...attributes }
    this.rect = rect
  }
  getAttributeNames() {
    return Object.keys(this.attributes)
  }
  removeAttribute(name) {
    delete this.attributes[name]
  }
  getBoundingClientRect() {
    return this.rect
  }
  cloneNode() {
    return new Element(this.tag, this.attributes, this.rect)
  }
  matches() {
    return 'data-folder-preview-key' in this.attributes && this.attributes['aria-hidden'] === 'true'
  }
  contains(node) {
    return node === this || this.childNodes.some(child => child.contains(node))
  }
  appendChild(node) {
    this.childNodes.push(node)
    node.parent = this
  }
  remove() {
    if (this.parent) this.parent.childNodes = this.parent.childNodes.filter(child => child !== this)
    this.parent = null
  }
  querySelectorAll() {
    return this.childNodes.flatMap(child => [
      ...(['data-folder-body-hitbox', 'data-item-focus-part', 'data-item-focus-visual'].some(
        key => key in child.attributes
      ) || child.attributes.class === 'icon-image'
        ? [child]
        : []),
      ...child.querySelectorAll(),
    ])
  }
}

function installDom(t) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      getComputedStyle(source) {
        const values = {
          display: 'block',
          width: `${source.rect.width}px`,
          height: `${source.rect.height}px`,
          opacity: source.style.getPropertyValue('opacity') || '1',
          overflow: 'visible',
          transform: 'none',
          'pointer-events': 'auto',
          ...source.paint,
        }
        return {
          ...values,
          length: Object.keys(values).length,
          item: index => Object.keys(values)[index],
          getPropertyValue: name => values[name] ?? '',
        }
      },
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: tag => new Element(tag) },
  })
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else delete globalThis.window
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else delete globalThis.document
  })
}

function folderFixture(scale) {
  const target = new Element('div')
  const rect = { left: 116.25, top: 88.5, width: 144 * scale, height: 168 * scale }
  const surface = new Element('div', { 'data-folder-body-hitbox': '', id: 'surface' }, rect)
  surface.paint = {
    width: '144px',
    height: '168px',
    transform: 'translate(16px, 8px)',
    'border-radius': '18px',
    'corner-shape': 'superellipse(2)',
    'backdrop-filter': 'none',
  }
  const preview = new Element('div', { 'data-item-focus-part': '' })
  const artwork = new Element('img', { class: 'icon-image', src: 'data:image/png;base64,art' })
  preview.appendChild(artwork)
  const hidden = new Element('button', {
    'data-folder-preview-key': 'hidden',
    'aria-hidden': 'true',
  })
  hidden.appendChild(new Element('img'))
  preview.appendChild(hidden)
  const title = new Element('button', { id: 'title' })
  const svg = new Element('svg', { 'data-item-focus-part': '', viewBox: '0 0 144 168' }, rect)
  svg.paint = { width: '144px', height: '168px', overflow: 'visible' }
  const paths = getFolderResizeOutlinePaths({
    width: 144,
    height: 168,
    radius: 18,
    exponent: 4,
    frameStrokeWidth: 2,
    handleArcLength: (18 * Math.PI) / 2,
    rtl: false,
  })
  const handle = new Element('path', {
    d: paths.handle,
    'stroke-width': '6',
    'stroke-linecap': 'round',
    'vector-effect': 'non-scaling-stroke',
  })
  handle.paint = {
    stroke: 'rgb(255, 255, 255)',
    'stroke-width': '6px',
    'vector-effect': 'non-scaling-stroke',
  }
  svg.appendChild(handle)
  const hit = new Element('button', { 'data-folder-resize-hit-area': '' })
  target.appendChild(surface)
  target.appendChild(preview)
  target.appendChild(title)
  target.appendChild(svg)
  target.appendChild(hit)
  return { target, surface, preview, title, svg, hit, rect, paths }
}

test('sharp foreground paints only body, preview and complete protruding handle, without any body clip', t => {
  installDom(t)
  const f = folderFixture(0.97),
    container = new Element('div')
  const cleanup = mountFocusedItemForeground(f.target, container)
  assert.equal(
    container.childNodes.length,
    3,
    'nested artwork is not duplicated; title and hit button stay in the grid'
  )
  const [body, preview, outline] = container.childNodes
  assert.equal(body.style.left, `${f.rect.left}px`)
  for (const value of body.style.transform.match(/[\d.]+/g).map(Number))
    assert.ok(Math.abs(value - 0.97) < 1e-8)
  assert.equal(
    body.childNodes[0].style.getPropertyValue('transform'),
    'none',
    'do not apply the measured transform twice'
  )
  assert.equal(body.childNodes[0].style.getPropertyValue('corner-shape'), 'superellipse(2)')
  assert.equal(body.childNodes[0].style.getPropertyValue('backdrop-filter'), 'none')
  assert.equal(preview.childNodes[0].childNodes.length, 1, 'skip hidden folder entries')
  assert.equal(preview.childNodes[0].childNodes[0].attributes.src, 'data:image/png;base64,art')
  assert.equal(outline.style.overflow, 'visible')
  const svgCopy = outline.childNodes[0],
    handle = svgCopy.childNodes[0]
  assert.equal(svgCopy.attributes.viewBox, '0 0 144 168')
  assert.equal(svgCopy.style.getPropertyValue('overflow'), 'visible')
  assert.equal(svgCopy.style.getPropertyValue('clip-path'), '')
  assert.equal(handle.attributes.d, f.paths.handle)
  assert.equal(handle.attributes['stroke-linecap'], 'round')
  assert.equal(handle.style.getPropertyValue('stroke-width'), '6px')
  assert.equal(handle.style.getPropertyValue('vector-effect'), 'non-scaling-stroke')
  assert.equal(handle.style.getPropertyValue('pointer-events'), 'none')
  assert.equal(f.title.style.getPropertyValue('opacity'), '')
  assert.equal(
    f.hit.style.getPropertyValue('opacity'),
    '',
    'real hit target remains visible to pointer capture'
  )
  for (const source of [f.surface, f.preview, f.svg])
    assert.equal(
      source.style.getPropertyValue('opacity'),
      '0',
      'exclude originals from blur sampling'
    )
  cleanup()
  assert.equal(container.childNodes.length, 0)
  for (const source of [f.surface, f.preview, f.svg])
    assert.equal(source.style.getPropertyValue('opacity'), '')
})

test('dismissal restores original opacity/priority and supports reopening without orphan foreground nodes', t => {
  installDom(t)
  const f = folderFixture(1),
    container = new Element('div')
  f.surface.style.setProperty('opacity', '0.85', 'important')
  f.surface.style.setProperty('transition', 'opacity 200ms', 'important')
  const handler = () => 'capture'
  f.hit.onPointerDown = handler
  for (let session = 0; session < 2; session++) {
    const cleanup = mountFocusedItemForeground(f.target, container)
    assert.equal(container.childNodes[0].childNodes[0].style.getPropertyValue('opacity'), '0.85')
    assert.equal(f.hit.onPointerDown, handler)
    assert.equal(f.surface.style.getPropertyValue('transition'), 'none')
    cleanup()
    assert.equal(container.childNodes.length, 0)
    assert.equal(f.surface.style.getPropertyValue('opacity'), '0.85')
    assert.equal(f.surface.style.getPropertyPriority('opacity'), 'important')
    assert.equal(f.surface.style.getPropertyValue('transition'), 'opacity 200ms')
    assert.equal(f.surface.style.getPropertyPriority('transition'), 'important')
  }
})

test('mirrors preserve subpixel positioning and independent viewport scale', () => {
  const result = focusMirrorLayout(
    { left: 10.25, top: 20.75, width: 97, height: 190 },
    { width: 100, height: 200 }
  )
  assert.equal(result.left, '10.25px')
  assert.equal(result.top, '20.75px')
  assert.equal(result.transform, 'scale(0.97, 0.95)')
})
