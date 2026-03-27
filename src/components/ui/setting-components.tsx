interface SettingGroupProps {
  title: string
  children: React.ReactNode
}

export function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <div className="mb-6">
      <h3 className="mb-3 text-sm font-medium text-foreground/80">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

interface SettingCardProps {
  label: string
  desc?: string
  children: React.ReactNode
}

export function SettingCard({ label, desc, children }: SettingCardProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border/90 bg-card p-4 shadow-sm">
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
}

export function SwitchButton({ checked, onChange }: SwitchButtonProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ${
        checked ? 'border-blue-500 bg-blue-500/90' : 'border-border bg-zinc-500/30'
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
}

export function ToggleRow({ title, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/90 bg-card p-4 shadow-sm">
      <div className="min-w-0 space-y-1">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">
        <SwitchButton checked={checked} onChange={onChange} />
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
      className={`rounded-lg border px-4 py-2 text-sm transition-all duration-150 cursor-pointer ${
        selected
          ? 'border-blue-500/55 bg-blue-500/15 text-blue-300 shadow-sm dark:text-blue-200'
          : 'border-border/90 bg-card text-foreground hover:border-foreground/15 hover:bg-accent'
      }`}
    >
      {label}
    </button>
  )
}
