import { motion } from 'framer-motion'
import { HardDrive, LayoutGrid } from 'lucide-react'

type SearchSource = 'icons' | 'everything'

interface SearchSourceTabsProps {
  source: SearchSource
  onChange: (source: SearchSource) => void
}

const TABS = [
  { id: 'icons', label: '图标', icon: LayoutGrid },
  { id: 'everything', label: '系统文件', icon: HardDrive },
] as const

export function SearchSourceTabs({ source, onChange }: SearchSourceTabsProps) {
  return (
    <div className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/5 p-1 shadow-inner ring-1 ring-white/10">
      {TABS.map(tab => {
        const isActive = source === tab.id
        const Icon = tab.icon

        return (
          <button
            key={tab.id}
            type="button"
            className={`relative inline-flex h-full items-center justify-center rounded-md px-3 text-xs font-medium transition-colors duration-200 ${
              isActive
                ? 'text-white drop-shadow-md'
                : 'text-white/55 hover:text-white/85'
            }`}
            onClick={() => onChange(tab.id as SearchSource)}
          >
            {isActive && (
              <motion.div
                layoutId="search-source-tab-indicator"
                className="absolute inset-0 rounded-md bg-white/15 shadow-[0_1px_3px_rgba(0,0,0,0.1)] ring-1 ring-white/10"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
              />
            )}

            <span className="relative z-10 flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
