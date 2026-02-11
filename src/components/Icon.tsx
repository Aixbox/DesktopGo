import type { DesktopIcon } from '../types'
import { ICON_SIZE_CONFIG } from '../types'
import { useIconStore } from '../stores/iconStore'
import { AppWindow } from 'lucide-react'

interface IconProps {
  icon: DesktopIcon
}

export function Icon({ icon }: IconProps) {
  const { launchApp, iconSize, titleLineCount } = useIconStore()
  const config = ICON_SIZE_CONFIG[iconSize]
  const isSingleLineTitle = titleLineCount === 'one'

  const handleClick = () => {
    launchApp(icon.path)
  }

  return (
    <button
      data-icon
      className="icon-item flex flex-col items-center gap-2 p-3 rounded-2xl
                 bg-transparent border-none shadow-none
                 hover:bg-white/10 active:bg-white/20
                 transition-all duration-200 cursor-pointer group"
      style={{ width: config.containerWidth }}
      onClick={handleClick}
      title={icon.name}
    >
      <div
        className="icon-image flex items-center justify-center
                    overflow-hidden
                    group-hover:scale-105
                    group-active:scale-95
                    transition-all duration-200"
        style={{ width: config.imgSize, height: config.imgSize }}
      >
        {icon.icon_base64 ? (
          <img
            src={icon.icon_base64}
            alt={icon.name}
            style={{ width: config.imgSize, height: config.imgSize }}
            className="object-contain"
            draggable={false}
          />
        ) : (
          <AppWindow className="w-8 h-8 text-white/60" />
        )}
      </div>
      <span
        className="icon-label text-[11px] text-white text-center leading-tight drop-shadow-md"
        style={{
          maxWidth: config.containerWidth - 10,
          display: isSingleLineTitle ? 'block' : '-webkit-box',
          WebkitLineClamp: isSingleLineTitle ? 1 : 2,
          WebkitBoxOrient: isSingleLineTitle ? undefined : 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: isSingleLineTitle ? 'nowrap' : 'normal',
          overflowWrap: 'anywhere',
        }}
      >
        {icon.name}
      </span>
    </button>
  )
}
