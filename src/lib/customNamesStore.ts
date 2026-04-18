import { LazyStore } from '@tauri-apps/plugin-store'

const STORE_PATH = import.meta.env.DEV ? 'dev/customNames.json' : 'customNames.json'
const KEY = 'customNames'
const store = new LazyStore(STORE_PATH)

export async function loadCustomNames(): Promise<Record<string, string>> {
  try {
    const raw = await store.get<unknown>(KEY)
    if (!raw || typeof raw !== 'object') return {}
    const entries = Object.entries(raw as Record<string, unknown>).filter(
      ([, value]) => typeof value === 'string' && (value as string).length > 0
    ) as Array<[string, string]>
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

export async function saveCustomNames(map: Record<string, string>): Promise<void> {
  await store.set(KEY, map)
  await store.save()
}
