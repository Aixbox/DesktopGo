import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Gauge, SendHorizontal, Sparkles, Square, X } from 'lucide-react'
import { translate } from '@/lib/i18n'
import {
  AI_REASONING_EFFORTS,
  getAiModelOptions,
  type AiConfig,
  type AiReasoningEffort,
} from '@/lib/aiConfigStore'
import {
  PROMPT_PRESETS,
  getComposerCommandLabel,
  type AiComposerCommand,
  type AiOrganizePhase,
  type QueuedAiPrompt,
} from './aiOrganizePanelModel'

interface AiOrganizeComposerProps {
  phase: AiOrganizePhase
  sessionsLoaded: boolean
  composerRef: MutableRefObject<HTMLTextAreaElement | null>
  composerValue: string
  setComposerValue: Dispatch<SetStateAction<string>>
  composerCommand: AiComposerCommand | null
  setComposerCommand: Dispatch<SetStateAction<AiComposerCommand | null>>
  presetsExpanded: boolean
  setPresetsExpanded: Dispatch<SetStateAction<boolean>>
  presetsButtonRef: MutableRefObject<HTMLButtonElement | null>
  presetsMenuRef: MutableRefObject<HTMLDivElement | null>
  queuedPrompts: QueuedAiPrompt[]
  clearQueuedPrompts: () => void
  aiConfig: AiConfig | null
  onUpdateAiConfig: (patch: Partial<AiConfig>) => void
  onComposerKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onSelectPreset: (prompt: string) => void
  onSendPrompt: (prompt: string) => void
  onStopRun: () => void
}

const effortLabel = (effort: AiReasoningEffort) =>
  translate(
    effort === 'none' ? '不启用' : effort === 'low' ? '低' : effort === 'medium' ? '中' : '高'
  )

