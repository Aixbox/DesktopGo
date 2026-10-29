import { resolveKeyboardDropAction } from './keyboardDropPolicy.ts'

const icon = key => ({ kind: 'icon', key, icon: { path: key, name: key } })
const folder = id => ({ kind: 'folder', id, name: id, size: '1x1', children: [] })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const mergeIcon = resolveKeyboardDropAction({ source: icon('a'), target: icon('b') })
assert(mergeIcon?.kind === 'merge', '键盘拖动图标到图标应生成合并动作')
assert(mergeIcon?.sourceId === 'a' && mergeIcon?.targetId === 'b', '合并动作应保留两端 id')

const mergeFolder = resolveKeyboardDropAction({ source: icon('a'), target: folder('work') })
assert(mergeFolder?.kind === 'merge', '键盘拖动图标到文件夹应生成合并动作')
assert(mergeFolder?.targetId === 'folder:work', '文件夹目标应使用统一的 folder:id')

const reorder = resolveKeyboardDropAction({ source: folder('work'), target: icon('b') })
assert(reorder?.kind === 'reorder', '文件夹不能通过键盘拖动合并到图标')

const dropOnGrid = resolveKeyboardDropAction({ source: icon('a'), target: null })
assert(dropOnGrid?.kind === 'reorder' && dropOnGrid.targetId === null, '无目标时应保留普通 drop')

console.log('keyboardDropPolicy 测试通过')
