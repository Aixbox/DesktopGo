interface SearchResultSectionHeaderProps {
  title: string
  count: number
}

export function SearchResultSectionHeader({ title, count }: SearchResultSectionHeaderProps) {
  return (
    <div className="flex h-8 items-center justify-between gap-3 px-4 text-xs">
      <h3 className="min-w-0 truncate font-medium text-foreground/70">{title}</h3>
      <span className="shrink-0 tabular-nums text-muted-foreground">{count}</span>
    </div>
  )
}
