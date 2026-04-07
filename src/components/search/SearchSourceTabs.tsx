import { motion } from 'framer-motion'
import { HardDrive, LayoutGrid } from 'lucide-react'
import { translate, useI18n } from '@/lib/i18n'

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
  useI18n()

  return (
    <div className="search-control-group inline-flex h-8 items-center gap-1 rounded-lg p-1">
      {TABS.map(tab => {
        const isActive = source === tab.id
        const Icon = tab.icon

        return (
          <button
            key={tab.id}
            type="button"
            className={`relative inline-flex h-full items-center justify-center rounded-md px-3 text-xs font-medium transition-colors duration-200 ${
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onChange(tab.id as SearchSource)}
          >
            {isActive && (
              <motion.div
                layoutId="search-source-tab-indicator"
                className="search-control-indicator absolute inset-0 rounded-md"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
              />
            )}

            <span className="relative z-10 flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              <span>{translate(tab.label)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
