import { LazyStore } from '@tauri-apps/plugin-store'
import type {
  AppLanguage,
  IconManagerViewMode,
  IconContextMenuMode,
  IconSize,
  LaunchpadGridViewMode,
  LaunchpadOpenFocusTarget,
  ThemeMode,
  TitleLineCount,
  WindowMode,
  WindowStyle,
} from '@/types'
import {
  DEFAULT_ICON_CORNER_RADIUS,
  DEFAULT_ICON_OPACITY,
  ICON_CORNER_RADIUS_MAX,
  ICON_CORNER_RADIUS_MIN,
  ICON_OPACITY_MAX,
  ICON_OPACITY_MIN,
} from '@/types'
import { isIconManagerViewMode } from './iconManager'
import {
  DEFAULT_LAUNCHPAD_OPEN_FOCUS_TARGET,
  isLaunchpadOpenFocusTarget,
} from './launchpadOpenFocus'

export const DEFAULT_LAUNCHPAD_SHORTCUT = 'Ctrl+Space'

type SettingKey =
  | 'iconSize'
  | 'iconCornerRadius'
  | 'iconOpacity'
  | 'windowMode'
  | 'titleLineCount'
  | 'launchpadGridViewMode'
  | 'themeMode'
  | 'windowStyle'
  | 'language'
  | 'dockEnabled'
  | 'windowPersistent'
  | 'launchOnStartup'
  | 'launchpadShortcut'
  | 'launchpadOpenFocusTarget'
  | 'iconManagerViewMode'
  | 'iconContextMenuMode'
type ExtendedSettingKey = SettingKey

type SettingValueMap = {
  iconSize: IconSize
  iconCornerRadius: number
  iconOpacity: number
  windowMode: WindowMode
  titleLineCount: TitleLineCount
  launchpadGridViewMode: LaunchpadGridViewMode
  themeMode: ThemeMode
  windowStyle: WindowStyle
  language: AppLanguage
  dockEnabled: boolean
  windowPersistent: boolean
  launchOnStartup: boolean
  launchpadShortcut: string
  launchpadOpenFocusTarget: LaunchpadOpenFocusTarget
  iconManagerViewMode: IconManagerViewMode
  iconContextMenuMode: IconContextMenuMode
}

const SETTINGS_STORE_VERSION = 13
const SETTINGS_VERSION_KEY = 'settingsVersion'
const MANAGED_SETTING_KEYS: ExtendedSettingKey[] = [
  'iconSize',
  'iconCornerRadius',
  'iconOpacity',
  'windowMode',
  'titleLineCount',
  'launchpadGridViewMode',
  'themeMode',
  'windowStyle',
  'language',
  'dockEnabled',
  'windowPersistent',
  'launchOnStartup',
  'launchpadShortcut',
  'launchpadOpenFocusTarget',
  'iconManagerViewMode',
  'iconContextMenuMode',
]

const DEFAULT_SETTINGS: SettingValueMap = {
  iconSize: 'medium',
  iconCornerRadius: DEFAULT_ICON_CORNER_RADIUS,
  iconOpacity: DEFAULT_ICON_OPACITY,
  windowMode: 'medium',
  titleLineCount: 'two',
  launchpadGridViewMode: 'paged',
  themeMode: 'system',
  windowStyle: 'default',
  language: 'zh',
  dockEnabled: true,
  windowPersistent: false,
  launchOnStartup: true,
  launchpadShortcut: DEFAULT_LAUNCHPAD_SHORTCUT,
  launchpadOpenFocusTarget: DEFAULT_LAUNCHPAD_OPEN_FOCUS_TARGET,
  iconManagerViewMode: 'list',
  iconContextMenuMode: 'custom',
}

const SETTINGS_STORE_PATH = import.meta.env.DEV ? 'dev/settings.json' : 'settings.json'
const store = new LazyStore(SETTINGS_STORE_PATH)
const managedStoreKeys = new Set<string>([...MANAGED_SETTING_KEYS, SETTINGS_VERSION_KEY])
let storeReadyPromise: Promise<void> | null = null

const isIconSize = (value: unknown): value is IconSize =>
  value === 'large' || value === 'medium' || value === 'small'

