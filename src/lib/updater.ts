import { invoke } from '@tauri-apps/api/core'

export const APP_UPDATER_PROGRESS_EVENT = 'desktopgo://updater-progress'

export interface UpdaterConfigurationStatus {
  configured: boolean
  currentVersion: string
  target: string
  endpoints: string[]
  message: string | null
}

export interface AppUpdateInfo {
  version: string
  currentVersion: string
  target: string
  body: string | null
  date: string | null
}

export interface AppUpdateCheckResult {
  configured: boolean
  available: boolean
  currentVersion: string
  target: string
  endpoints: string[]
  update: AppUpdateInfo | null
  message: string | null
}

type UpdateProgressPayload =
  | {
      event: 'started'
      data?: {
        contentLength?: number | null
        content_length?: number | null
      }
    }
  | {
      event: 'progress'
      data?: {
        chunkLength?: number
        chunk_length?: number
        downloadedLength?: number
        downloaded_length?: number
        contentLength?: number | null
        content_length?: number | null
      }
    }
  | { event: 'installing' }
  | { event: 'finished' }
  | { event: 'beforeExit' }
  | {
      event: 'error'
      data?: {
        message?: string
      }
    }

export type AppUpdateProgressPayload = UpdateProgressPayload

export const getUpdaterConfigurationStatus = async (): Promise<UpdaterConfigurationStatus> =>
  invoke('get_updater_configuration_status')

export const checkForAppUpdate = async (): Promise<AppUpdateCheckResult> =>
  invoke('check_for_app_update')

export const installAppUpdate = async (): Promise<void> => invoke('install_app_update')
