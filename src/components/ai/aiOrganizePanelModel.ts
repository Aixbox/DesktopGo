import { translate } from '@/lib/i18n'
import type { AiConfig } from '@/lib/aiConfigStore'
import { normalizeAiFolderSize, type AiClassifyResult, type AiGroup } from '@/lib/aiOrganize'
import { createAiOrganizeId, type AiOrganizeSession } from '@/lib/aiOrganizeSessions'
import type { FolderSize } from '@/components/icon-grid/model'

export type AiOrganizePhase = 'idle' | 'loading' | 'preview' | 'applying'
export type AiOrganizeRunStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'failed'
  | 'notConfigured'
  | 'empty'
  | 'applying'

export const AI_ORGANIZE_AGENT_EVENT = 'ai-organize:agent-event'
export const MAX_AGENT_EVENTS = 80
export const MAX_CONVERSATION_CONTEXT_MESSAGES = 8

/** 用户停止生成时后端返回的哨兵错误，需与 Rust 侧 AI_RUN_CANCELLED_MESSAGE 完全一致。 */
export const AI_RUN_CANCELLED = '已停止生成。'

const MAX_PROMPT_CONTEXT_CHARS = 2600

export const PROMPT_PRESETS = [
  {
    id: 'balanced',
    label: '按用途整理',
    description: '生成稳定、克制的常用分类。',
    prompt: '按软件用途整理图标，优先生成稳定清晰的常用分类，文件夹名称保持简短。',
  },
  {
    id: 'work',
    label: '工作优先',
    description: '先收拢开发、办公、设计和系统工具。',
    prompt:
      '优先整理开发、办公、设计、系统工具等工作类软件；娱乐和游戏类单独收拢，不要和工作工具混在一起。',
  },
  {
    id: 'compact',
    label: '精简分组',
    description: '只保留确定的大类，避免过度整理。',
    prompt: '只创建很确定的大分组，不确定的图标保持未分组，避免把桌面整理得过碎。',
  },
  {
    id: 'refine',
    label: '调整当前预览',
    description: '参考已有预览继续优化。',
    prompt: '参考当前预览继续优化：减少同类分散，修正明显不合适的归类，文件夹名称更短。',
  },
] as const

export interface EditableAiGroup {
  id: string
  folderName: string
  iconKeys: string[]
  folderSize: FolderSize
}

export interface QueuedAiPrompt {
  id: string
  prompt: string
  label?: string
  command?: AiComposerCommand
}

export interface AiComposerCommand {
  kind: 'edit'
  snapshotId?: string
}

export interface AiAgentRunResult extends AiClassifyResult {
  run_id: string
}

export interface AiChatResult {
  content: string
  /** 对话中通过 organize_icons 工具生成分组时返回，驱动前端创建布局预览。 */
  groups?: AiGroup[]
  leftover?: string[]
  run_id?: string
}

export interface AiAgentEvent {
  runId: string
  phase: string
  message: string
  detail?: string
  token?: string
  toolName?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    totalTokens: number
  }
  at: number
}

export const buildAiConfigPayload = (config: AiConfig, customPromptOverride?: string) => ({
  provider: config.provider,
  base_url: config.baseUrl,
  api_key: config.apiKey,
  model: config.model,
  custom_prompt: customPromptOverride ?? config.customPrompt,
  compatible_protocol: config.compatibleProtocol,
  reasoning_effort: config.reasoningEffort,
})

export const toEditableGroups = (aiGroups: AiGroup[]): EditableAiGroup[] =>
  aiGroups.map((group, index) => ({
    id: `ai-group-${index}-${createAiOrganizeId('edit')}`,
    folderName: group.folder_name,
    iconKeys: group.icon_keys,
    folderSize: normalizeAiFolderSize(group.folder_size, group.icon_keys.length),
  }))

export const toAiGroups = (editableGroups: EditableAiGroup[]): AiGroup[] =>
  editableGroups.map(group => ({
    folder_name: group.folderName,
    icon_keys: group.iconKeys,
    folder_size: group.folderSize,
  }))

