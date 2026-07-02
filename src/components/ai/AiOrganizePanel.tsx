import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  FolderClosed,
  History,
  Loader2,
  MessageSquareText,
  Plus,
  SendHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { translate } from '@/lib/i18n'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { loadAiConfig, isAiConfigReady, type AiConfig } from '@/lib/aiConfigStore'
import {
  applyAiGroupsToLayout,
  buildAiIconInputs,
  type AiClassifyResult,
  type AiGroup,
} from '@/lib/aiOrganize'
import {
  createAiOrganizeId,
  createAiOrganizeSession,
  createAiOrganizeSessionTitle,
  loadAiOrganizeSessions,
  saveAiOrganizeSessions,
  upsertAiOrganizeSession,
  type AiOrganizeMessage,
  type AiOrganizeSession,
  type AiOrganizeSnapshot,
} from '@/lib/aiOrganizeSessions'
import { hydrateItems, readLayout, writeLayout } from '@/components/icon-grid/services/layoutStore'
import type { DesktopIcon } from '@/types'

interface AiOrganizePanelProps {
  open: boolean
  visible?: boolean
  icons: DesktopIcon[]
  customNames: Record<string, string>
  applyRequestToken?: number
  onRunStateChange?: (state: AiOrganizePanelRunState) => void
  onCollapse?: () => void
  onClose: () => void
  /** 应用成功后由调用方负责通知主窗口刷新布局。 */
  onApplied: () => void | Promise<void>
}

type Phase = 'idle' | 'loading' | 'preview' | 'applying'
type RunStatus = 'idle' | 'running' | 'success' | 'failed' | 'notConfigured' | 'empty' | 'applying'

const AI_ORGANIZE_AGENT_EVENT = 'ai-organize:agent-event'
const MAX_AGENT_EVENTS = 80
const STREAM_FLUSH_INTERVAL_MS = 48
const STREAM_FLUSH_SOFT_CHARS = 56
const STREAM_FLUSH_MIN_CHARS = 280
const STREAM_FLUSH_CATCH_UP_CHARS = 1200
const STREAM_FLUSH_MAX_HOLD_MS = 180
const MAX_STREAM_CHUNKS = 220
const MAX_CONVERSATION_CONTEXT_MESSAGES = 8
const MAX_PROMPT_CONTEXT_CHARS = 2600

