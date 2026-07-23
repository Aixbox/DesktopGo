let pendingSync: Promise<void> = Promise.resolve()
let skipReturnToMainOnClose = false

export function trackWindowPersistentSync(task: Promise<void>) {
  pendingSync = task
}

export function waitForWindowPersistentSync() {
  return pendingSync
}

export function setSkipReturnToMainOnClose(skip: boolean) {
  skipReturnToMainOnClose = skip
}

export function shouldSkipReturnToMainOnClose() {
  return skipReturnToMainOnClose
}