export const summarizeGroups = (aiGroups: AiGroup[]) => {
  if (aiGroups.length === 0) return translate('没有生成可用分组。')
  return aiGroups
    .slice(0, 8)
    .map(group => `${group.folder_name}(${group.icon_keys.length})`)
    .join('，')
}

export const createAssistantMessageContent = (groupsCount: number, promptLabel?: string) => {
  const prefix = promptLabel ? `${promptLabel}：` : ''
  if (groupsCount === 0) {
    return `${prefix}${translate('这次没有生成可用分组，可以换一个要求继续调整。')}`
  }
  return `${prefix}${translate('已生成 {count} 个分组，可在下方预览并继续调整。', {
    count: groupsCount,
  })}`
}

export const formatSessionTime = (value: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

export const buildConversationPrompt = ({
  basePrompt,
  instruction,
  session,
  currentGroups,
}: {
  basePrompt: string
  instruction: string
  session?: AiOrganizeSession
  currentGroups: EditableAiGroup[]
}) => {
  const sections: string[] = []
  const normalizedBasePrompt = basePrompt.trim()
  if (normalizedBasePrompt) sections.push(normalizedBasePrompt)

  sections.push(`本轮用户要求：${instruction.trim()}`)

  if (currentGroups.length > 0) {
    sections.push(
      `当前预览分组，后续调整请参考但不必机械保留：${JSON.stringify(toAiGroups(currentGroups))}`
    )
  }

  if (session) {
    const recentMessages = session.messages
      .slice(-MAX_CONVERSATION_CONTEXT_MESSAGES)
      .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
      .join('\n')
    if (recentMessages) sections.push(`最近对话：\n${recentMessages}`)

    const activeSnapshot = session.snapshots.find(
      snapshot => snapshot.id === session.activeSnapshotId
    )
    if (activeSnapshot) {
      sections.push(
        `上一版布局摘要：${activeSnapshot.summary ?? summarizeGroups(activeSnapshot.groups)}`
      )
    }
  }

  return sections.join('\n\n').slice(0, MAX_PROMPT_CONTEXT_CHARS)
}

export const isStreamPhase = (phase: string) => phase === 'token' || phase === 'reasoningToken'

export const getAgentEventLabel = (event: AiAgentEvent): string => {
  switch (event.phase) {
    case 'started':
      return translate('AI Agent 正在准备图标清单')
    case 'context':
      return translate('已读取历史整理偏好')
    case 'model':
      return translate('正在请求模型生成草稿')
    case 'token':
      return translate('模型正在流式生成草稿')
    case 'reasoningToken':
      return translate('模型正在深度思考')
    case 'reasoning':
      return translate('模型正在规划整理策略')
    case 'request':
      return translate('模型请求已发出')
    case 'toolCall':
      return translate('正在校验整理结果')
    case 'toolResult':
      return translate('工具调用已完成')
    case 'usage':
      return translate('模型用量已返回')
    case 'draft':
      return translate('整理草稿已生成')
    case 'saved':
      return translate('整理草稿已保存')
    case 'fallback':
      return event.message ? translate(event.message) : translate('请求失败，正在降级重试')
    case 'error':
      return event.message ? translate(event.message) : translate('运行过程中出现问题')
    case 'failed':
      return event.message ? translate(event.message) : translate('AI Agent 请求失败')
    case 'done':
      return translate('AI Agent 已完成分析')
    default:
      return event.message
  }
}

/** 毫秒时长格式化：不足 1 分钟显示 "8s"，超过显示 "2m 5s"。 */
export const formatAiDuration = (ms: number) => {
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${totalSeconds}s`
}

export const isNearScrollBottom = (element: HTMLElement, threshold = 48) =>
  element.scrollHeight - element.scrollTop - element.clientHeight <= threshold

export const getComposerCommandLabel = () => translate('修改布局')
