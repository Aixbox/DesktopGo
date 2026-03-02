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
