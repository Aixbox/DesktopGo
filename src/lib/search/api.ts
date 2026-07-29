import { invoke } from '@tauri-apps/api/core'
import type {
  SearchPage,
  SearchPreview,
  SearchQuery,
  SearchResultIcon,
  SearchRuntimeStatus,
} from './types'

const SEARCH_RUNTIME_TIMEOUT_MS = 8_000
const SEARCH_ICON_TIMEOUT_MS = 10_000

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, message: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)

    promise.then(
      value => {
        window.clearTimeout(timer)
        resolve(value)
      },
      error => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })

export const startSearchRuntime = () =>
  withTimeout(
    invoke<SearchRuntimeStatus>('start_search_runtime'),
    SEARCH_RUNTIME_TIMEOUT_MS,
    'Everything runtime startup timed out.'
  )

export const getSearchRuntimeStatus = () => invoke<SearchRuntimeStatus>('get_search_runtime_status')

export const searchFiles = (query: SearchQuery) => invoke<SearchPage>('search_files', { query })

export const getSearchResultIcons = (paths: string[], iconSize = 32) =>
  withTimeout(
    invoke<SearchResultIcon[]>('get_search_result_icons', { paths, iconSize }),
    SEARCH_ICON_TIMEOUT_MS,
    'Search icon loading timed out.'
  )

export const getSearchPreview = (path: string) =>
  invoke<SearchPreview>('get_search_preview', { path })

export const recordSearchResultRun = (path: string) => invoke('record_search_result_run', { path })
