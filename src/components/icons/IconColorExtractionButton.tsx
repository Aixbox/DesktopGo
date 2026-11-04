import { Pipette, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/lib/i18n'
import type { IconColorId } from '@/lib/iconColors'
import { useIconColorExtraction } from './useIconColorExtraction'

interface IconColorExtractionButtonProps {
  source: string
  selectionKey: string
  value: IconColorId
  disabled: boolean
  onChange: (color: IconColorId) => void
}

export function IconColorExtractionButton(props: IconColorExtractionButtonProps) {
  const { extract, pending, failed } = useIconColorExtraction(props)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 rounded-full px-2.5 text-xs"
        aria-label={translate('从图标取色')}
        aria-busy={pending}
        title={translate(props.source ? '从当前选中的图标中提取背景色' : '请先选择可用的图标')}
        disabled={props.disabled || pending || !props.source}
        onClick={() => void extract()}
      >
        {pending ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Pipette className="h-3.5 w-3.5" />
        )}
        {translate(pending ? '正在取色…' : '从图标取色')}
      </Button>
      {failed ? (
        <span role="status" className="basis-full text-xs text-destructive">
          {translate('未能从图标中提取颜色，请选择其他图标或重试。')}
        </span>
      ) : null}
    </>
  )
}
