const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

/** Tauri Store reports a missing file as an OS error; all other errors must remain visible. */
export const isMissingShortcutUsageStoreError = (error: unknown): boolean => {
  const message = getErrorMessage(error)
  return /(?:os error 2|ENOENT|no such file|cannot find the file|系统找不到指定的文件)/i.test(
    message
  )
}
