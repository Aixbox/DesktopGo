import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useIconStore } from '../stores/iconStore'
import { IconGrid } from './IconGrid'

export function Launchpad() {
  const { icons, loading, fetchIcons } = useIconStore()

  useEffect(() => {
    fetchIcons()
  }, [fetchIcons])

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      invoke('toggle_window')
    }
  }

  return (
    <div
      className="launchpad-bg w-screen h-screen flex flex-col items-center justify-center select-none"
      onClick={handleBackgroundClick}
      onContextMenu={e => e.preventDefault()}
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
    </div>
  )
}
