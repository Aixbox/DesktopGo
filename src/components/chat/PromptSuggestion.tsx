import { motion } from 'framer-motion'
import { ArrowUpRight, Bot } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { useReducedMotion } from 'framer-motion'

export interface PromptSuggestionItem {
  key: string
  title: string
  description: string
}

interface PromptSuggestionProps {
  items: PromptSuggestionItem[]
  onSelect: (item: PromptSuggestionItem) => void
}

/**
 * HeroUI PromptSuggestion 风格的空会话建议：会话区居中展示标题与
 * 建议卡片网格，点击即发送对应 prompt。
 */
export function PromptSuggestion({ items, onSelect }: PromptSuggestionProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-6 text-center">
      <div className="accent-tonal flex h-11 w-11 items-center justify-center rounded-2xl border">
        <Bot className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {translate('我们可以从这些方式开始')}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('点击建议立即执行，也可以在下方输入自己的要求。')}
        </p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((item, index) => (
          <motion.button
            key={item.key}
            type="button"
            onClick={() => onSelect(item)}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="group relative flex min-w-0 flex-col items-start gap-0.5 rounded-xl border border-border/80 bg-background/60 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
          >
            <span className="flex w-full items-center gap-1 pr-4 text-xs font-medium text-foreground">
              <span className="min-w-0 truncate">{item.title}</span>
              <ArrowUpRight className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary" />
            </span>
            <span className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
              {item.description}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
