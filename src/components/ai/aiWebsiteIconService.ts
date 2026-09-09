import { invoke } from '@tauri-apps/api/core'
import { deriveWebsiteName, normalizeWebsiteUrl } from '@/lib/websiteIcon'
import type { AiWebsiteAddition } from '@/lib/aiOrganizeSessions'
import type { DesktopIcon } from '@/types'

interface WebsiteIconResult {
  url: string
  title: string
  icon_base64: string
}

interface ImportIconsResult {
  imported_count: number
  duplicate_count: number
}

export async function createAiWebsiteIcon(addition: AiWebsiteAddition) {
  const url = normalizeWebsiteUrl(addition.url)
  if (!url) throw new Error(`网页地址无效：${addition.url}`)

  const extracted = await invoke<WebsiteIconResult>('extract_website_icon', { url })
  const displayName =
    addition.display_name.trim() || extracted.title.trim() || deriveWebsiteName(url)
  const result = await invoke<ImportIconsResult>('create_icon_entry', {
    input: {
      displayName,
      targetPath: extracted.url || url,
      launchArguments: '',
      workingDirectory: '',
      customIconPath: '',
      websiteIconBase64: extracted.icon_base64,
      generatedIconBase64: '',
      iconSource: 'target',
      iconColor: 'none',
      iconText: '',
    },
  })

  return { ...result, url: extracted.url || url, displayName }
}

export const findWebsiteIcon = (icons: DesktopIcon[], targetUrl: string) => {
  const normalizedTarget = normalizeWebsiteUrl(targetUrl)
  if (!normalizedTarget) return null
  return icons.find(icon => normalizeWebsiteUrl(icon.target_path) === normalizedTarget) ?? null
}
