import { emit } from '@tauri-apps/api/event'
import { LazyStore } from '@tauri-apps/plugin-store'
import {
  clearShortcutUsageEntries,
  normalizeShortcutUsageState,
  recordShortcutLaunch,
  setShortcutUsageEnabled,
  type ShortcutUsageState,
} from './shortcutUsage'

export const SHORTCUT_USAGE_CHANGED_EVENT = 'desktopgo://shortcut-usage-changed'

const STORE_PATH = import.meta.env.DEV
  ? 'dev/search-shortcut-usage.json'
  : 'search-shortcut-usage.json'
const STATE_KEY = 'state'
const store = new LazyStore(STORE_PATH)
let mutationQueue: Promise<void> = Promise.resolve()

export async function loadShortcutUsage(): Promise<ShortcutUsageState> {
  await store.reload()
  return normalizeShortcutUsageState(await store.get<unknown>(STATE_KEY))
}

const broadcastState = async (state: ShortcutUsageState) => {
  try {
    await emit<ShortcutUsageState>(SHORTCUT_USAGE_CHANGED_EVENT, state)
  } catch (error) {
    console.error('Failed to broadcast shortcut usage change:', error)
  }
}

const mutateShortcutUsage = (
  update: (current: ShortcutUsageState) => ShortcutUsageState
): Promise<ShortcutUsageState> => {
  const operation = mutationQueue.then(async () => {
    const current = await loadShortcutUsage()
    const next = update(current)
    if (next !== current) {
      await store.set(STATE_KEY, next)
      await store.save()
      await broadcastState(next)
    }
    return next
  })

  mutationQueue = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

export const saveShortcutUsageEnabled = (enabled: boolean) =>
  mutateShortcutUsage(current => setShortcutUsageEnabled(current, enabled))

export const clearStoredShortcutUsage = () =>
  mutateShortcutUsage(current => clearShortcutUsageEntries(current))

export const recordStoredShortcutLaunch = (shortcutId: string) =>
  mutateShortcutUsage(current => recordShortcutLaunch(current, shortcutId))
