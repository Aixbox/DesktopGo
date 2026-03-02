import { invoke } from "@tauri-apps/api/core";
import type { SearchSort } from "./types";

export type SearchDefaultFilter = "all" | "files" | "folders";

export interface SearchSettings {
  liveOnType: boolean;
  debounceMs: number;
  autoSelectFirst: boolean;
  openOnEnter: boolean;
  openOnDoubleClick: boolean;
  defaultFilter: SearchDefaultFilter;
  maxResultsPerPage: number;
  matchPath: boolean;
  matchCase: boolean;
  regex: boolean;
  matchWholeWord: boolean;
  includeHidden: boolean;
  sortBy: SearchSort;
  rememberLastFilter: boolean;
  preferInstalled: boolean;
  autoStartRuntime: boolean;
  portableServicePipeName: string;
}

const DEFAULT_PIPE_NAME = "EverythingSvcDesktopGo";

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  liveOnType: true,
  debounceMs: 120,
  autoSelectFirst: true,
  openOnEnter: true,
  openOnDoubleClick: true,
  defaultFilter: "all",
  maxResultsPerPage: 50,
  matchPath: false,
  matchCase: false,
  regex: false,
  matchWholeWord: false,
  includeHidden: false,
  sortBy: "name_asc",
  rememberLastFilter: true,
  preferInstalled: true,
  autoStartRuntime: true,
  portableServicePipeName: DEFAULT_PIPE_NAME,
};

const SEARCH_SETTING_KEYS: { [K in keyof SearchSettings]: string } = {
  liveOnType: "search.liveOnType",
  debounceMs: "search.debounceMs",
  autoSelectFirst: "search.autoSelectFirst",
  openOnEnter: "search.openOnEnter",
  openOnDoubleClick: "search.openOnDoubleClick",
  defaultFilter: "search.defaultFilter",
  maxResultsPerPage: "search.maxResultsPerPage",
  matchPath: "search.matchPath",
  matchCase: "search.matchCase",
  regex: "search.regex",
  matchWholeWord: "search.matchWholeWord",
  includeHidden: "search.includeHidden",
  sortBy: "search.sortBy",
  rememberLastFilter: "search.rememberLastFilter",
  preferInstalled: "search.preferInstalled",
  autoStartRuntime: "search.autoStartRuntime",
  portableServicePipeName: "search.portableServicePipeName",
};

const LAST_FILTER_KEY = "search.lastFilter";

const BOOLEAN_KEYS: Array<keyof SearchSettings> = [
  "liveOnType",
  "autoSelectFirst",
  "openOnEnter",
  "openOnDoubleClick",
  "matchPath",
  "matchCase",
  "regex",
  "matchWholeWord",
  "includeHidden",
  "rememberLastFilter",
  "preferInstalled",
  "autoStartRuntime",
];

const asErrorMessage = (error: unknown) => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
};

const clampNumber = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
};

const normalizeFilter = (value: unknown, fallback: SearchDefaultFilter): SearchDefaultFilter => {
  if (value === "all" || value === "files" || value === "folders") return value;
  return fallback;
};

const normalizeSort = (value: unknown, fallback: SearchSort): SearchSort => {
  if (
    value === "name_asc" ||
    value === "name_desc" ||
    value === "path_asc" ||
    value === "date_modified_desc"
  ) {
    return value;
  }
  return fallback;
};

const normalizePipeName = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const normalizeValue = <K extends keyof SearchSettings>(
  key: K,
  value: unknown,
  fallback: SearchSettings[K],
): SearchSettings[K] => {
  if (BOOLEAN_KEYS.includes(key)) {
    return (typeof value === "boolean" ? value : fallback) as SearchSettings[K];
  }

  if (key === "debounceMs") {
    return clampNumber(Number(value), 50, 500, fallback as number) as SearchSettings[K];
  }
  if (key === "maxResultsPerPage") {
    return clampNumber(Number(value), 10, 200, fallback as number) as SearchSettings[K];
  }
  if (key === "defaultFilter") {
    return normalizeFilter(value, fallback as SearchDefaultFilter) as SearchSettings[K];
  }
  if (key === "sortBy") {
    return normalizeSort(value, fallback as SearchSort) as SearchSettings[K];
  }
  if (key === "portableServicePipeName") {
    return normalizePipeName(value, fallback as string) as SearchSettings[K];
  }

  return fallback;
};

const readRawSetting = async (key: string): Promise<unknown | null> => {
  const raw = await invoke<string | null>("get_layout_payload", { key });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const writeRawSetting = async (key: string, value: unknown): Promise<void> => {
  await invoke("set_layout_payload", {
    key,
    payload: JSON.stringify(value),
  });
};

export const loadSearchSettings = async (): Promise<SearchSettings> => {
  const entries = await Promise.all(
    (Object.keys(SEARCH_SETTING_KEYS) as Array<keyof SearchSettings>).map(async (key) => {
      const storageKey = SEARCH_SETTING_KEYS[key];
      const raw = await readRawSetting(storageKey);
      const fallback = DEFAULT_SEARCH_SETTINGS[key];
      const normalized = normalizeValue(key, raw, fallback);
      if (raw === null) {
        await writeRawSetting(storageKey, normalized);
      }
      return [key, normalized] as const;
    }),
  );

  const settings: SearchSettings = { ...DEFAULT_SEARCH_SETTINGS };
  for (const [key, value] of entries) {
    (settings as unknown as Record<string, unknown>)[key] = value;
  }
  return settings;
};

export const saveSearchSetting = async <K extends keyof SearchSettings>(
  key: K,
  value: SearchSettings[K],
): Promise<SearchSettings[K]> => {
  const normalized = normalizeValue(key, value, DEFAULT_SEARCH_SETTINGS[key]);
  await writeRawSetting(SEARCH_SETTING_KEYS[key], normalized);
  return normalized;
};

export const loadLastFilter = async (): Promise<SearchDefaultFilter | null> => {
  try {
    const raw = await readRawSetting(LAST_FILTER_KEY);
    if (raw === "all" || raw === "files" || raw === "folders") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
};

export const saveLastFilter = async (filter: SearchDefaultFilter): Promise<void> => {
  await writeRawSetting(LAST_FILTER_KEY, filter);
};

export const describeSearchRuntimeError = (message: string) => {
  if (message.startsWith("EverythingLiteUnsupported")) {
    return "Detected Everything Lite. Install full Everything to enable IPC search.";
  }
  if (message.startsWith("EverythingNotFound")) {
    return "No available Everything runtime was found.";
  }
  if (message.startsWith("EverythingStartTimeout")) {
    return "Everything startup timed out. Please retry.";
  }
  if (message.startsWith("EverythingIpcUnavailable")) {
    return "Everything IPC is unavailable. Check runtime status.";
  }
  return message;
};

export const getSearchSettingsErrorMessage = (error: unknown) =>
  describeSearchRuntimeError(asErrorMessage(error));
