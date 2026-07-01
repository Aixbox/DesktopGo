import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  Bot,
  Brain,
  CheckCircle2,
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

const AI_ORGANIZE_AGENT_EVENT = 'ai-organize:agent-event'
const MAX_AGENT_EVENTS = 80

interface EditableGroup {
  id: string
  folderName: string
  iconKeys: string[]
}

interface AiAgentRunResult extends AiClassifyResult {
  run_id: string
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
      return translate('流式请求已降级重试')
    case 'error':
      return translate('上下文记录遇到问题')
    case 'done':
      return translate('AI Agent 已完成分析')
    default:
      return event.message
  }
}

const getAgentEventIcon = (event: AiAgentEvent) => {
  const className = 'h-3.5 w-3.5'
  switch (event.phase) {
    case 'reasoning':
    case 'model':
    case 'token':
      return <Brain className={className} />
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

function AgentTracePanel({ events }: { events: AiAgentEvent[] }) {
  const latestUsage = [...events].reverse().find(event => event.usage)?.usage
  const visibleEvents = events.filter(event => event.phase !== 'token')
  const streamedText = events
    .filter(event => event.phase === 'token' && event.token)
    .map(event => event.token)
    .join('')
    .slice(-1800)

  return (
    <div className="border-t border-border/70 bg-muted/20 px-5 py-3">
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
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
        <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
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
                <div className="mt-0.5 text-muted-foreground">{getAgentEventIcon(event)}</div>
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
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {event.detail}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="min-h-24 rounded-md border border-border/70 bg-background px-3 py-2">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">
            {translate('模型输出')}
          </div>
          <pre className="max-h-28 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/85">
            {streamedText || translate('等待模型输出...')}
            {streamedText ? <span className="ml-0.5 animate-pulse text-blue-500">|</span> : null}
          </pre>
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
  const [runId, setRunId] = useState<string | null>(null)

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

  const runClassification = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setNotConfigured(false)
    setAgentEvents([])
    setRunId(null)

    try {
      const config = await loadAiConfig()
      if (!isAiConfigReady(config)) {
        setNotConfigured(true)
        setPhase('idle')
        return
      }

      const inputs = buildAiIconInputs(icons, customNames)
      if (inputs.length === 0) {
        setGroups([])
        setPhase('preview')
        return
      }

      const result = await invoke<AiAgentRunResult>('ai_organize_icons_agent', {
        config: buildAiConfigPayload(config),
        icons: inputs,
      })

      setRunId(result.run_id)
      const editable: EditableGroup[] = result.groups.map((group, index) => ({
        id: `ai-group-${index}`,
        folderName: group.folder_name,
        iconKeys: group.icon_keys,
      }))
      setGroups(editable)
      setPhase('preview')
    } catch (e) {
      setError(String(e))
      setPhase('idle')
    }
  }, [customNames, icons])

  useEffect(() => {
    if (!open) return

    let active = true
    let unlisten: (() => void) | null = null

    void getCurrentWindow()
      .listen<AiAgentEvent>(AI_ORGANIZE_AGENT_EVENT, event => {
        if (!active) return
        const payload = event.payload
        setAgentEvents(current => {
          const nextEvent =
            payload.phase === 'token'
              ? { ...payload, message: translate('模型正在流式生成草稿') }
              : payload
          return [...current, nextEvent].slice(-MAX_AGENT_EVENTS)
        })
      })
      .then(fn => {
        if (active) {
          unlisten = fn
        } else {
          fn()
        }
      })

    return () => {
      active = false
      if (unlisten) {
        unlisten()
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    // 用微任务异步发起分类，避免在 effect 同步阶段触发 setState 引起的级联渲染。
    let active = true
    queueMicrotask(() => {
      if (active) void runClassification()
    })
    // 关闭或卸载时重置面板状态；cleanup 里的 setState 不会触发级联渲染。
    return () => {
      active = false
      setPhase('idle')
      setError(null)
      setNotConfigured(false)
      setGroups([])
      setAgentEvents([])
      setRunId(null)
    }
  }, [open, runClassification])

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

        <AgentTracePanel events={agentEvents} />

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
