import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'

const material = postcss.parse(
  readFileSync(new URL('../styles/folder-material.css', import.meta.url), 'utf8')
)
const globals = postcss.parse(
  readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8')
)
const surfaceSelector =
  "[data-folder-material='coloros'] :is(.folder-icon-surface, .launchpad-material-surface)"
const surface = material.nodes.find(node => node.selector === surfaceSelector)
const declaration = (rule, property) => rule?.nodes.find(node => node.prop === property)

test('folders, Dock and search opt into native live blur with no precomputed texture', () => {
  assert.ok(surface)
  assert.match(declaration(surface, 'filter')?.value ?? '', /^brightness\(\d+(?:\.\d+)?\)$/)
  assert.equal(declaration(surface, 'background-color')?.value, 'var(--coloros-folder-fill)')
  assert.equal(declaration(surface, 'background-image')?.value, 'none')
  assert.equal(declaration(surface, 'border-color')?.value, 'transparent')
  assert.equal(declaration(surface, 'box-shadow')?.value, 'none')
  // Blur strength is a visual tuning value, not a fixed behavioral contract.
  const backdrop = declaration(surface, 'backdrop-filter')?.value ?? ''
  const blur = backdrop.match(/(?:^|\s)blur\((\d+(?:\.\d+)?)px\)(?=\s|$)/)
  assert.ok(blur && Number(blur[1]) > 0, 'frost must retain a positive live backdrop blur')
  assert.equal(declaration(surface, '-webkit-backdrop-filter')?.value, backdrop)
  for (const property of ['backdrop-filter', '-webkit-backdrop-filter']) {
    assert.equal(declaration(surface, property)?.important, true)
  }
  material.walkDecls(decl => {
    assert.doesNotMatch(decl.value, /--folder-material-texture|url\(/)
    assert.notEqual(decl.prop, 'opacity', 'background alpha must not fade the entire control')
    assert.ok(
      !['border-radius', 'corner-shape'].includes(decl.prop),
      'component geometry stays intact'
    )
  })
})

test('the material opt-in outranks the launchpad compatibility reset without enabling other panels', () => {
  // Both rules are unlayered and important. The scoped surface selector has two
  // class/attribute components; each blanket descendant selector only has one.
  assert.equal(surface.parent.type, 'root')
  for (const name of ['launchpad-bg', 'launchpad-scroll-layout']) {
    const reset = globals.nodes.find(node => {
      if (!node.selector) return false
      const selectors = postcss.list.comma(node.selector)
      return selectors.length === 2 && selectors[0] === `.${name}` && selectors[1] === `.${name} *`
    })
    assert.ok(reset, `${name} keeps its scoped compatibility rule`)
    assert.equal(reset.parent.type, 'root')
    for (const property of ['backdrop-filter', '-webkit-backdrop-filter']) {
      assert.equal(declaration(reset, property)?.value, 'none')
      assert.equal(declaration(reset, property)?.important, true)
      assert.equal(declaration(surface, property)?.important, true)
    }
  }
  const optIns = []
  material.walkDecls('backdrop-filter', decl => {
    if (decl.value !== 'none') optIns.push(decl.parent.selector)
  })
  assert.deepEqual(optIns, [surfaceSelector])
})

test('both themes keep translucent tint colors while allowing visual tuning', () => {
  for (const selector of [
    "[data-folder-material='coloros']",
    ":root.dark[data-folder-material='coloros']",
  ]) {
    const rule = material.nodes.find(node => node.selector === selector)
    const fill = declaration(rule, '--coloros-folder-fill')?.value ?? ''
    const rgba = fill.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*(\d+(?:\.\d+)?)%\s*\)$/)
    assert.ok(rgba, `${selector} must define an RGB tint with explicit alpha`)
    assert.ok(rgba.slice(1, 4).every(channel => Number(channel) <= 255))
    assert.ok(
      Number(rgba[4]) > 0 && Number(rgba[4]) < 100,
      'tint must let the blurred backdrop show through'
    )
  }
})

for (const condition of ['(prefers-reduced-transparency: reduce)', '(forced-colors: active)']) {
  test(`${condition} turns off both blur and brightness and uses an opaque background`, () => {
    const media = material.nodes.find(node => node.type === 'atrule' && node.params === condition)
    const accessible = media.nodes.find(node => node.selector === surfaceSelector)
    assert.equal(declaration(accessible, 'filter')?.value, 'none')
    for (const property of ['backdrop-filter', '-webkit-backdrop-filter']) {
      assert.equal(declaration(accessible, property)?.value, 'none')
      assert.equal(declaration(accessible, property)?.important, true)
    }
    assert.equal(
      declaration(accessible, 'background')?.value,
      condition === '(forced-colors: active)'
        ? 'Canvas'
        : 'color-mix(in srgb, var(--background) 88%, var(--foreground) 12%)'
    )
  })
}

test('search focus and filter-button states remain available with the new surface', () => {
  const focus = material.nodes.find(
    node => node.selector === '.launchpad-search-bar:has(.launchpad-search-input:focus-visible)'
  )
  assert.equal(declaration(focus, 'outline')?.value, '2px solid var(--ring)')
  assert.equal(declaration(focus, 'outline-offset')?.value, '0')
  const filter = material.nodes.find(node => node.selector === '.launchpad-search-filter')
  assert.deepEqual(
    filter.nodes.map(node => node.prop),
    ['text-shadow']
  )
  for (const selector of ['.launchpad-glass-button', '.launchpad-glass-button:hover']) {
    const rule = globals.nodes.find(node => node.selector === selector)
    assert.match(declaration(rule, 'background')?.value ?? '', /var\(--background\) (64|78)%/)
  }
})

test('folder hover and press wrappers cannot cut live backdrop sampling off from the wallpaper', () => {
  const wrapperSelectors = [
    "[data-folder-material='coloros'] .folder-tile-body",
    "[data-folder-material='coloros'] .launchpad-dock-motion:has(.folder-icon-surface[data-item-focus-visual])",
  ]
  for (const selector of wrapperSelectors) {
    const override = material.nodes.find(
      node =>
        node.selector &&
        postcss.list
          .comma(node.selector)
          .map(value => value.replace(/\s+/g, ' '))
          .includes(selector)
    )
    assert.ok(override, `${selector} must keep its descendants' backdrop accessible`)
    assert.equal(declaration(override, 'filter')?.value, 'none')
    assert.equal(declaration(override, 'filter')?.important, true)
    assert.equal(
      declaration(override, 'transform'),
      undefined,
      'Dock lift and press movement stay intact'
    )
    assert.equal(declaration(override, 'opacity'), undefined)
  }
  for (const selector of [
    '.folder-tile-body:hover',
    '.folder-tile-body:active',
    '.launchpad-dock-motion:hover',
    '.launchpad-dock-motion:active',
  ]) {
    const rule = globals.nodes.find(node => node.selector === selector)
    const filter = declaration(rule, 'filter')
    assert.ok(
      filter && filter.value !== 'none',
      'other materials keep their original interaction effects'
    )
    assert.ok(!filter.important, 'the frost wrapper override must win for hover and press')
  }
})
