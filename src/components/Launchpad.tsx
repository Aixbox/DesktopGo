import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useIconStore } from '../stores/iconStore'
import { IconGrid } from './IconGrid'
import type { IconSize } from '../types'

const ICON_SIZE_OPTIONS: { label: string; value: IconSize }[] = [
  { label: '大图标', value: 'large' },
  { label: '中等图标', value: 'medium' },
  { label: '小图标', value: 'small' },
]

export function Launchpad() {
  const { icons, loading, fetchIcons, iconSize, setIconSize } = useIconStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    fetchIcons()
  }, [fetchIcons])

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (contextMenu) {
      setContextMenu(null)
      return
    }
    if (e.target === e.currentTarget) {
      invoke('toggle_window')
    }
  }

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMenuClick = useCallback((size: IconSize) => {
    setIconSize(size)
    setContextMenu(null)
  }, [setIconSize])

  return (
    <div
      className="launchpad-bg w-screen h-screen flex flex-col items-center justify-center select-none"
      onClick={handleBackgroundClick}
      onContextMenu={handleContextMenu}
    >
      {loading ? (
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          <span className="text-white/70 text-lg">Loading...</span>
        </div>
      ) : icons.length === 0 ? (
        <div className="text-white/50 text-lg">No desktop shortcuts found</div>
      ) : (
        <IconGrid icons={icons} />
      )}

      {contextMenu && (
        <div
          className="fixed bg-gray-800/95 backdrop-blur-sm rounded-lg py-1 shadow-xl border border-white/10 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {ICON_SIZE_OPTIONS.map(option => (
            <button
              key={option.value}
              className="w-full px-4 py-2 text-left text-sm text-white/90 hover:bg-white/10 flex items-center gap-3 transition-colors"
              onClick={() => handleMenuClick(option.value)}
            >
              <span className="w-4 text-center">
                {iconSize === option.value ? '✓' : ''}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}