export function AiOrganizeComposer({
  phase,
  sessionsLoaded,
  composerRef,
  composerValue,
  setComposerValue,
  composerCommand,
  setComposerCommand,
  presetsExpanded,
  setPresetsExpanded,
  presetsButtonRef,
  presetsMenuRef,
  queuedPrompts,
  clearQueuedPrompts,
  aiConfig,
  onUpdateAiConfig,
  onComposerKeyDown,
  onSelectPreset,
  onSendPrompt,
  onStopRun,
}: AiOrganizeComposerProps) {
  const prefersReducedMotion = useReducedMotion()
  const hasComposerText = composerValue.trim().length > 0
  const canSend =
    (hasComposerText || Boolean(composerCommand)) && sessionsLoaded && phase !== 'applying'
  const canUseControls = sessionsLoaded && phase !== 'applying'
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [effortMenuOpen, setEffortMenuOpen] = useState(false)
  const modelButtonRef = useRef<HTMLButtonElement | null>(null)
  const modelMenuRef = useRef<HTMLDivElement | null>(null)
  const effortButtonRef = useRef<HTMLButtonElement | null>(null)
  const effortMenuRef = useRef<HTMLDivElement | null>(null)
  const modelOptions = aiConfig ? getAiModelOptions(aiConfig) : []

  // 点击弹层外部或按下 Esc 时收起模型/思考等级弹层，且同一时间只保留一个。
  useEffect(() => {
    if (!modelMenuOpen && !effortMenuOpen) return

    const isInside = (node: Node, elements: Array<HTMLElement | null>) =>
      elements.some(element => element?.contains(node))

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return

      if (modelMenuOpen && !isInside(target, [modelButtonRef.current, modelMenuRef.current])) {
        setModelMenuOpen(false)
      }
      if (effortMenuOpen && !isInside(target, [effortButtonRef.current, effortMenuRef.current])) {
        setEffortMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setModelMenuOpen(false)
      setEffortMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [effortMenuOpen, modelMenuOpen])

  const toggleModelMenu = () => {
    setEffortMenuOpen(false)
    setModelMenuOpen(open => !open)
  }

  const toggleEffortMenu = () => {
    setModelMenuOpen(false)
    setEffortMenuOpen(open => !open)
  }

  const handleSelectModel = (model: string) => {
    setModelMenuOpen(false)
    onUpdateAiConfig({ model })
  }

  const handleSelectEffort = (effort: AiReasoningEffort) => {
    setEffortMenuOpen(false)
    onUpdateAiConfig({ reasoningEffort: effort })
  }

  return (
    <>
      {queuedPrompts.length > 0 ? (
        <div className="accent-tonal mb-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
          <span className="min-w-0 truncate">
            {translate('已排队 {count} 条：{prompt}', {
              count: queuedPrompts.length,
              prompt:
                queuedPrompts[0].label ??
                (queuedPrompts[0].command ? getComposerCommandLabel() : queuedPrompts[0].prompt),
            })}
          </span>
          <button
            type="button"
            onClick={clearQueuedPrompts}
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-primary/10"
          >
            {translate('清空')}
          </button>
        </div>
      ) : null}

      <div className="relative rounded-lg border border-input bg-background transition-[border-color,box-shadow] focus-within:ring-2 focus-within:ring-ring/40">
        <textarea
          ref={composerRef}
          value={composerValue}
          onChange={event => setComposerValue(event.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={
            phase === 'loading'
              ? translate('可以继续输入，发送后会排队执行')
              : translate('输入对话；需要整理时先点击下方整理图标')
          }
          aria-label={translate('输入整理要求')}
          rows={3}
          disabled={phase === 'applying'}
          className="h-[76px] max-h-[76px] min-h-[76px] w-full resize-none rounded-t-lg border-0 bg-transparent px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex min-h-8 items-center justify-between gap-2 px-2 pb-1.5 pt-0">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              ref={modelButtonRef}
              type="button"
              onClick={toggleModelMenu}
              disabled={!canUseControls}
              aria-haspopup="menu"
              aria-expanded={modelMenuOpen}
              title={translate('切换模型')}
              className="inline-flex min-w-0 max-w-[45%] items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="truncate">{aiConfig?.model.trim() || translate('未配置模型')}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
            <button
              ref={effortButtonRef}
              type="button"
              onClick={toggleEffortMenu}
              disabled={!canUseControls}
              aria-haspopup="menu"
              aria-expanded={effortMenuOpen}
              title={translate('思考程度')}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Gauge className="h-3 w-3 shrink-0" />
              <span>{effortLabel(aiConfig?.reasoningEffort ?? 'none')}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
            {composerCommand ? (
              <span className="accent-tonal inline-flex max-w-full shrink-0 items-center gap-1 rounded-md border px-1.5 py-0 text-[11px] font-medium leading-5">
                <Sparkles className="h-3 w-3 shrink-0" />
                <span className="truncate">{getComposerCommandLabel()}</span>
                <button
                  type="button"
                  onClick={() => setComposerCommand(null)}
                  aria-label={translate('移除指令')}
                  title={translate('移除指令')}
                  className="accent-foreground -mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-80 transition-colors hover:bg-primary/15 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              ref={presetsButtonRef}
              type="button"
              onClick={() => setPresetsExpanded(expanded => !expanded)}
              disabled={!canUseControls}
              aria-label={translate('快捷提示')}
              title={translate('快捷提示')}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
            </button>
            {phase === 'loading' ? (
              <button
                type="button"
                onClick={onStopRun}
                aria-label={translate('停止生成')}
                title={translate('停止生成')}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-background text-foreground transition-colors hover:bg-accent"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSendPrompt(composerValue)}
                disabled={!canSend}
                aria-label={translate('发送')}
                title={translate('发送')}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {presetsExpanded ? (
            <motion.div
              ref={presetsMenuRef}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-[calc(100%+0.5rem)] right-0 z-20 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border/85 bg-background p-1.5 shadow-xl"
            >
              {PROMPT_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset.prompt)}
                  title={translate(preset.description)}
                  className="block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-foreground"
                >
                  <div className="text-xs font-medium text-foreground">
                    {translate(preset.label)}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {translate(preset.description)}
                  </div>
                </button>
              ))}
            </motion.div>
          ) : null}
          {modelMenuOpen ? (
            <motion.div
              ref={modelMenuRef}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-60 overflow-hidden rounded-lg border border-border/85 bg-background p-1.5 shadow-xl"
              role="menu"
            >
              {modelOptions.length > 0 ? (
                modelOptions.map(model => {
                  const active = aiConfig?.model.trim() === model
                  return (
                    <button
                      key={model}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => handleSelectModel(model)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {model}
                      </span>
                      {active ? <Check className="accent-foreground h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  )
                })
              ) : (
                <p className="px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
                  {translate('还没有可选模型，请先到设置页填写模型名称。')}
                </p>
              )}
            </motion.div>
          ) : null}
          {effortMenuOpen ? (
            <motion.div
              ref={effortMenuRef}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-44 overflow-hidden rounded-lg border border-border/85 bg-background p-1.5 shadow-xl"
              role="menu"
            >
              {AI_REASONING_EFFORTS.map(effort => {
                const active = (aiConfig?.reasoningEffort ?? 'none') === effort
                return (
                  <button
                    key={effort}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => handleSelectEffort(effort)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {effortLabel(effort)}
                    </span>
                    {active ? <Check className="accent-foreground h-3.5 w-3.5 shrink-0" /> : null}
                  </button>
                )
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  )
}
