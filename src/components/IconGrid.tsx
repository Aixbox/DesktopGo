import type { DesktopIcon } from '../types'
import { ICON_SIZE_CONFIG } from '../types'
import { useIconStore } from '../stores/iconStore'
import { Icon } from './Icon'

interface IconGridProps {
  icons: DesktopIcon[]
}

export function IconGrid({ icons }: IconGridProps) {
  const { iconSize } = useIconStore()
  const columnWidth = ICON_SIZE_CONFIG[iconSize].columnWidth

  return (
    <div className="w-full h-full flex items-center justify-center px-16 py-12">
      <div
        className="grid gap-x-2 gap-y-4 justify-items-center content-start"
        style={{
          gridTemplateColumns: `repeat(auto-fill, ${columnWidth}px)`,
          maxHeight: 'calc(100vh - 96px)',
          overflowY: 'auto',
          width: '100%',
        }}
      >
        {icons.map(icon => (
          <Icon key={icon.id} icon={icon} />
        ))}
      </div>
    </div>
  )
}
