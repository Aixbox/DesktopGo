export const WINDOW_PERSISTENT_SYNC_EVENT = 'desktopgo://window-persistent-changed'
export const SETTINGS_RETURNED_TO_MAIN_EVENT = 'desktopgo://settings-returned-to-main'
export const MAIN_WINDOW_APPEARANCE_SYNC_EVENT = 'desktopgo://main-window-appearance-sync'

export type WindowPersistentSyncPayload = {
  enabled: boolean
}
