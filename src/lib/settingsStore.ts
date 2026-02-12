import { LazyStore } from "@tauri-apps/plugin-store";
import type { IconSize, ThemeMode, TitleLineCount, WindowMode } from "@/types";

type SettingKey = "iconSize" | "windowMode" | "titleLineCount" | "themeMode";

type SettingValueMap = {
  iconSize: IconSize;
  windowMode: WindowMode;
  titleLineCount: TitleLineCount;
  themeMode: ThemeMode;
};

const DEFAULT_SETTINGS: SettingValueMap = {
  iconSize: "medium",
  windowMode: "fullscreen",
  titleLineCount: "two",
  themeMode: "dark",
};

const store = new LazyStore("settings.json");
let legacySynced = false;

const isIconSize = (value: unknown): value is IconSize =>
  value === "large" || value === "medium" || value === "small";

const isWindowMode = (value: unknown): value is WindowMode =>
  value === "fullscreen" || value === "large" || value === "medium" || value === "small";

const isTitleLineCount = (value: unknown): value is TitleLineCount =>
  value === "one" || value === "two";

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "system" || value === "dark" || value === "light";

const validators: {
  [K in SettingKey]: (value: unknown) => value is SettingValueMap[K];
} = {
  iconSize: isIconSize,
  windowMode: isWindowMode,
  titleLineCount: isTitleLineCount,
  themeMode: isThemeMode,
};

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValueMap[K]> {
  const value = await store.get<unknown>(key);
  return validators[key](value) ? value : DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: SettingValueMap[K],
): Promise<void> {
  await store.set(key, value);
}

export async function syncLegacySettingsFromLocalStorage(): Promise<void> {
  if (legacySynced) return;

  const legacySettings: Partial<Record<SettingKey, string | null>> = {
    iconSize: localStorage.getItem("iconSize"),
    windowMode: localStorage.getItem("windowMode"),
    titleLineCount: localStorage.getItem("titleLineCount"),
    themeMode: localStorage.getItem("themeMode"),
  };

  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    const exists = await store.has(key);
    if (!exists) {
      const legacyValue = legacySettings[key];
      const value =
        legacyValue !== null && validators[key](legacyValue)
          ? legacyValue
          : DEFAULT_SETTINGS[key];
      await store.set(key, value);
    }
  }

  localStorage.removeItem("iconSize");
  localStorage.removeItem("windowMode");
  localStorage.removeItem("titleLineCount");
  localStorage.removeItem("themeMode");
  legacySynced = true;
}
