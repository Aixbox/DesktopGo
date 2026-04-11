const NON_REFRESHING_SHELL_VERBS = new Set([
  'open',
  'opennew',
  'openas',
  'properties',
  'runas',
  'find',
  'copy',
  'cut',
])

export const normalizeShellMenuVerb = (verb: string | null | undefined) =>
  verb?.trim().toLocaleLowerCase() ?? ''

export const shouldRefreshAfterShellMenuVerb = (verb: string | null | undefined) => {
  const normalized = normalizeShellMenuVerb(verb)
  if (!normalized) return true
  return !NON_REFRESHING_SHELL_VERBS.has(normalized)
}
