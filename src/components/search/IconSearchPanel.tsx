import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AppWindow, Folder } from 'lucide-react'
import type { DesktopIcon } from '@/types'
import { SearchSourceTabs } from './SearchSourceTabs'

const PANEL_TRANSITION = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1] as const,
}

interface IconSearchPanelProps {
  source: 'icons' | 'everything'
  onSourceChange: (source: 'icons' | 'everything') => void
  visible: boolean
  keyword: string
  results: DesktopIcon[]
  selectedIndex: number
  onSelect: (index: number) => void
  onActivate: (icon: DesktopIcon) => void
}

export function IconSearchPanel({
  source,
  onSourceChange,
  visible,
  keyword,
  results,
  selectedIndex,
  onSelect,
  onActivate,
}: IconSearchPanelProps) {
  const prefersReducedMotion = useReducedMotion()
  const panelTransition = prefersReducedMotion ? { duration: 0 } : PANEL_TRANSITION
  const hasKeyword = keyword.trim().length > 0

  return (
    <div
      data-search-placeholder
      className="absolute left-1/2 top-[4.6rem] z-30 w-full max-w-2xl -translate-x-1/2 px-6"
    >
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.div
            key="icon-search-panel"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={panelTransition}
            className="pointer-events-auto overflow-hidden rounded-2xl border border-white/15 bg-black/70 shadow-2xl backdrop-blur-xl will-change-[opacity,transform]"
          >
            <div className="border-b border-white/10 px-3 py-2">
              <SearchSourceTabs source={source} onChange={onSourceChange} />
            </div>

            {!hasKeyword ? (
              <div className="px-4 py-3 text-sm text-white/60">Type to search desktop icons.</div>
            ) : results.length === 0 ? (
              <div className="px-4 py-3 text-sm text-white/60">No matching icons.</div>
            ) : (
              <div className="max-h-[56vh] overflow-auto py-1">
                {results.map((icon, index) => {
                  const isSelected = index === selectedIndex
                  const isFolder = icon.item_type === 'folder'

                  return (
                    <button
                      key={`${icon.source}:${icon.id}`}
                      type="button"
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                        isSelected ? 'bg-white/15' : 'hover:bg-white/10'
                      }`}
                      onMouseEnter={() => onSelect(index)}
                      onClick={() => onSelect(index)}
                      onDoubleClick={() => onActivate(icon)}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
                        {icon.icon_base64 ? (
                          <img
                            src={icon.icon_base64}
                            alt={icon.name}
                            className="h-7 w-7 object-contain"
                            draggable={false}
                          />
                        ) : isFolder ? (
                          <Folder className="h-4 w-4 text-white/70" />
                        ) : (
                          <AppWindow className="h-4 w-4 text-white/70" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{icon.name}</span>
                        <span className="block truncate text-xs text-white/55">{icon.path}</span>
                      </span>

                      <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/45">
                        {icon.source === 'customapp' ? 'Custom' : 'Desktop'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
