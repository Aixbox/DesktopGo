import type { DesktopIcon } from '../types'
import { useIconStore } from '../stores/iconStore'
import { AppWindow } from 'lucide-react'

interface IconProps {
  icon: DesktopIcon
}

export function Icon({ icon }: IconProps) {
  const { launchApp } = useIconStore()

  const handleClick = () => {
    launchApp(icon.path)
  }

  return (
    <button
      className="icon-item flex flex-col items-center gap-2 p-3 rounded-2xl
                 bg-transparent border-none shadow-none
                 hover:bg-white/10 active:bg-white/20
                 transition-all duration-200 cursor-pointer
                 w-[100px] group"
      onClick={handleClick}
      title={icon.name}
    >
      <div className="icon-image w-16 h-16 flex items-center justify-center
                      rounded-[14px] overflow-hidden
                      group-hover:scale-105
                      group-active:scale-95
                      transition-all duration-200">
        {icon.icon_base64 ? (
          <img
            src={icon.icon_base64}
            alt={icon.name}
            className="w-14 h-14 max-w-[56px] max-h-[56px] object-contain"
            draggable={false}
          />
        ) : (
          <AppWindow className="w-8 h-8 text-white/60" />
        )}
      </div>
      <span className="icon-label text-[11px] text-white text-center leading-tight
                       max-w-[90px] truncate drop-shadow-md">
        {icon.name}
      </span>
    </button>
  )
}
