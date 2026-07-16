import { shouldOpenCustomIconContextMenu } from './iconContextMenu.ts'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

assert(
  shouldOpenCustomIconContextMenu('custom', false) === true,
  '自定义菜单为默认时，普通右键应打开自定义菜单'
)
assert(
  shouldOpenCustomIconContextMenu('custom', true) === false,
  '自定义菜单为默认时，Shift + 右键应打开系统菜单'
)
assert(
  shouldOpenCustomIconContextMenu('system', false) === false,
  '系统菜单为默认时，普通右键应打开系统菜单'
)
assert(
  shouldOpenCustomIconContextMenu('system', true) === true,
  '系统菜单为默认时，Shift + 右键应打开自定义菜单'
)

console.log('iconContextMenu 测试通过')
