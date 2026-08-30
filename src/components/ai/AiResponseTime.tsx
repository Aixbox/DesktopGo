import { translate } from '@/lib/i18n'
import { formatAiDuration } from './aiOrganizePanelModel'

// 回复顶部的整轮耗时（ChatGPT 式），仅完成的回复显示。
export function AiResponseTime({ ms }: { ms?: number }) {
  if (!ms) return null
  return (
    <p className="mb-1 text-[11px] leading-4 text-muted-foreground">
      {translate('用时 {time}', { time: formatAiDuration(ms) })}
    </p>
  )
}
