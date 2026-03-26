import { LazyStore } from "@tauri-apps/plugin-store";
import type { IconSize, ThemeMode, TitleLineCount, WindowMode } from "@/types";

type SettingKey = "iconSize" | "windowMode" | "titleLineCount" | "themeMode" | "dockEnabled";
type ExtendedSettingKey = SettingKey | "customAppDir";

type SettingValueMap = {
  iconSize: IconSize;
  windowMode: WindowMode;
  titleLineCount: TitleLineCount;
  themeMode: ThemeMode;
  dockEnabled: boolean;
  customAppDir: string;
};

const SETTINGS_STORE_VERSION = 1;
const SETTINGS_VERSION_KEY = "settingsVersion";
const MANAGED_SETTING_KEYS: ExtendedSettingKey[] = [
  "iconSize",
  "windowMode",
  "titleLineCount",
  "themeMode",
  "dockEnabled",
  "customAppDir",
];

const DEFAULT_SETTINGS: SettingValueMap = {
  iconSize: "medium",
  windowMode: "fullscreen",
  titleLineCount: "two",
  themeMode: "dark",
  dockEnabled: true,
  customAppDir: "",
};

const store = new LazyStore("settings.json");
const managedStoreKeys = new Set<string>([...MANAGED_SETTING_KEYS, SETTINGS_VERSION_KEY]);
let storeReadyPromise: Promise<void> | null = null;

const isIconSize = (value: unknown): value is IconSize =>
  value === "large" || value === "medium" || value === "small";

const isWindowMode = (value: unknown): value is WindowMode =>
  value === "fullscreen" || value === "large" || value === "medium" || value === "small";

const isTitleLineCount = (value: unknown): value is TitleLineCount =>
  value === "one" || value === "two";

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "system" || value === "dark" || value === "light";

const isDockEnabled = (value: unknown): value is boolean => typeof value === "boolean";

const isCustomAppDir = (value: unknown): value is string => typeof value === "string";

const validators: {
  [K in ExtendedSettingKey]: (value: unknown) => value is SettingValueMap[K];
} = {
  iconSize: isIconSize,
  windowMode: isWindowMode,
  titleLineCount: isTitleLineCount,
  themeMode: isThemeMode,
  dockEnabled: isDockEnabled,
  customAppDir: isCustomAppDir,
};

async function migrateStore(): Promise<void> {
  for (const key of MANAGED_SETTING_KEYS) {
    const value = await store.get<unknown>(key);
    if (!validators[key](value)) {
      await store.set(key, DEFAULT_SETTINGS[key]);
    }
  }

  const version = await store.get<unknown>(SETTINGS_VERSION_KEY);
  if (version !== SETTINGS_STORE_VERSION) {
    await store.set(SETTINGS_VERSION_KEY, SETTINGS_STORE_VERSION);
  }

  const keys = await store.keys();
  for (const key of keys) {
    if (!managedStoreKeys.has(key)) {
      await store.delete(key);
    }
  }
}

async function ensureStoreReady(): Promise<void> {
  if (!storeReadyPromise) {
    storeReadyPromise = migrateStore().catch((error) => {
      storeReadyPromise = null;
      throw error;
    });
  }
  await storeReadyPromise;
}

export async function getSetting<K extends ExtendedSettingKey>(key: K): Promise<SettingValueMap[K]> {
  await ensureStoreReady();
  const value = await store.get<unknown>(key);
  return validators[key](value) ? value : DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends ExtendedSettingKey>(
  key: K,
  value: SettingValueMap[K],
): Promise<void> {
  await ensureStoreReady();
  await store.set(key, value);
}
