import { invoke } from "@tauri-apps/api/core";
import type { SearchPage, SearchQuery, SearchRuntimeStatus } from "./types";

const SEARCH_COMMAND_TIMEOUT_MS = 8_000;

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, message: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });

export const startSearchRuntime = () =>
  withTimeout(
    invoke<SearchRuntimeStatus>("start_search_runtime"),
    SEARCH_COMMAND_TIMEOUT_MS,
    "Everything runtime startup timed out.",
  );

export const getSearchRuntimeStatus = () =>
  invoke<SearchRuntimeStatus>("get_search_runtime_status");

export const searchFiles = (query: SearchQuery) =>
  withTimeout(
    invoke<SearchPage>("search_files", { query }),
    SEARCH_COMMAND_TIMEOUT_MS,
    "Everything search timed out.",
  );
