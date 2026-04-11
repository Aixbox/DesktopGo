import { normalizeShellMenuVerb, shouldRefreshAfterShellMenuVerb } from './shellContextMenu.ts'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(normalizeShellMenuVerb('  Open  ') === 'open', '命令动词应按小写去首尾空白标准化')
assert(shouldRefreshAfterShellMenuVerb('open') === false, '打开命令不应触发图标快照全量刷新')
assert(shouldRefreshAfterShellMenuVerb('properties') === false, '属性命令不应触发图标快照全量刷新')
assert(shouldRefreshAfterShellMenuVerb('rename') === true, '重命名命令应触发图标快照全量刷新')
assert(shouldRefreshAfterShellMenuVerb('Delete') === true, '删除命令应触发图标快照全量刷新')
assert(shouldRefreshAfterShellMenuVerb('') === true, '未知命令应默认触发刷新，避免漏掉潜在变更')

console.log('shellContextMenu 测试通过')
