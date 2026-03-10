import { HardDrive, LayoutGrid } from 'lucide-react'

type SearchSource = 'icons' | 'everything'

interface SearchSourceTabsProps {
  source: SearchSource
  onChange: (source: SearchSource) => void
}

export function SearchSourceTabs({ source, onChange }: SearchSourceTabsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition ${
          source === 'icons'
            ? 'border-white/35 bg-white/15 text-white'
            : 'border-white/20 text-white/70 hover:bg-white/10'
        }`}
        onClick={() => onChange('icons')}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>Icons</span>
      </button>

      <button
        type="button"
        className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition ${
          source === 'everything'
            ? 'border-white/35 bg-white/15 text-white'
            : 'border-white/20 text-white/70 hover:bg-white/10'
        }`}
        onClick={() => onChange('everything')}
      >
        <HardDrive className="h-3.5 w-3.5" />
        <span>Everything</span>
      </button>
    </div>
  )
}
