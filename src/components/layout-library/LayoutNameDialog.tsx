import { useState } from 'react'
import { translate } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { inputBaseClassName } from '@/components/ui/inputStyles'

interface LayoutNameDialogProps {
  title: string
  description?: string
  initialName?: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: (name: string) => void | Promise<void>
}

/** 布局命名弹窗：保存新布局与重命名共用。由调用方按需挂载，所以没有 open 开关。 */
export function LayoutNameDialog({
  title,
  description,
  initialName = '',
  confirmLabel,
  onCancel,
  onConfirm,
}: LayoutNameDialogProps) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const submit = async () => {
    if (!trimmed || saving) return
    setSaving(true)
    try {
      await onConfirm(trimmed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/22 p-4 backdrop-blur-[1px] dark:bg-black/45">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-name-dialog-title"
        className="w-full max-w-sm overflow-hidden rounded-card border border-border bg-card shadow-xl"
      >
        <div className="space-y-1 border-b border-border/80 px-5 py-4">
          <h3 id="layout-name-dialog-title" className="text-base font-semibold">
            {title}
          </h3>
          {description ? (
            <p className="text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="px-5 py-4">
          <input
            autoFocus
            value={name}
            maxLength={40}
            placeholder={translate('布局名称')}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancel()
              }
            }}
            className={cn(inputBaseClassName, 'bg-card')}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border/80 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            {translate('取消')}
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={!trimmed || saving}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
