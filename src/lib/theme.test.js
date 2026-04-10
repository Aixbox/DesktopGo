import {
  planThemeSyncOnSystemPreferenceChange,
  resolveEffectiveThemeMode,
} from './themePolicy.ts'

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
  resolveEffectiveThemeMode('dark', 'nativeAcrylic'),
  'dark',
  '亚克力风格下手动深色模式不应被强制改写为 system'
)

assertEqual(
  resolveEffectiveThemeMode('light', 'nativeAcrylic'),
  'light',
  '亚克力风格下手动浅色模式不应被强制改写为 system'
)

assertEqual(
  planThemeSyncOnSystemPreferenceChange('dark', 'nativeAcrylic', true),
  {
    applyMode: 'dark',
    emitMode: 'dark',
    saveMode: 'dark',
    refreshNativeAcrylic: true,
  },
  '亚克力风格在系统切到深色时，应用主题也应同步到深色'
)

assertEqual(
  planThemeSyncOnSystemPreferenceChange('dark', 'nativeAcrylic', false),
  {
    applyMode: 'light',
    emitMode: 'light',
    saveMode: 'light',
    refreshNativeAcrylic: true,
  },
  '亚克力风格在系统切到浅色时，应用主题也应同步到浅色'
)

assertEqual(
  planThemeSyncOnSystemPreferenceChange('system', 'nativeAcrylic', true),
  {
    applyMode: 'dark',
    emitMode: 'dark',
    saveMode: 'dark',
    refreshNativeAcrylic: true,
  },
  '亚克力风格在跟随系统模式下也应同步到当前系统深色'
)

assertEqual(
  planThemeSyncOnSystemPreferenceChange('system', 'default', true),
  {
    applyMode: 'system',
    emitMode: 'system',
    saveMode: null,
    refreshNativeAcrylic: false,
  },
  '默认风格在跟随系统模式下应更新页面主题，但不需要刷新原生亚克力'
)

assertEqual(
  planThemeSyncOnSystemPreferenceChange('dark', 'default', false),
  null,
  '默认风格下手动深色模式不应响应系统主题变化'
)

console.log('theme 测试通过')