const PROMPT_PRESETS = [
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

interface EditableGroup {
  id: string
  folderName: string
  iconKeys: string[]
}

interface AiAgentRunResult extends AiClassifyResult {
  run_id: string
}

export interface AiOrganizePanelRunState {
  canApply: boolean
  applying: boolean
  hasPreview: boolean
}

interface StreamChunk {
  id: number
  text: string
}

interface AiAgentEvent {
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

const buildAiConfigPayload = (config: AiConfig, customPromptOverride?: string) => ({
  base_url: config.baseUrl,
  api_key: config.apiKey,
  model: config.model,
  custom_prompt: customPromptOverride ?? config.customPrompt,
})

const toEditableGroups = (aiGroups: AiGroup[]): EditableGroup[] =>
  aiGroups.map((group, index) => ({
    id: `ai-group-${index}-${createAiOrganizeId('edit')}`,
    folderName: group.folder_name,
    iconKeys: group.icon_keys,
  }))

const toAiGroups = (editableGroups: EditableGroup[]): AiGroup[] =>
  editableGroups.map(group => ({
    folder_name: group.folderName,
    icon_keys: group.iconKeys,
  }))

const summarizeGroups = (aiGroups: AiGroup[]) => {
  if (aiGroups.length === 0) return translate('没有生成可用分组。')
  return aiGroups
    .slice(0, 8)
    .map(group => `${group.folder_name}(${group.icon_keys.length})`)
    .join('，')
}

const createAssistantMessageContent = (groupsCount: number, promptLabel?: string) => {
  const prefix = promptLabel ? `${promptLabel}：` : ''
  if (groupsCount === 0) {
    return `${prefix}${translate('这次没有生成可用分组，可以换一个要求继续调整。')}`
  }
  return `${prefix}${translate('已生成 {count} 个分组，可在下方预览并继续调整。', {
    count: groupsCount,
  })}`
}

const formatSessionTime = (value: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const getLast = <T,>(items: T[]): T | undefined => items[items.length - 1]

const buildConversationPrompt = ({
  basePrompt,
  instruction,
  session,
  currentGroups,
}: {
  basePrompt: string
  instruction: string
  session?: AiOrganizeSession
  currentGroups: EditableGroup[]
}) => {
  const sections: string[] = []
  const normalizedBasePrompt = basePrompt.trim()
  if (normalizedBasePrompt) {
    sections.push(normalizedBasePrompt)
  }

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
    if (recentMessages) {
      sections.push(`最近对话：\n${recentMessages}`)
    }

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

const getAgentEventLabel = (event: AiAgentEvent): string => {
  switch (event.phase) {
    case 'started':
      return translate('AI Agent 正在准备图标清单')
    case 'context':
      return translate('已读取历史整理偏好')
    case 'model':
      return translate('正在请求模型生成草稿')
    case 'token':
      return translate('模型正在流式生成草稿')
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

const formatElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

function AssistantRunInline({
  status,
  title,
  detail,
  elapsedMs,
  events,
  streamChunks,
  isStreaming,
}: {
  status: RunStatus
  title: string
  detail?: string
  elapsedMs: number
  events: AiAgentEvent[]
  streamChunks: StreamChunk[]
  isStreaming: boolean
}) {
  const outputRef = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const latestUsage = [...events].reverse().find(event => event.usage)?.usage
  const visibleEvents = events.filter(event => event.phase !== 'token').slice(-4)
  const hasStreamOutput = streamChunks.length > 0

  useEffect(() => {
    const output = outputRef.current
    if (!output) return
    output.scrollTop = output.scrollHeight
  }, [streamChunks])

  return (
    <div
      aria-live="polite"
      className="mt-3 space-y-2 rounded-lg border border-border/70 bg-background/70 p-2.5 text-xs"
    >
      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        {status === 'failed' ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-300" />
        ) : status === 'success' ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600 dark:text-blue-300" />
        )}
        <span className="font-medium text-foreground">{title}</span>
        {elapsedMs > 0 ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
            {translate('耗时 {time}', { time: formatElapsed(elapsedMs) })}
          </span>
        ) : null}
        {latestUsage ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
            {translate('输入 {input} / 输出 {output}', {
              input: latestUsage.inputTokens,
              output: latestUsage.outputTokens,
            })}
          </span>
        ) : null}
      </div>
      {detail ? <p className="break-words leading-5 text-muted-foreground">{detail}</p> : null}
      {visibleEvents.length > 0 ? (
        <div className="space-y-1">
          {visibleEvents.map((event, index) => (
            <div
              key={`${event.runId}-${event.phase}-${event.at}-${index}`}
              className="min-w-0 rounded-md bg-muted/45 px-2 py-1"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500/70" />
                <span className="truncate text-foreground/90">{getAgentEventLabel(event)}</span>
                {event.toolName ? (
                  <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300">
                    {event.toolName}
                  </span>
                ) : null}
              </div>
              {event.detail ? (
                <div
                  className={`mt-0.5 line-clamp-2 break-words text-[11px] ${
                    event.phase === 'failed' || event.phase === 'error'
                      ? 'text-red-600 dark:text-red-300'
                      : 'text-muted-foreground'
                  }`}
                >
                  {event.detail}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="rounded-md border border-border/60 bg-background px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
          {translate('模型输出片段')}
          {isStreaming ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-normal text-blue-600 dark:text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 motion-safe:animate-pulse" />
              {translate('接收中')}
            </span>
          ) : null}
        </div>
        <div
          ref={outputRef}
          className="max-h-28 min-h-10 overflow-y-auto font-mono text-[11px] leading-relaxed text-foreground/85"
        >
          {hasStreamOutput ? (
            <pre className="whitespace-pre-wrap break-words">
              <AnimatePresence initial={false}>
                {streamChunks.map(chunk => (
                  <motion.span
                    key={chunk.id}
                    initial={prefersReducedMotion ? false : { opacity: 0.7, filter: 'blur(3px)' }}
                    animate={prefersReducedMotion ? undefined : { opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                    style={prefersReducedMotion ? undefined : { willChange: 'filter, opacity' }}
                  >
                    {chunk.text}
                  </motion.span>
                ))}
              </AnimatePresence>
              {isStreaming ? <span className="ml-0.5 text-blue-500">|</span> : null}
            </pre>
          ) : isStreaming ? (
            <div className="flex min-h-10 items-center gap-2 text-muted-foreground">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-8 rounded-full bg-blue-500/70 motion-safe:animate-[ai-stream-wait_1.1s_cubic-bezier(0.22,1,0.36,1)_infinite]" />
              </div>
              <span>{translate('正在等待首段模型输出...')}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{translate('等待模型输出...')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function AiOrganizePanel({
  open,
  visible = open,
  icons,
  customNames,
  applyRequestToken = 0,
  onRunStateChange,
  onCollapse,
  onClose,
  onApplied,
}: AiOrganizePanelProps) {
  const toast = useToast()
  const prefersReducedMotion = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [groups, setGroups] = useState<EditableGroup[]>([])
  const [agentEvents, setAgentEvents] = useState<AiAgentEvent[]>([])
  const [streamChunks, setStreamChunks] = useState<StreamChunk[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)
  const [runFinishedAt, setRunFinishedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [sessions, setSessions] = useState<AiOrganizeSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null)
  const [composerValue, setComposerValue] = useState('')
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const runSeqRef = useRef(0)
  const lastApplyRequestTokenRef = useRef(applyRequestToken)
  const streamChunkSeqRef = useRef(0)
  const streamBufferRef = useRef('')
  const streamFlushTimerRef = useRef<number | null>(null)
  const streamFirstBufferedAtRef = useRef<number | null>(null)
  const sessionsRef = useRef<AiOrganizeSession[]>([])
  const activeSessionIdRef = useRef<string | null>(null)
  const activeSnapshotIdRef = useRef<string | null>(null)
  const transcriptRef = useRef<HTMLDivElement | null>(null)

  const iconByKey = useMemo(() => {
    const map = new Map<string, DesktopIcon>()
    icons.forEach(icon => {
      map.set(`${icon.source}:${icon.id}`, icon)
    })
    return map
  }, [icons])

  const resolveIconName = useCallback(
    (key: string): string => {
      const icon = iconByKey.get(key)
      if (!icon) return key
      const custom = customNames[icon.path]
      return (custom && custom.trim()) || icon.name
    },
    [customNames, iconByKey]
  )

  const activeSession = useMemo(
    () => sessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  )

  const activeSnapshots = activeSession?.snapshots ?? []

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    activeSnapshotIdRef.current = activeSnapshotId
  }, [activeSnapshotId])

  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript) return
    transcript.scrollTop = transcript.scrollHeight
  }, [activeSession?.messages.length, phase, streamChunks.length, agentEvents.length])

  const commitSessions = useCallback(
    async (nextSessions: AiOrganizeSession[], nextActiveSessionId = activeSessionIdRef.current) => {
      sessionsRef.current = nextSessions
      setSessions(nextSessions)
      if (nextActiveSessionId) {
        activeSessionIdRef.current = nextActiveSessionId
        setActiveSessionId(nextActiveSessionId)
      }

      try {
        await saveAiOrganizeSessions(nextSessions)
        setSessionSaveError(null)
      } catch (e) {
        setSessionSaveError(String(e))
      }
    },
    []
  )

  const commitSession = useCallback(
    async (session: AiOrganizeSession) => {
      const nextSessions = upsertAiOrganizeSession(sessionsRef.current, session)
      await commitSessions(nextSessions, session.id)
    },
    [commitSessions]
  )

  const activateSnapshot = useCallback(
    (session: AiOrganizeSession, snapshot?: AiOrganizeSnapshot) => {
      activeSessionIdRef.current = session.id
      setActiveSessionId(session.id)
      if (!snapshot) {
        activeSnapshotIdRef.current = null
        setActiveSnapshotId(null)
        setGroups([])
        setPhase('idle')
        setRunId(null)
        setError(null)
        setNotConfigured(false)
        return
      }

      activeSnapshotIdRef.current = snapshot.id
      setActiveSnapshotId(snapshot.id)
      setGroups(toEditableGroups(snapshot.groups))
      setPhase('preview')
      setRunId(snapshot.runId ?? null)
      setError(null)
      setNotConfigured(false)
    },
    []
  )

  const handleSelectSession = useCallback(
    (session: AiOrganizeSession) => {
      const snapshot =
        session.snapshots.find(item => item.id === session.activeSnapshotId) ??
        getLast(session.snapshots)
      activateSnapshot(session, snapshot)
      setHistoryExpanded(false)
    },
    [activateSnapshot]
  )

  const handleSelectSnapshot = useCallback(
    (snapshot: AiOrganizeSnapshot) => {
      if (!activeSession) return
      const now = Date.now()
      const nextSession: AiOrganizeSession = {
        ...activeSession,
        updatedAt: now,
        activeSnapshotId: snapshot.id,
      }
      activateSnapshot(nextSession, snapshot)
      void commitSession(nextSession)
    },
    [activeSession, activateSnapshot, commitSession]
  )

  const persistCurrentPreview = useCallback(
    (nextGroups: EditableGroup[]) => {
      const currentSession = sessionsRef.current.find(
        session => session.id === activeSessionIdRef.current
      )
      const currentSnapshotId = activeSnapshotIdRef.current
      if (!currentSession || !currentSnapshotId) return

      const now = Date.now()
      const nextAiGroups = toAiGroups(nextGroups)
      const nextSession: AiOrganizeSession = {
        ...currentSession,
        updatedAt: now,
        snapshots: currentSession.snapshots.map(snapshot =>
          snapshot.id === currentSnapshotId
            ? {
                ...snapshot,
                groups: nextAiGroups,
                summary: summarizeGroups(nextAiGroups),
              }
            : snapshot
        ),
      }
      void commitSession(nextSession)
    },
    [commitSession]
  )

  const clearStreamFlushTimer = useCallback(() => {
    if (streamFlushTimerRef.current === null) return
    window.clearTimeout(streamFlushTimerRef.current)
    streamFlushTimerRef.current = null
  }, [])

  const flushStreamBuffer = useCallback(() => {
    const buffered = streamBufferRef.current
    if (!buffered) return
    streamBufferRef.current = ''
    streamFirstBufferedAtRef.current = null
    streamChunkSeqRef.current += 1
    const nextChunk: StreamChunk = {
      id: streamChunkSeqRef.current,
      text: buffered,
    }
    setStreamChunks(currentChunks => [...currentChunks, nextChunk].slice(-MAX_STREAM_CHUNKS))
  }, [])

  const flushPendingStream = useCallback(() => {
    clearStreamFlushTimer()
    flushStreamBuffer()
  }, [clearStreamFlushTimer, flushStreamBuffer])

  const resetStreamOutput = useCallback(() => {
    clearStreamFlushTimer()
    streamChunkSeqRef.current = 0
    streamBufferRef.current = ''
    streamFirstBufferedAtRef.current = null
    setStreamChunks([])
  }, [clearStreamFlushTimer])

  const appendStreamDelta = useCallback(
    (delta: string) => {
      streamBufferRef.current = `${streamBufferRef.current}${delta}`
      streamFirstBufferedAtRef.current ??= Date.now()
      const buffered = streamBufferRef.current
      const elapsedSinceFirstDelta = Date.now() - streamFirstBufferedAtRef.current
      const shouldCommitSoftChunk =
        buffered.length >= STREAM_FLUSH_SOFT_CHARS && /[\n,}\]]$/.test(buffered.trimEnd())

      if (
        buffered.length >= STREAM_FLUSH_CATCH_UP_CHARS ||
        buffered.length >= STREAM_FLUSH_MIN_CHARS ||
        shouldCommitSoftChunk ||
        elapsedSinceFirstDelta >= STREAM_FLUSH_MAX_HOLD_MS
      ) {
        flushPendingStream()
        return
      }

      if (streamFlushTimerRef.current !== null) return
      streamFlushTimerRef.current = window.setTimeout(() => {
        streamFlushTimerRef.current = null
        flushStreamBuffer()
      }, STREAM_FLUSH_INTERVAL_MS)
    },
    [flushPendingStream, flushStreamBuffer]
  )

  const handleNewSession = useCallback(() => {
    const session = createAiOrganizeSession(translate('新的整理对话'))
    const nextSessions = upsertAiOrganizeSession(sessionsRef.current, session)
    sessionsRef.current = nextSessions
    setSessions(nextSessions)
    activeSessionIdRef.current = session.id
    activeSnapshotIdRef.current = null
    setActiveSessionId(session.id)
    setActiveSnapshotId(null)
    setGroups([])
    setComposerValue('')
    setError(null)
    setNotConfigured(false)
    setPhase('idle')
    setAgentEvents([])
    resetStreamOutput()
    setRunId(null)
    setRunStartedAt(null)
    setRunFinishedAt(null)
    setElapsedMs(0)
    setHistoryExpanded(false)
  }, [resetStreamOutput])

  const runClassification = useCallback(
    async (instruction: string, promptLabel?: string) => {
      const normalizedInstruction = instruction.trim()
      if (!normalizedInstruction || phase === 'loading' || phase === 'applying') return

      const sequence = runSeqRef.current + 1
      runSeqRef.current = sequence
      const isCurrentRun = () => runSeqRef.current === sequence
      const now = Date.now()
      const existingSession =
        sessionsRef.current.find(session => session.id === activeSessionIdRef.current) ?? null
      const session =
        existingSession ??
        createAiOrganizeSession(createAiOrganizeSessionTitle(normalizedInstruction, now))
      const userMessage: AiOrganizeMessage = {
        id: createAiOrganizeId('ai-message'),
        role: 'user',
        content: normalizedInstruction,
        createdAt: now,
        status: 'success',
      }
      const runningMessage: AiOrganizeMessage = {
        id: createAiOrganizeId('ai-message'),
        role: 'assistant',
        content: translate('正在根据你的要求生成新的整理预览...'),
        createdAt: now + 1,
        status: 'running',
      }
      const runningSession: AiOrganizeSession = {
        ...session,
        title:
          session.messages.length === 0 && session.snapshots.length === 0
            ? createAiOrganizeSessionTitle(normalizedInstruction, now)
            : session.title,
        updatedAt: now,
        messages: [...session.messages, userMessage, runningMessage],
      }

      await commitSession(runningSession)
      setActiveSessionId(runningSession.id)
      setPhase('loading')
      setError(null)
      setNotConfigured(false)
      setAgentEvents([])
      resetStreamOutput()
      setRunId(null)
      setRunStartedAt(now)
      setRunFinishedAt(null)
      setElapsedMs(0)

      try {
        const config = await loadAiConfig()
        if (!isCurrentRun()) return

        if (!isAiConfigReady(config)) {
          const failedSession: AiOrganizeSession = {
            ...runningSession,
            updatedAt: Date.now(),
            messages: runningSession.messages.map(message =>
              message.id === runningMessage.id
                ? {
                    ...message,
                    content: translate('AI 配置不完整，请先到设置页填写接口地址、密钥和模型。'),
                    status: 'failed',
                    error: translate('AI 配置不完整'),
                  }
                : message
            ),
          }
          await commitSession(failedSession)
          setNotConfigured(true)
          setPhase('idle')
          setRunFinishedAt(Date.now())
          return
        }

        const inputs = buildAiIconInputs(icons, customNames)
        if (inputs.length === 0) {
          const snapshot: AiOrganizeSnapshot = {
            id: createAiOrganizeId('ai-snapshot'),
            createdAt: Date.now(),
            prompt: normalizedInstruction,
            groups: [],
            leftover: [],
            summary: translate('没有可整理的图标。'),
          }
          const emptySession: AiOrganizeSession = {
            ...runningSession,
            updatedAt: Date.now(),
            activeSnapshotId: snapshot.id,
            snapshots: [...runningSession.snapshots, snapshot],
            messages: runningSession.messages.map(message =>
              message.id === runningMessage.id
                ? {
                    ...message,
                    content: translate('当前没有可整理的图标。'),
                    status: 'success',
                    snapshotId: snapshot.id,
                  }
                : message
            ),
          }
          await commitSession(emptySession)
          activateSnapshot(emptySession, snapshot)
          setRunFinishedAt(Date.now())
          return
        }

        const prompt = buildConversationPrompt({
          basePrompt: config.customPrompt,
          instruction: normalizedInstruction,
          session: runningSession,
          currentGroups: groups,
        })
        const result = await invoke<AiAgentRunResult>('ai_organize_icons_agent', {
          config: buildAiConfigPayload(config, prompt),
          icons: inputs,
        })
        if (!isCurrentRun()) return

        const snapshot: AiOrganizeSnapshot = {
          id: createAiOrganizeId('ai-snapshot'),
          createdAt: Date.now(),
          prompt: normalizedInstruction,
          groups: result.groups,
          leftover: result.leftover,
          runId: result.run_id,
          summary: summarizeGroups(result.groups),
        }
        const successSession: AiOrganizeSession = {
          ...runningSession,
          updatedAt: Date.now(),
          activeSnapshotId: snapshot.id,
          snapshots: [...runningSession.snapshots, snapshot].slice(-12),
          messages: runningSession.messages.map(message =>
            message.id === runningMessage.id
              ? {
                  ...message,
                  content: createAssistantMessageContent(result.groups.length, promptLabel),
                  status: 'success',
                  runId: result.run_id,
                  snapshotId: snapshot.id,
                }
              : message
          ),
        }
        await commitSession(successSession)
        setRunId(result.run_id)
        activateSnapshot(successSession, snapshot)
        flushPendingStream()
        setRunFinishedAt(Date.now())
      } catch (e) {
        if (!isCurrentRun()) return
        flushPendingStream()
        const message = String(e)
        const failedSession: AiOrganizeSession = {
          ...runningSession,
          updatedAt: Date.now(),
          messages: runningSession.messages.map(currentMessage =>
            currentMessage.id === runningMessage.id
              ? {
                  ...currentMessage,
                  content: translate('这次请求失败了，可以调整要求后重试。'),
                  status: 'failed',
                  error: message,
                }
              : currentMessage
          ),
        }
        await commitSession(failedSession)
        setError(message)
        setPhase('idle')
        setRunFinishedAt(Date.now())
        setAgentEvents(current => {
          const alreadyFailed = current.some(event => event.phase === 'failed')
          if (alreadyFailed) return current
          const lastEvent = current[current.length - 1]
          return [
            ...current,
            {
              runId: lastEvent?.runId ?? `local-${Date.now()}`,
              phase: 'failed',
              message: 'AI Agent 请求失败。',
              detail: message,
              at: Math.floor(Date.now() / 1000),
            },
          ].slice(-MAX_AGENT_EVENTS)
        })
      }
    },
    [
      activateSnapshot,
      commitSession,
      customNames,
      flushPendingStream,
      groups,
      icons,
      phase,
      resetStreamOutput,
    ]
  )

  useEffect(() => {
    if (!open) return

    let active = true
    let unlisten: (() => void) | null = null

    setSessionsLoaded(false)
    void loadAiOrganizeSessions()
      .then(loadedSessions => {
        if (!active) return
        sessionsRef.current = loadedSessions
        setSessions(loadedSessions)
        const firstSession = loadedSessions[0]
        if (firstSession) {
          const snapshot =
            firstSession.snapshots.find(item => item.id === firstSession.activeSnapshotId) ??
            getLast(firstSession.snapshots)
          activateSnapshot(firstSession, snapshot)
        } else {
          const session = createAiOrganizeSession(translate('新的整理对话'))
          sessionsRef.current = [session]
          setSessions([session])
          activeSessionIdRef.current = session.id
          activeSnapshotIdRef.current = null
          setActiveSessionId(session.id)
          setActiveSnapshotId(null)
        }
      })
      .catch(e => {
        if (!active) return
        setSessionSaveError(String(e))
      })
      .finally(() => {
        if (!active) return
        setSessionsLoaded(true)
      })

    void getCurrentWindow()
      .listen<AiAgentEvent>(AI_ORGANIZE_AGENT_EVENT, event => {
        if (!active) return
        const payload = event.payload
        setRunId(current => current ?? payload.runId)
        if (payload.phase === 'token') {
          if (payload.token) {
            appendStreamDelta(payload.token)
          }
          return
        }
        setAgentEvents(current => {
          const nextEvent = payload
          return [...current, nextEvent].slice(-MAX_AGENT_EVENTS)
        })
      })
      .then(fn => {
        if (!active) {
          fn()
          return
        }

        unlisten = fn
      })
      .catch(e => {
        if (!active) return
        setError(String(e))
        setPhase('idle')
        setRunFinishedAt(Date.now())
      })

    // 关闭或卸载时重置面板状态；cleanup 里的 setState 不会触发级联渲染。
    return () => {
      active = false
      runSeqRef.current += 1
      if (unlisten) {
        unlisten()
      }
      setPhase('idle')
      setError(null)
      setNotConfigured(false)
      setGroups([])
      setAgentEvents([])
      resetStreamOutput()
      sessionsRef.current = []
      activeSessionIdRef.current = null
      activeSnapshotIdRef.current = null
      setSessions([])
      setActiveSessionId(null)
      setActiveSnapshotId(null)
      setSessionsLoaded(false)
      setSessionSaveError(null)
      setComposerValue('')
      setRunId(null)
      setRunStartedAt(null)
      setRunFinishedAt(null)
      setElapsedMs(0)
    }
  }, [activateSnapshot, appendStreamDelta, open, resetStreamOutput])

  useEffect(() => {
    if (!runStartedAt) {
      return
    }

    const syncElapsed = () => {
      setElapsedMs((runFinishedAt ?? Date.now()) - runStartedAt)
    }

    syncElapsed()
    if (runFinishedAt) return

    const intervalId = window.setInterval(syncElapsed, 500)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [runFinishedAt, runStartedAt])

  const handleRenameGroup = (id: string, name: string) => {
    const nextGroups = groups.map(group =>
      group.id === id ? { ...group, folderName: name } : group
    )
    setGroups(nextGroups)
    persistCurrentPreview(nextGroups)
  }

  const handleRemoveIcon = (groupId: string, key: string) => {
    const nextGroups = groups.map(group =>
      group.id === groupId ? { ...group, iconKeys: group.iconKeys.filter(k => k !== key) } : group
    )
    setGroups(nextGroups)
    persistCurrentPreview(nextGroups)
  }

  const handleDropGroup = (groupId: string) => {
    const nextGroups = groups.filter(group => group.id !== groupId)
    setGroups(nextGroups)
    persistCurrentPreview(nextGroups)
  }

  // 只有至少包含 2 个图标的分组才有意义。
  const applicableGroups = useMemo(
    () => groups.filter(group => group.iconKeys.length >= 2),
    [groups]
  )

  const latestEvent = useMemo(() => {
    for (let index = agentEvents.length - 1; index >= 0; index -= 1) {
      const event = agentEvents[index]
      if (event.phase !== 'token') return event
    }
    return null
  }, [agentEvents])
  const isStreaming = phase === 'loading'

  const runStatus = useMemo<RunStatus>(() => {
    if (phase === 'applying') return 'applying'
    if (error) return 'failed'
    if (notConfigured) return 'notConfigured'
    if (phase === 'loading') return 'running'
    if (phase === 'preview' && groups.length > 0) return 'success'
    if (phase === 'preview') return 'empty'
    return 'idle'
  }, [error, groups.length, notConfigured, phase])

  const statusTitle = useMemo(() => {
    switch (runStatus) {
      case 'running':
        if (isStreaming) return translate('模型正在流式生成草稿')
        return latestEvent ? getAgentEventLabel(latestEvent) : translate('正在准备 AI 请求')
      case 'success':
        return translate('请求成功')
      case 'failed':
        return translate('请求失败')
      case 'notConfigured':
        return translate('AI 配置不完整')
      case 'empty':
        return translate('没有可用分组')
      case 'applying':
        return translate('正在应用整理结果')
      default:
        return translate('等待开始')
    }
  }, [isStreaming, latestEvent, runStatus])

  const statusDetail = useMemo(() => {
    switch (runStatus) {
      case 'running':
        if (isStreaming) {
          return translate('正在接收模型的原始 JSON 流，分组预览会在解析成功后出现。')
        }
        return latestEvent?.detail ?? translate('请求正在进行，窗口保持打开即可继续接收状态。')
      case 'success':
        return translate('请求成功，已生成 {count} 个可预览分组。', { count: groups.length })
      case 'failed':
        return error ?? latestEvent?.detail ?? translate('请求没有完成，请检查模型配置或网关日志。')
      case 'notConfigured':
        return translate('请先到「设置 → AI 助手」填写接口地址、密钥和模型。')
      case 'empty':
        return translate('请求完成，但没有生成可用分组。')
      case 'applying':
        return translate('正在写入桌面布局并刷新启动台。')
      default:
        return translate('等待 AI Agent 开始处理。')
    }
  }, [error, groups.length, isStreaming, latestEvent, runStatus])

  useEffect(() => {
    onRunStateChange?.({
      canApply: phase === 'preview' && applicableGroups.length > 0,
      applying: phase === 'applying',
      hasPreview: phase === 'preview' && groups.length > 0,
    })
  }, [applicableGroups.length, groups.length, onRunStateChange, phase])

  const sendPrompt = useCallback(
    (prompt: string, label?: string) => {
      const normalizedPrompt = prompt.trim()
      if (!normalizedPrompt) return
      setComposerValue('')
      void runClassification(normalizedPrompt, label)
    },
    [runClassification]
  )

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || !event.ctrlKey) return
      event.preventDefault()
      sendPrompt(composerValue)
    },
    [composerValue, sendPrompt]
  )

  const handleApply = useCallback(async () => {
    if (applicableGroups.length === 0) {
      toast.info(translate('没有可应用的分组。'), {
        key: 'ai-organize',
        title: translate('AI 智能整理'),
      })
      return
    }

    setPhase('applying')
    try {
      const persisted = await readLayout()
      const currentItems = hydrateItems(icons, persisted?.items ?? null)
      const aiGroups: AiGroup[] = applicableGroups.map(group => ({
        folder_name: group.folderName,
        icon_keys: group.iconKeys,
      }))
      const nextItems = applyAiGroupsToLayout(currentItems, aiGroups)
      // 与「重置布局」一致：清空 slots/dock，交给 IconGrid 重新 hydrate。
      await writeLayout(nextItems, [], [])
      if (runId) {
        await invoke('ai_organize_record_apply', { runId, groups: aiGroups }).catch(e => {
          console.warn('Failed to record AI organize apply:', e)
        })
      }
      await onApplied()
      toast.success(
        translate('已应用 AI 整理：新建 {count} 个分组文件夹。', {
          count: applicableGroups.length,
        }),
        {
          key: 'ai-organize',
          title: translate('AI 智能整理'),
        }
      )
      onClose()
    } catch (e) {
      setError(String(e))
      setPhase('preview')
    }
  }, [applicableGroups, icons, onApplied, onClose, runId, toast])

  useEffect(() => {
    if (!open) {
      lastApplyRequestTokenRef.current = applyRequestToken
      return
    }
    if (applyRequestToken === lastApplyRequestTokenRef.current) return
    lastApplyRequestTokenRef.current = applyRequestToken
    if (applyRequestToken <= 0) return
    void handleApply()
  }, [applyRequestToken, handleApply, open])

  if (!open) return null
  if (!visible) return null

  const collapseOrClose = onCollapse ?? onClose
  const isBusy = phase === 'loading' || phase === 'applying'
  const canSend = composerValue.trim().length > 0 && sessionsLoaded && !isBusy
  const currentSnapshot = activeSnapshots.find(snapshot => snapshot.id === activeSnapshotId) ?? null

  return (
    <div
      data-ai-organize-sidebar="true"
      data-no-window-drag="true"
      className="fixed inset-0 z-[60] flex justify-end bg-black/[0.08] backdrop-blur-[1px] dark:bg-black/20"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation()
        if (event.target !== event.currentTarget || phase === 'applying') return
        collapseOrClose()
      }}
    >
      <motion.aside
        role="complementary"
        aria-label={translate('AI 智能整理')}
        initial={prefersReducedMotion ? false : { x: 28, opacity: 0 }}
        animate={prefersReducedMotion ? undefined : { x: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full w-[min(460px,100vw)] flex-col overflow-hidden border-l border-border/85 bg-background/95 shadow-2xl backdrop-blur-xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="relative flex items-center justify-between border-b border-border/80 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{translate('AI 智能整理')}</h3>
              <p className="truncate text-xs text-muted-foreground">{statusTitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={translate('会话历史')}
              title={translate('会话历史')}
              onClick={() => setHistoryExpanded(expanded => !expanded)}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                historyExpanded
                  ? 'bg-blue-500/10 text-blue-700 dark:text-blue-200'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <History className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={translate('新对话')}
              title={translate('新对话')}
              onClick={handleNewSession}
              disabled={isBusy}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={translate(onCollapse ? '收起侧栏' : '关闭')}
              onClick={collapseOrClose}
              disabled={phase === 'applying'}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <AnimatePresence initial={false}>
            {historyExpanded ? (
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
                animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-3 top-[calc(100%-0.25rem)] z-20 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border/85 bg-background shadow-xl"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
                  <span className="text-xs font-medium text-foreground">
                    {translate('会话历史')}
                  </span>
                  <button
                    type="button"
                    onClick={handleNewSession}
                    disabled={isBusy}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border/80 px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {translate('新对话')}
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto p-2">
                  {!sessionsLoaded ? (
                    <div className="flex h-12 items-center gap-2 px-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {translate('正在加载会话...')}
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      {translate('还没有保存的整理对话。')}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {sessions.map(session => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => handleSelectSession(session)}
                          disabled={isBusy}
                          className={`w-full rounded-md px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            session.id === activeSessionId
                              ? 'bg-blue-500/10 text-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          }`}
                        >
                          <div className="truncate text-xs font-medium">{session.title}</div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                            <span>{formatSessionTime(session.updatedAt)}</span>
                            <span>
                              {translate('{count} 版', { count: session.snapshots.length })}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col">
            {sessionSaveError ? (
              <div className="shrink-0 border-b border-border/70 px-4 py-2">
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                  {translate('会话保存失败：{error}', { error: sessionSaveError })}
                </div>
              </div>
            ) : null}

            <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-3">
                {activeSession?.messages.length ? (
                  activeSession.messages.map(message => {
                    const isUser = message.role === 'user'
                    const failed = message.status === 'failed'
                    const running = message.status === 'running'
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[88%] rounded-lg border px-3 py-2 text-sm leading-5 ${
                            isUser
                              ? 'border-blue-500/25 bg-blue-500/12 text-foreground'
                              : failed
                                ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-200'
                                : 'border-border/80 bg-muted/35 text-foreground'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {!isUser ? (
                              running ? (
                                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-blue-600 dark:text-blue-300" />
                              ) : (
                                <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-300" />
                              )
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <p className="whitespace-pre-wrap break-words">{message.content}</p>
                              {message.error ? (
                                <p className="mt-1 break-words text-xs opacity-80">
                                  {message.error}
                                </p>
                              ) : null}
                              {running || (failed && message.error) ? (
                                <AssistantRunInline
                                  status={runStatus}
                                  title={statusTitle}
                                  detail={statusDetail}
                                  elapsedMs={elapsedMs}
                                  events={agentEvents}
                                  streamChunks={streamChunks}
                                  isStreaming={isStreaming}
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                    <div className="mb-2 flex items-center gap-2 text-foreground">
                      <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                      {translate('选择预设或输入要求开始整理')}
                    </div>
                    <p className="text-xs leading-5">
                      {translate('你可以先生成一版布局，再继续对话要求 AI 调整。')}
                    </p>
                  </div>
                )}
              </div>

              {activeSnapshots.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {activeSnapshots.map((snapshot, index) => (
                    <button
                      key={snapshot.id}
                      type="button"
                      onClick={() => handleSelectSnapshot(snapshot)}
                      disabled={isBusy}
                      className={`rounded-md border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        snapshot.id === activeSnapshotId
                          ? 'border-blue-500/35 bg-blue-500/12 text-blue-700 dark:text-blue-200'
                          : 'border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {translate('第 {index} 版', { index: index + 1 })}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                    <FolderClosed className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                    <span className="truncate">{translate('布局预览')}</span>
                  </div>
                  {currentSnapshot ? (
                    <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      {formatSessionTime(currentSnapshot.createdAt)}
                    </span>
                  ) : null}
                </div>

                {groups.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-5 text-center text-sm text-muted-foreground">
                    {phase === 'loading'
                      ? translate('正在等待新的布局预览...')
                      : translate('发送一个要求，AI 会生成可保存的布局预览。')}
                  </div>
                ) : (
                  groups.map(group => (
                    <div key={group.id} className="rounded-lg border border-border/85 bg-card p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <FolderClosed className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                        <Input
                          value={group.folderName}
                          onChange={e => handleRenameGroup(group.id, e.target.value)}
                          className="h-8 flex-1"
                          aria-label={translate('分组名称')}
                          disabled={isBusy}
                        />
                        <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          {group.iconKeys.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDropGroup(group.id)}
                          disabled={isBusy}
                          className="shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-red-300"
                        >
                          {translate('解散')}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.iconKeys.map(key => {
                          const icon = iconByKey.get(key)
                          return (
                            <span
                              key={key}
                              className="group inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/70 bg-background py-1 pl-1.5 pr-1 text-xs"
                            >
                              {icon?.icon_base64 ? (
                                <img
                                  src={icon.icon_base64}
                                  alt=""
                                  className="h-4 w-4 shrink-0 object-contain"
                                />
                              ) : null}
                              <span className="max-w-[138px] truncate">{resolveIconName(key)}</span>
                              <button
                                type="button"
                                aria-label={translate('移出分组')}
                                onClick={() => handleRemoveIcon(group.id, key)}
                                disabled={isBusy}
                                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-red-300"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          )
                        })}
                      </div>
                      {group.iconKeys.length < 2 ? (
                        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">
                          {translate('不足 2 个图标，应用时会被忽略。')}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-border/80 px-4 py-3">
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                {PROMPT_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => sendPrompt(preset.prompt, translate(preset.label))}
                    disabled={isBusy || !sessionsLoaded}
                    title={translate(preset.description)}
                    className="rounded-lg border border-border/75 bg-muted/25 px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="text-xs font-medium text-foreground">
                      {translate(preset.label)}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {translate(preset.description)}
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <textarea
                  value={composerValue}
                  onChange={event => setComposerValue(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={translate('输入整理要求，Ctrl+Enter 发送')}
                  aria-label={translate('输入整理要求')}
                  rows={3}
                  disabled={isBusy}
                  className="max-h-28 min-h-20 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => sendPrompt(composerValue)}
                  disabled={!canSend}
                  aria-label={translate('发送')}
                  className="flex h-20 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                >
                  {phase === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SendHorizontal className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.aside>
    </div>
  )
}
