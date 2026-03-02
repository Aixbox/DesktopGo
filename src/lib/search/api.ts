import { invoke } from "@tauri-apps/api/core";
import type { SearchPage, SearchQuery, SearchRuntimeStatus } from "./types";

export const startSearchRuntime = () =>
  invoke<SearchRuntimeStatus>("start_search_runtime");

export const getSearchRuntimeStatus = () =>
  invoke<SearchRuntimeStatus>("get_search_runtime_status");

export const stopPortableRuntime = () => invoke<void>("stop_portable_runtime");

export const searchFiles = (query: SearchQuery) =>
  invoke<SearchPage>("search_files", { query });
