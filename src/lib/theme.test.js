import { planThemeSyncOnSystemPreferenceChange } from './themePolicy.ts'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual, expected, message) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}\n期望：${JSON.stringify(expected)}\n实际：${JSON.stringify(actual)}`
  )
}

assertEqual(
  planThemeSyncOnSystemPreferenceChange('system', 'default', true),
  {
    applyMode: 'system',
    emitMode: 'system',
    saveMode: null,
  },
  '跟随系统模式下应更新页面主题'
)

assertEqual(
  planThemeSyncOnSystemPreferenceChange('system', 'default', false),
  {
    applyMode: 'system',
    emitMode: 'system',
    saveMode: null,
  },
  '系统切到浅色时仍应保持跟随系统模式'
)

assertEqual(
  planThemeSyncOnSystemPreferenceChange('dark', 'default', false),
  null,
  '手动深色模式不应响应系统主题变化'
)

console.log('theme 测试通过')
