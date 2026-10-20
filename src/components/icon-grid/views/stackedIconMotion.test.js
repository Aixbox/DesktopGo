import { getStackedIconMotionKey } from './stackedIconMotion.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const stackedIcons = [{ id: 'selected-b' }, { id: 'selected-c' }]
const rerenderedStackedIcons = stackedIcons.map(icon => ({ ...icon }))

assert(
  getStackedIconMotionKey(rerenderedStackedIcons) === getStackedIconMotionKey(stackedIcons),
  '仅重新创建拖拽跟随图标数组时应保留当前动效会话'
)
assert(
  getStackedIconMotionKey([...stackedIcons, { id: 'selected-d' }]) !==
    getStackedIconMotionKey(stackedIcons),
  '跟随图标集合变化时应更新动效会话'
)

console.log('stackedIconMotion 测试通过')
