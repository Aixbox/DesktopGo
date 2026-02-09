import type { DesktopIcon } from '../types'
import { Icon } from './Icon'

interface IconGridProps {
  icons: DesktopIcon[]
}

export function IconGrid({ icons }: IconGridProps) {
  return (
    <div className="w-full h-full flex items-center justify-center px-16 py-12">
      <div
        className="grid gap-x-2 gap-y-4 justify-items-center content-start"
        style={{
          gridTemplateColumns: 'repeat(7, 100px)',
          maxHeight: 'calc(100vh - 96px)',
          overflowY: 'auto',
        }}
      >
        {icons.map(icon => (
          <Icon key={icon.id} icon={icon} />
        ))}
      </div>
    </div>
  )
}
