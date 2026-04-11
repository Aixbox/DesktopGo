import {
  DEFAULT_LAUNCHPAD_OPEN_FOCUS_TARGET,
  isLaunchpadOpenFocusTarget,
  normalizeLaunchpadOpenFocusTarget,
} from './launchpadOpenFocus.ts'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(
  DEFAULT_LAUNCHPAD_OPEN_FOCUS_TARGET === 'launchpad',
  '启动台打开时的默认焦点应为直接打开，避免默认激活搜索栏'
)
assert(isLaunchpadOpenFocusTarget('search') === true, 'search 应被识别为合法焦点目标')
assert(isLaunchpadOpenFocusTarget('launchpad') === true, 'launchpad 应被识别为合法焦点目标')
assert(
  isLaunchpadOpenFocusTarget('unknown') === false,
  '未知焦点目标不应通过类型守卫校验'
)
assert(
  normalizeLaunchpadOpenFocusTarget('launchpad') === 'launchpad',
  '合法的启动台焦点目标不应被改写'
)
assert(
  normalizeLaunchpadOpenFocusTarget('invalid-value') === DEFAULT_LAUNCHPAD_OPEN_FOCUS_TARGET,
  '非法的启动台焦点目标应回退到默认值'
)

console.log('launchpadOpenFocus 测试通过')
