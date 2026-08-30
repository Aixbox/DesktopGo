import { useCallback, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { translate } from '@/lib/i18n'

interface AiMessageActionsProps {
  content: string
  failed?: boolean
  /** 最后一条消息常显，其余悬停显示（ChatGPT 行为）。 */
  alwaysVisible?: boolean
  onRegenerate: () => void
}

const copyWithFallback = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  }
}

export function AiMessageActions({
  content,
  failed = false,
  alwaysVisible = false,
  onRegenerate,
}: AiMessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const regenerateLabel = translate(failed ? '重试' : '重新生成')

  const handleCopy = useCallback(async () => {
    if (await copyWithFallback(content)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }, [content])

  return (
    <div
      className={`mt-1 flex items-center gap-0.5 transition-opacity ${
        alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={copied}
        aria-label={translate('复制')}
        title={translate('复制')}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={onRegenerate}
        aria-label={regenerateLabel}
        title={regenerateLabel}
        className="flex h-6 items-center justify-center gap-1 rounded px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {failed ? <span className="text-[11px]">{regenerateLabel}</span> : null}
      </button>
    </div>
  )
}
