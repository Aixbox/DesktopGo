import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  SetStateAction,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { FolderClosed, Loader2, SendHorizontal, Sparkles, X } from 'lucide-react'
import { translate } from '@/lib/i18n'
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
  onComposerKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onInsertOrganizeCommand: () => void
  onSelectPreset: (prompt: string) => void
  onSendPrompt: (prompt: string) => void
}

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
  onComposerKeyDown,
  onInsertOrganizeCommand,
  onSelectPreset,
  onSendPrompt,
}: AiOrganizeComposerProps) {
  const prefersReducedMotion = useReducedMotion()
  const hasComposerText = composerValue.trim().length > 0
  const canSend =
    (hasComposerText || Boolean(composerCommand)) && sessionsLoaded && phase !== 'applying'
  const canUsePresets = sessionsLoaded && phase !== 'applying'

  return (
    <>
      {queuedPrompts.length > 0 ? (
        <div className="accent-tonal mb-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
          <span className="min-w-0 truncate">
            {translate('已排队 {count} 条：{prompt}', {
              count: queuedPrompts.length,
              prompt:
                queuedPrompts[0].label ??
                (queuedPrompts[0].command
                  ? getComposerCommandLabel(queuedPrompts[0].command)
                  : queuedPrompts[0].prompt),
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
          <div className="flex min-w-0 flex-1 items-center">
            {composerCommand ? (
              <span className="accent-tonal inline-flex max-w-full shrink-0 items-center gap-1 rounded-md border px-1.5 py-0 text-[11px] font-medium leading-5">
                {composerCommand.kind === 'edit' ? (
                  <Sparkles className="h-3 w-3 shrink-0" />
                ) : (
                  <FolderClosed className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate">{getComposerCommandLabel(composerCommand)}</span>
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
              type="button"
              onClick={onInsertOrganizeCommand}
              disabled={!canUsePresets}
              aria-label={translate('插入整理图标指令')}
              title={translate('插入整理图标指令')}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderClosed className="h-4 w-4" />
            </button>
            <button
              ref={presetsButtonRef}
              type="button"
              onClick={() => setPresetsExpanded(expanded => !expanded)}
              disabled={!canUsePresets}
              aria-label={translate('快捷提示')}
              title={translate('快捷提示')}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onSendPrompt(composerValue)}
              disabled={!canSend}
              aria-label={phase === 'loading' ? translate('加入队列') : translate('发送')}
              title={phase === 'loading' ? translate('加入队列') : translate('发送')}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {phase === 'loading' && !hasComposerText ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
            </button>
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
        </AnimatePresence>
      </div>
    </>
  )
}
