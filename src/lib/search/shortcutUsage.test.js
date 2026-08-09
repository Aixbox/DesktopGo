import {
  clearShortcutUsageEntries,
  compareShortcutUsage,
  createDefaultShortcutUsageState,
  normalizeShortcutUsageState,
  recordShortcutLaunch,
  setShortcutUsageEnabled,
} from './shortcutUsage.ts'
import { isMissingShortcutUsageStoreError } from './shortcutUsageStorePolicy.ts'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

let state = createDefaultShortcutUsageState()
state = recordShortcutLaunch(state, 'code', 100)
state = recordShortcutLaunch(state, 'code', 200)
state = recordShortcutLaunch(state, 'terminal', 300)

assert(state.entries.code.launchCount === 2, 'launches should increment the shortcut count')
assert(state.entries.code.lastLaunchedAt === 200, 'the latest launch time should be retained')
assert(
  compareShortcutUsage(state, 'code', 'terminal') < 0,
  'higher launch counts should rank first'
)

const disabled = setShortcutUsageEnabled(state, false)
assert(
  compareShortcutUsage(disabled, 'code', 'terminal') === 0,
  'disabled usage tracking should not affect ranking'
)
assert(
  recordShortcutLaunch(disabled, 'terminal', 400) === disabled,
  'disabled usage tracking should not record launches'
)

const cleared = clearShortcutUsageEntries(disabled)
assert(Object.keys(cleared.entries).length === 0, 'clearing should remove all usage entries')
assert(!cleared.enabled, 'clearing should preserve the enabled preference')

const normalized = normalizeShortcutUsageState({
  enabled: true,
  entries: {
    valid: { launchCount: 3, lastLaunchedAt: 500 },
    invalid: { launchCount: -1, lastLaunchedAt: 'never' },
  },
})
assert(normalized.entries.valid.launchCount === 3, 'valid persisted entries should be retained')
assert(!normalized.entries.invalid, 'invalid persisted entries should be discarded')

const missingPersistedState = normalizeShortcutUsageState(undefined)
assert(
  missingPersistedState.enabled && Object.keys(missingPersistedState.entries).length === 0,
  'missing persisted usage should resolve to an empty default state'
)
assert(
  isMissingShortcutUsageStoreError('The system cannot find the file specified. (os error 2)'),
  'missing store files should be recognized by their OS error'
)
assert(
  !isMissingShortcutUsageStoreError('Failed to deserialize store: expected value at line 1'),
  'store parse errors should remain visible'
)

console.log('快捷入口使用频率测试通过')
