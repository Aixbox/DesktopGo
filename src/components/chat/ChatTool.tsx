import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { translate } from '@/lib/i18n'
import type { AiToolCallRecord } from '@/lib/aiOrganizeSessions'

interface ChatToolProps {
  /** 卡片标题，如「已生成布局预览」。 */
  title: string
  /** 标题后的补充信息，如「3 个分组 · 21 个图标」。 */
  meta?: string
  /** true = 工具仍在执行，触发器显示旋转指示。 */
  pending?: boolean
  defaultExpanded?: boolean
  children: ReactNode
}

/**
 * HeroUI ChatTool 风格的可折叠工具卡片：触发器一行（状态图标 + 标题 +
 * 摘要 + 展开箭头），展开后呈现工具产物（这里是布局预览）。
 */
export function ChatTool({
  title,
  meta,
  pending = false,
  defaultExpanded = true,
  children,
}: ChatToolProps) {
  const prefersReducedMotion = useReducedMotion()
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="mt-2 w-full overflow-hidden rounded-xl border border-border/80 bg-muted/25">
      <button
        type="button"
        onClick={() => setExpanded(current => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
      >
        {pending ? (
          <Loader2 className="accent-foreground h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-300" />
          </span>
        )}
        <span className="min-w-0 truncate text-xs font-medium text-foreground">{title}</span>
        {meta ? (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">{meta}</span>
        ) : null}
        <motion.span
          className="ml-auto inline-flex shrink-0 text-muted-foreground"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="chat-tool-content"
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/60 px-3 py-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

const TOOL_LABELS: Record<string, string> = {
  list_icons: '查看图标库',
  organize_icons: '整理图标',
}

interface ChatToolRecordProps {
  record: AiToolCallRecord
  /** true = 工具仍在执行。 */
  pending?: boolean
}

/**
 * 多轮 agent 循环里的单次工具调用行：折叠态显示工具名与状态，
 * 展开后是调用参数与执行结果。
 */
export function ChatToolRecord({ record, pending = false }: ChatToolRecordProps) {
  const label = TOOL_LABELS[record.name] ?? record.name
  return (
    <ChatTool title={translate(label)} pending={pending} defaultExpanded={false}>
      <div className="space-y-1.5 text-[11px] leading-4">
        {record.argsText ? (
          <div>
            <p className="font-medium text-muted-foreground">{translate('调用参数')}</p>
            <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all text-muted-foreground/85">
              {record.argsText}
            </p>
          </div>
        ) : null}
        {record.resultText ? (
          <div>
            <p className="font-medium text-muted-foreground">{translate('执行结果')}</p>
            <p
              className={`max-h-32 overflow-y-auto whitespace-pre-wrap break-all ${
                record.state === 'error' ? 'text-red-600 dark:text-red-300' : 'text-foreground/80'
              }`}
            >
              {record.resultText}
            </p>
          </div>
        ) : null}
      </div>
    </ChatTool>
  )
}
