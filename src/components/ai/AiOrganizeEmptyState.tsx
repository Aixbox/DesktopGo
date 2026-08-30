import { Sparkles } from 'lucide-react'
import { translate } from '@/lib/i18n'

// 会话为空时的引导占位。
export function AiOrganizeEmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
      <div className="mb-2 flex items-center gap-2 text-foreground">
        <Sparkles className="accent-foreground h-4 w-4" />
        {translate('选择预设或输入要求开始整理')}
      </div>
      <p className="text-xs leading-5">
        {translate('你可以先生成一版布局，再继续对话要求 AI 调整。')}
      </p>
    </div>
  )
}
