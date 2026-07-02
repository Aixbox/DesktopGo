import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle,
  Bot,
  Brain,
  CheckCircle2,
  CircleDashed,
  FolderClosed,
  Loader2,
  TerminalSquare,
  Wrench,
  X,
} from 'lucide-react'
import { translate } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { loadAiConfig, isAiConfigReady, type AiConfig } from '@/lib/aiConfigStore'
import {
  applyAiGroupsToLayout,
  buildAiIconInputs,
  type AiClassifyResult,
  type AiGroup,
} from '@/lib/aiOrganize'
import { hydrateItems, readLayout, writeLayout } from '@/components/icon-grid/services/layoutStore'
import type { DesktopIcon } from '@/types'

interface AiOrganizePanelProps {
  open: boolean
  icons: DesktopIcon[]
  customNames: Record<string, string>
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

interface EditableGroup {
  id: string
  folderName: string
  iconKeys: string[]
}

interface AiAgentRunResult extends AiClassifyResult {
  run_id: string
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

const buildAiConfigPayload = (config: AiConfig) => ({
  base_url: config.baseUrl,
  api_key: config.apiKey,
  model: config.model,
  custom_prompt: config.customPrompt,
})

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

const getAgentEventIcon = (event: AiAgentEvent) => {
  const className = 'h-3.5 w-3.5'
  switch (event.phase) {
    case 'failed':
    case 'error':
      return <AlertCircle className={className} />
    case 'reasoning':
    case 'model':
    case 'token':
      return <Brain className={className} />
    case 'request':
      return <TerminalSquare className={className} />
    case 'toolCall':
      return <Wrench className={className} />
    case 'toolResult':
    case 'draft':
    case 'done':
      return <CheckCircle2 className={className} />
    default:
      return <TerminalSquare className={className} />
  }
}

const getAgentEventToneClass = (event: AiAgentEvent): string => {
  switch (event.phase) {
    case 'failed':
    case 'error':
      return 'text-red-600 dark:text-red-300'
    case 'fallback':
      return 'text-amber-600 dark:text-amber-300'
    case 'done':
    case 'draft':
    case 'saved':
    case 'toolResult':
      return 'text-emerald-600 dark:text-emerald-300'
    case 'request':
    case 'model':
    case 'reasoning':
    case 'token':
      return 'text-blue-600 dark:text-blue-300'
    default:
      return 'text-muted-foreground'
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

function AiRunStatusBar({
  status,
  title,
  detail,
  elapsedMs,
}: {
  status: RunStatus
  title: string
  detail?: string
  elapsedMs: number
}) {
  const tone =
    status === 'failed'
      ? {
          wrapper: 'border-red-500/25 bg-red-500/10 text-red-950 dark:text-red-100',
          icon: 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-300',
          marker: translate('失败'),
        }
      : status === 'success'
        ? {
            wrapper:
              'border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100',
            icon: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
            marker: translate('成功'),
          }
        : status === 'notConfigured' || status === 'empty'
          ? {
              wrapper: 'border-amber-500/25 bg-amber-500/10 text-amber-950 dark:text-amber-100',
              icon: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300',
              marker: status === 'notConfigured' ? translate('待配置') : translate('无可用分组'),
            }
          : {
              wrapper: 'border-blue-500/20 bg-blue-500/10 text-blue-950 dark:text-blue-100',
              icon: 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300',
              marker: status === 'applying' ? translate('应用中') : translate('进行中'),
            }

  const icon =
    status === 'running' || status === 'applying' ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : status === 'success' ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : status === 'failed' ? (
      <AlertCircle className="h-4 w-4" />
    ) : (
      <CircleDashed className="h-4 w-4" />
    )

  return (
    <div aria-live="polite" className={`mb-4 rounded-xl border px-3.5 py-3 ${tone.wrapper}`}>
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <span className="rounded-md border border-current/15 bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {tone.marker}
            </span>
            {elapsedMs > 0 ? (
              <span className="rounded-md border border-current/15 bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {translate('耗时 {time}', { time: formatElapsed(elapsedMs) })}
              </span>
            ) : null}
          </div>
          {detail ? (
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{detail}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function AgentTracePanel({
  events,
  streamChunks,
  isStreaming,
}: {
  events: AiAgentEvent[]
  streamChunks: StreamChunk[]
  isStreaming: boolean
}) {
  const outputRef = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const latestUsage = [...events].reverse().find(event => event.usage)?.usage
  const visibleEvents = events.filter(event => event.phase !== 'token')
  const hasStreamOutput = streamChunks.length > 0

  useEffect(() => {
    const output = outputRef.current
    if (!output) return
    output.scrollTop = output.scrollHeight
  }, [streamChunks])

  return (
    <div className="shrink-0 border-t border-border/70 bg-muted/20 px-5 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <TerminalSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />
          {translate('Agent 处理过程')}
        </div>
        {latestUsage ? (
          <div className="flex flex-wrap justify-end gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-background px-1.5 py-0.5">
              {translate('输入 {count}', { count: latestUsage.inputTokens })}
            </span>
            <span className="rounded-md bg-background px-1.5 py-0.5">
              {translate('输出 {count}', { count: latestUsage.outputTokens })}
            </span>
            <span className="rounded-md bg-background px-1.5 py-0.5">
              {translate('缓存 {count}', { count: latestUsage.cachedTokens })}
            </span>
          </div>
        ) : null}
      </div>
      <div className="grid h-40 min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
        <div className="min-h-0 space-y-1.5 overflow-y-auto pr-1">
          {visibleEvents.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              {translate('等待 Agent 开始处理...')}
            </div>
          ) : (
            visibleEvents.map((event, index) => (
              <div
                key={`${event.runId}-${event.phase}-${event.at}-${index}`}
                className="grid grid-cols-[18px_1fr] gap-2 text-xs"
              >
                <div className={`mt-0.5 ${getAgentEventToneClass(event)}`}>
                  {getAgentEventIcon(event)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-foreground/90">{getAgentEventLabel(event)}</span>
                    {event.toolName ? (
                      <span className="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300">
                        {event.toolName}
                      </span>
                    ) : null}
                  </div>
                  {event.detail ? (
                    <div
                      className={`mt-0.5 text-[11px] ${
                        event.phase === 'failed' || event.phase === 'error'
                          ? 'break-words text-red-600 dark:text-red-300'
                          : 'truncate text-muted-foreground'
                      }`}
                    >
                      {event.detail}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex min-h-0 flex-col rounded-md border border-border/70 bg-background px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
            {translate('原始模型输出')}
            {isStreaming ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-normal text-blue-600 dark:text-blue-300">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 motion-safe:animate-pulse" />
                {translate('接收中')}
              </span>
            ) : null}
          </div>
          <div
            ref={outputRef}
            className="min-h-0 flex-1 overflow-y-auto rounded-sm bg-muted/20 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground/85"
          >
            {hasStreamOutput ? (
              <pre className="whitespace-pre-wrap break-words">
                <AnimatePresence initial={false}>
                  {streamChunks.map(chunk => (
                    <motion.span
                      key={chunk.id}
                      initial={prefersReducedMotion ? false : { opacity: 0 }}
                      animate={prefersReducedMotion ? undefined : { opacity: 1 }}
                      transition={{ duration: 0.1, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {chunk.text}
                    </motion.span>
                  ))}
                </AnimatePresence>
                {isStreaming ? <span className="ml-0.5 text-blue-500">|</span> : null}
              </pre>
            ) : isStreaming ? (
              <div className="flex h-full min-h-20 flex-col justify-center gap-2 text-muted-foreground">
                <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-10 rounded-full bg-blue-500/70 motion-safe:animate-[ai-stream-wait_1.1s_cubic-bezier(0.22,1,0.36,1)_infinite]" />
                </div>
                <span>{translate('正在等待首段模型输出...')}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">{translate('等待原始模型输出...')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AiOrganizePanel({
  open,
  icons,
  customNames,
  onClose,
  onApplied,
}: AiOrganizePanelProps) {
  const toast = useToast()
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
  const runSeqRef = useRef(0)
  const streamChunkSeqRef = useRef(0)
  const streamBufferRef = useRef('')
  const streamFlushTimerRef = useRef<number | null>(null)
  const streamFirstBufferedAtRef = useRef<number | null>(null)

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

  const runClassification = useCallback(async () => {
    const sequence = runSeqRef.current + 1
    runSeqRef.current = sequence
    const isCurrentRun = () => runSeqRef.current === sequence

    setPhase('loading')
    setError(null)
    setNotConfigured(false)
    setGroups([])
    setAgentEvents([])
    resetStreamOutput()
    setRunId(null)
    setRunStartedAt(Date.now())
    setRunFinishedAt(null)
    setElapsedMs(0)

    try {
      const config = await loadAiConfig()
      if (!isCurrentRun()) return

      if (!isAiConfigReady(config)) {
        setNotConfigured(true)
        setPhase('idle')
        setRunFinishedAt(Date.now())
        return
      }

      const inputs = buildAiIconInputs(icons, customNames)
      if (inputs.length === 0) {
        setGroups([])
        setPhase('preview')
        setRunFinishedAt(Date.now())
        return
      }

      const result = await invoke<AiAgentRunResult>('ai_organize_icons_agent', {
        config: buildAiConfigPayload(config),
        icons: inputs,
      })
      if (!isCurrentRun()) return

      setRunId(result.run_id)
      const editable: EditableGroup[] = result.groups.map((group, index) => ({
        id: `ai-group-${index}`,
        folderName: group.folder_name,
        iconKeys: group.icon_keys,
      }))
      setGroups(editable)
      setPhase('preview')
      flushPendingStream()
      setRunFinishedAt(Date.now())
    } catch (e) {
      if (!isCurrentRun()) return
      flushPendingStream()
      const message = String(e)
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
  }, [customNames, flushPendingStream, icons, resetStreamOutput])

  useEffect(() => {
    if (!open) return

    let active = true
    let unlisten: (() => void) | null = null

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
        void runClassification()
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
      setRunId(null)
      setRunStartedAt(null)
      setRunFinishedAt(null)
      setElapsedMs(0)
    }
  }, [appendStreamDelta, open, resetStreamOutput, runClassification])

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
    setGroups(current =>
      current.map(group => (group.id === id ? { ...group, folderName: name } : group))
    )
  }

  const handleRemoveIcon = (groupId: string, key: string) => {
    setGroups(current =>
      current.map(group =>
        group.id === groupId ? { ...group, iconKeys: group.iconKeys.filter(k => k !== key) } : group
      )
    )
  }

  const handleDropGroup = (groupId: string) => {
    setGroups(current => current.filter(group => group.id !== groupId))
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

  const handleApply = async () => {
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
  }

  if (!open) return null

  return (
    <div
      data-ai-organize-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px] dark:bg-black/55"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation()
        if (event.target === event.currentTarget && phase !== 'applying') {
          onClose()
        }
      }}
    >
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/80 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{translate('AI 智能整理')}</h3>
              <p className="text-xs text-muted-foreground">
                {translate('由 AI 按用途分组，预览确认后再应用。')}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={translate('关闭')}
            onClick={onClose}
            disabled={phase === 'applying'}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <AiRunStatusBar
            status={runStatus}
            title={statusTitle}
            detail={statusDetail}
            elapsedMs={elapsedMs}
          />

          {phase === 'loading' ? (
            <div className="space-y-4 py-10">
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                {translate('AI 正在分析图标...')}
              </div>
            </div>
          ) : notConfigured ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-foreground">{translate('尚未配置 AI 模型。')}</p>
              <p className="text-xs text-muted-foreground">
                {translate('请先到「设置 → AI 助手」填写接口地址、密钥和模型。')}
              </p>
            </div>
          ) : error ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void runClassification()}>
                {translate('重试')}
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {translate('AI 没有给出可用的分组建议。')}
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(group => (
                <div
                  key={group.id}
                  className="rounded-xl border border-border/85 bg-card p-3 shadow-sm"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <FolderClosed className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                    <Input
                      value={group.folderName}
                      onChange={e => handleRenameGroup(group.id, e.target.value)}
                      className="h-8 flex-1"
                      aria-label={translate('分组名称')}
                    />
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {group.iconKeys.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDropGroup(group.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
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
                          className="group inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background py-1 pl-1.5 pr-1 text-xs"
                        >
                          {icon?.icon_base64 ? (
                            <img src={icon.icon_base64} alt="" className="h-4 w-4 object-contain" />
                          ) : null}
                          <span className="max-w-[140px] truncate">{resolveIconName(key)}</span>
                          <button
                            type="button"
                            aria-label={translate('移出分组')}
                            onClick={() => handleRemoveIcon(group.id, key)}
                            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-300"
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
              ))}
            </div>
          )}
        </div>

        <AgentTracePanel
          events={agentEvents}
          streamChunks={streamChunks}
          isStreaming={isStreaming}
        />

        <div className="flex items-center justify-between gap-3 border-t border-border/80 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {phase === 'preview' && groups.length > 0
              ? translate('将新建 {count} 个分组文件夹。', { count: applicableGroups.length })
              : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={phase === 'applying'}>
              {translate('取消')}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleApply()}
              disabled={phase !== 'preview' || applicableGroups.length === 0}
            >
              {phase === 'applying' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {translate('应用中...')}
                </>
              ) : (
                translate('应用整理')
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
