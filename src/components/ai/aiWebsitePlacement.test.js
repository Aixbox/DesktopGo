import assert from 'node:assert/strict'
import { placeAiWebsiteIcon } from './aiWebsitePlacement.ts'

const icon = key => ({ kind: 'icon', key, icon: { id: key, name: key, path: key, target_path: key, icon_base64: '', item_type: 'website' } })
const website = placement => ({ url: 'https://example.com/', display_name: 'Example', placement })

const docked = placeAiWebsiteIcon([], [], icon('new'), website('dock'))
assert.deepEqual(docked.dockKeys, ['new'])
assert.equal(docked.resolvedPlacement, 'dock')

const folder = {
  kind: 'folder',
  id: 'folder-1',
  name: '工作',
  size: '1x1',
  children: [icon('existing')],
}
const folded = placeAiWebsiteIcon([folder], [], icon('new'), {
  ...website('folder'),
  folder_name: '工作',
})
assert.equal(folded.items[0].kind, 'folder')
assert.deepEqual(folded.items[0].children.map(item => item.key), ['existing', 'new'])
assert.equal(folded.resolvedPlacement, 'folder')

const fallback = placeAiWebsiteIcon([folder], [], icon('new'), {
  ...website('folder'),
  folder_name: '不存在',
})
assert.equal(fallback.items.at(-1).key, 'new')
assert.equal(fallback.resolvedPlacement, 'grid')

console.log('aiWebsitePlacement tests passed')
