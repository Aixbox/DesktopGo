import { invoke } from '@tauri-apps/api/core'
import { normalizeAiFolderSize, type AiGroup } from './aiOrganize'

const AI_ORGANIZE_SESSIONS_KEY = 'desktopgo.ai.organize.sessions.v1'
const MAX_AI_ORGANIZE_SESSIONS = 18
const MAX_AI_ORGANIZE_MESSAGES = 48
const MAX_AI_ORGANIZE_SNAPSHOTS = 12

// 思考轨迹只保留尾部若干字符，避免长推理把会话存储撑爆。
export const MAX_REASONING_TRACE_CHARS = 6000

export type AiOrganizeMessageRole = 'user' | 'assistant'
export type AiOrganizeMessageStatus = 'running' | 'success' | 'failed'

export interface AiOrganizeMessage {
  id: string
  role: AiOrganizeMessageRole
  content: string
  createdAt: number
  status?: AiOrganizeMessageStatus
  runId?: string
  snapshotId?: string
  error?: string
  reasoning?: string
  /** 思考阶段耗时（毫秒），折叠的思考标题会展示“思考了 X 秒”。 */
  reasoningMs?: number
  /** 整轮回复总耗时（毫秒，从发出请求到收尾），完成后在操作栏展示“用时 Xs”。 */
  responseMs?: number
}

export interface AiOrganizeSnapshot {
  id: string
  createdAt: number
  prompt: string
  groups: AiGroup[]
  leftover: string[]
  runId?: string
  summary?: string
}

export interface AiOrganizeSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: AiOrganizeMessage[]
  snapshots: AiOrganizeSnapshot[]
  activeSnapshotId?: string
}

interface AiOrganizeSessionsPayload {
  sessions: AiOrganizeSession[]
}

export const createAiOrganizeId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const createAiOrganizeSessionTitle = (prompt: string, createdAt: number) => {
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim()
  if (normalizedPrompt) {
    return normalizedPrompt.length > 18 ? `${normalizedPrompt.slice(0, 18)}...` : normalizedPrompt
  }

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt))
}