const isIconCornerRadius = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= ICON_CORNER_RADIUS_MIN &&
  value <= ICON_CORNER_RADIUS_MAX

const isIconOpacity = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= ICON_OPACITY_MIN &&
  value <= ICON_OPACITY_MAX

const isWindowMode = (value: unknown): value is WindowMode =>
  value === 'fullscreen' || value === 'large' || value === 'medium' || value === 'small'

const isTitleLineCount = (value: unknown): value is TitleLineCount =>
  value === 'one' || value === 'two'

const isLaunchpadGridViewMode = (value: unknown): value is LaunchpadGridViewMode =>
  value === 'paged' || value === 'scroll'

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'system' || value === 'dark' || value === 'light'

const isWindowStyle = (value: unknown): value is WindowStyle =>
  value === 'default' || value === 'nativeAcrylic'

const isAppLanguage = (value: unknown): value is AppLanguage => value === 'zh' || value === 'en'

const isDockEnabled = (value: unknown): value is boolean => typeof value === 'boolean'
const isWindowPersistent = (value: unknown): value is boolean => typeof value === 'boolean'
const isLaunchOnStartup = (value: unknown): value is boolean => typeof value === 'boolean'
const isIconContextMenuMode = (value: unknown): value is IconContextMenuMode =>
  value === 'custom' || value === 'system'

const isLaunchpadShortcut = (value: unknown): value is string => typeof value === 'string'
const isLaunchpadOpenFocus = (value: unknown): value is LaunchpadOpenFocusTarget =>
  isLaunchpadOpenFocusTarget(value)

const validators: {
  [K in ExtendedSettingKey]: (value: unknown) => value is SettingValueMap[K]
} = {
  iconSize: isIconSize,
  iconCornerRadius: isIconCornerRadius,
  iconOpacity: isIconOpacity,
  windowMode: isWindowMode,
  titleLineCount: isTitleLineCount,
  launchpadGridViewMode: isLaunchpadGridViewMode,
  themeMode: isThemeMode,
  windowStyle: isWindowStyle,
  language: isAppLanguage,
  dockEnabled: isDockEnabled,
  windowPersistent: isWindowPersistent,
  launchOnStartup: isLaunchOnStartup,
  launchpadShortcut: isLaunchpadShortcut,
  launchpadOpenFocusTarget: isLaunchpadOpenFocus,
  iconManagerViewMode: isIconManagerViewMode,
  iconContextMenuMode: isIconContextMenuMode,
}

async function migrateStore(): Promise<void> {
  const version = await store.get<unknown>(SETTINGS_VERSION_KEY)
  const numericVersion = typeof version === 'number' ? version : 0

  for (const key of MANAGED_SETTING_KEYS) {
    const value = await store.get<unknown>(key)
    if (!validators[key](value)) {
      await store.set(key, DEFAULT_SETTINGS[key])
    }
  }

  if (numericVersion < 8) {
    // 该设置尚未正式发布前，早期本地环境可能已经把旧默认值 search 写入本地。
    // 这里做一次性迁移，确保发布版默认行为切到“直接打开”。
    await store.set('launchpadOpenFocusTarget', DEFAULT_LAUNCHPAD_OPEN_FOCUS_TARGET)
  }

  if (version !== SETTINGS_STORE_VERSION) {
    await store.set(SETTINGS_VERSION_KEY, SETTINGS_STORE_VERSION)
  }

  const keys = await store.keys()
  for (const key of keys) {
    if (!managedStoreKeys.has(key)) {
      await store.delete(key)
    }
  }
}

async function ensureStoreReady(): Promise<void> {
  if (!storeReadyPromise) {
    storeReadyPromise = migrateStore().catch(error => {
      storeReadyPromise = null
      throw error
    })
  }
  await storeReadyPromise
}

export async function getSetting<K extends ExtendedSettingKey>(
  key: K
): Promise<SettingValueMap[K]> {
  await ensureStoreReady()
  const value = await store.get<unknown>(key)
  return validators[key](value) ? value : DEFAULT_SETTINGS[key]
}

export async function setSetting<K extends ExtendedSettingKey>(
  key: K,
  value: SettingValueMap[K]
): Promise<void> {
  await ensureStoreReady()
  await store.set(key, value)
}
