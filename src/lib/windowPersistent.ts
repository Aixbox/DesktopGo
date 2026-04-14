export const WINDOW_PERSISTENT_SYNC_EVENT = 'desktopgo://window-persistent-changed'
export const SETTINGS_RETURNED_TO_MAIN_EVENT = 'desktopgo://settings-returned-to-main'

export type WindowPersistentSyncPayload = {
  enabled: boolean
}