export const createAiOrganizeSession = (title?: string): AiOrganizeSession => {
  const now = Date.now()
  return {
    id: createAiOrganizeId('ai-session'),
    title: title?.trim() || '新的整理对话',
    createdAt: now,
    updatedAt: now,
    messages: [],
    snapshots: [],
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object'
}

const asString = (value: unknown, fallback = '') => {
  return typeof value === 'string' ? value : fallback
}

const asNumber = (value: unknown, fallback = Date.now()) => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const getLast = <T>(items: T[]): T | undefined => items[items.length - 1]

const normalizeGroups = (value: unknown): AiGroup[] => {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .map(group => {
      const rawIconKeys = group.icon_keys ?? group.iconKeys
      const iconKeys = Array.isArray(rawIconKeys)
        ? rawIconKeys.filter(
            (key): key is string => typeof key === 'string' && key.trim().length > 0
          )
        : []
      return {
        folder_name: asString(group.folder_name ?? group.folderName).trim(),
        icon_keys: iconKeys,
        folder_size: normalizeAiFolderSize(
          group.folder_size ?? group.folderSize ?? group.size,
          iconKeys.length
        ),
      }
    })
    .filter(group => group.folder_name.length > 0 && group.icon_keys.length > 0)
}

const normalizeMessage = (value: unknown): AiOrganizeMessage | null => {
  if (!isRecord(value)) return null
  const role = value.role === 'user' || value.role === 'assistant' ? value.role : null
  if (!role) return null
  const content = asString(value.content).trim()
  if (!content) return null
  const status =
    value.status === 'running' || value.status === 'success' || value.status === 'failed'
      ? value.status
      : undefined

  return {
    id: asString(value.id, createAiOrganizeId('ai-message')),
    role,
    content,
    createdAt: asNumber(value.createdAt),
    status,
    runId: asString(value.runId) || undefined,
    snapshotId: asString(value.snapshotId) || undefined,
    error: asString(value.error) || undefined,
    reasoning: asString(value.reasoning).slice(-MAX_REASONING_TRACE_CHARS) || undefined,
    reasoningMs:
      typeof value.reasoningMs === 'number' &&
      Number.isFinite(value.reasoningMs) &&
      value.reasoningMs > 0
        ? Math.round(value.reasoningMs)
        : undefined,
    responseMs:
      typeof value.responseMs === 'number' &&
      Number.isFinite(value.responseMs) &&
      value.responseMs > 0
        ? Math.round(value.responseMs)
        : undefined,
  }
}

const normalizeSnapshot = (value: unknown): AiOrganizeSnapshot | null => {
  if (!isRecord(value)) return null
  const groups = normalizeGroups(value.groups)
  const leftover = Array.isArray(value.leftover)
    ? value.leftover.filter((key): key is string => typeof key === 'string')
    : []

  return {
    id: asString(value.id, createAiOrganizeId('ai-snapshot')),
    createdAt: asNumber(value.createdAt),
    prompt: asString(value.prompt),
    groups,
    leftover,
    runId: asString(value.runId) || undefined,
    summary: asString(value.summary) || undefined,
  }
}

const normalizeSession = (value: unknown): AiOrganizeSession | null => {
  if (!isRecord(value)) return null
  const now = Date.now()
  const messages = Array.isArray(value.messages)
    ? value.messages
        .map(normalizeMessage)
        .filter((message): message is AiOrganizeMessage => Boolean(message))
    : []
  const snapshots = Array.isArray(value.snapshots)
    ? value.snapshots
        .map(normalizeSnapshot)
        .filter((snapshot): snapshot is AiOrganizeSnapshot => Boolean(snapshot))
    : []
  if (messages.length === 0 && snapshots.length === 0) return null

  const createdAt = asNumber(value.createdAt, now)
  const title = asString(
    value.title,
    createAiOrganizeSessionTitle(messages[0]?.content ?? '', createdAt)
  )
  const activeSnapshotId = asString(value.activeSnapshotId) || getLast(snapshots)?.id

  return {
    id: asString(value.id, createAiOrganizeId('ai-session')),
    title,
    createdAt,
    updatedAt: asNumber(value.updatedAt, createdAt),
    messages: messages.slice(-MAX_AI_ORGANIZE_MESSAGES),
    snapshots: snapshots.slice(-MAX_AI_ORGANIZE_SNAPSHOTS),
    activeSnapshotId,
  }
}

const normalizeSessions = (value: unknown): AiOrganizeSession[] => {
  if (!isRecord(value) || !Array.isArray(value.sessions)) return []

  return value.sessions
    .map(normalizeSession)
    .filter((session): session is AiOrganizeSession => Boolean(session))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_AI_ORGANIZE_SESSIONS)
}

export const loadAiOrganizeSessions = async (): Promise<AiOrganizeSession[]> => {
  const raw = await invoke<string | null>('get_layout_payload', {
    key: AI_ORGANIZE_SESSIONS_KEY,
  })
  if (!raw) return []

  try {
    return normalizeSessions(JSON.parse(raw))
  } catch {
    return []
  }
}

export const saveAiOrganizeSessions = async (sessions: AiOrganizeSession[]) => {
  const payload: AiOrganizeSessionsPayload = {
    sessions: normalizeSessions({ sessions }),
  }

  await invoke('set_layout_payload', {
    key: AI_ORGANIZE_SESSIONS_KEY,
    payload: JSON.stringify(payload),
  })
}

export const upsertAiOrganizeSession = (
  sessions: AiOrganizeSession[],
  session: AiOrganizeSession
) => {
  return [session, ...sessions.filter(current => current.id !== session.id)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_AI_ORGANIZE_SESSIONS)
}
