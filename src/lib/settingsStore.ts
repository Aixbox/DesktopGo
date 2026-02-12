import { LazyStore } from "@tauri-apps/plugin-store";
import type { IconSize, ThemeMode, TitleLineCount, WindowMode } from "@/types";

type SettingKey = "iconSize" | "windowMode" | "titleLineCount" | "themeMode";
type ExtendedSettingKey = SettingKey | "customAppDir";

type SettingValueMap = {
  iconSize: IconSize;
  windowMode: WindowMode;
  titleLineCount: TitleLineCount;
  themeMode: ThemeMode;
  customAppDir: string;
};

const DEFAULT_SETTINGS: SettingValueMap = {
  iconSize: "medium",
  windowMode: "fullscreen",
  titleLineCount: "two",
  themeMode: "dark",
  customAppDir: "",
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

const isCustomAppDir = (value: unknown): value is string => typeof value === "string";

const validators: {
  [K in ExtendedSettingKey]: (value: unknown) => value is SettingValueMap[K];
} = {
  iconSize: isIconSize,
  windowMode: isWindowMode,
  titleLineCount: isTitleLineCount,
  themeMode: isThemeMode,
  customAppDir: isCustomAppDir,
};

export async function getSetting<K extends ExtendedSettingKey>(key: K): Promise<SettingValueMap[K]> {
  const value = await store.get<unknown>(key);
  return validators[key](value) ? value : DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends ExtendedSettingKey>(
  key: K,
  value: SettingValueMap[K],
): Promise<void> {
  await store.set(key, value);
}

export async function syncLegacySettingsFromLocalStorage(): Promise<void> {
  if (legacySynced) return;

  const legacySettings: Partial<Record<ExtendedSettingKey, string | null>> = {
    iconSize: localStorage.getItem("iconSize"),
    windowMode: localStorage.getItem("windowMode"),
    titleLineCount: localStorage.getItem("titleLineCount"),
    themeMode: localStorage.getItem("themeMode"),
    customAppDir: localStorage.getItem("customAppDir"),
  };

  for (const key of Object.keys(DEFAULT_SETTINGS) as ExtendedSettingKey[]) {
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
  localStorage.removeItem("customAppDir");
  legacySynced = true;
}
