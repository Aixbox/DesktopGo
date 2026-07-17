import type { ReactNode } from 'react'

interface SettingGroupProps {
  title: string
  children: ReactNode
}

export function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <div className="mb-5">
      <h3 className="mb-2.5 text-xs font-semibold text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

interface SettingCardProps {
  label: string
  desc?: string
  children: ReactNode
}

export function SettingCard({ label, desc, children }: SettingCardProps) {
  return (
    <div className="space-y-3 rounded-md border border-border/80 bg-card p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-foreground">{label}</h4>
        {desc ? <p className="text-xs leading-5 text-muted-foreground">{desc}</p> : null}
      </div>
      {children}
    </div>
  )
}

interface SwitchButtonProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}

export function SwitchButton({ checked, onChange, disabled = false }: SwitchButtonProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        onChange(!checked)
      }}
      className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 ${
        checked ? 'border-blue-500 bg-blue-500/90' : 'border-border bg-zinc-500/30'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
        disabled
          ? ''
          : 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25'
      }`}
    >
      <span
        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

interface ToggleRowProps {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: ToggleRowProps) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-4 rounded-md border border-border/80 bg-card px-4 py-3.5">
      <div className="min-w-0 space-y-1">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">
        <SwitchButton checked={checked} onChange={onChange} disabled={disabled} />
      </div>
    </div>
  )
}

interface OptionButtonProps {
  label: string
  selected: boolean
  onClick: () => void
}

export function OptionButton({ label, selected, onClick }: OptionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-2 text-sm transition-all duration-150 cursor-pointer ${
        selected
          ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/12 dark:text-blue-200'
          : 'border-input bg-background text-foreground hover:border-foreground/20 hover:bg-accent'
      }`}
    >
      {label}
    </button>
  )
}
