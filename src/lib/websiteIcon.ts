export const normalizeWebsiteUrl = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return ''
    return url.toString()
  } catch {
    return ''
  }
}

export const deriveWebsiteName = (value: string): string => {
  const normalized = normalizeWebsiteUrl(value)
  if (!normalized) return ''

  try {
    return new URL(normalized).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}
