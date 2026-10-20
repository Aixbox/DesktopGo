import { findNewlyAddedIconKeys } from './iconRefreshPolicy.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const addedKeys = findNewlyAddedIconKeys(new Set(['existing']), [
  'existing',
  'imported-a',
  'imported-b',
  'imported-a',
])

assert(addedKeys.join(',') === 'imported-a,imported-b', '只应返回唯一的新增图标键')

console.log('iconRefreshPolicy 测试通过')
