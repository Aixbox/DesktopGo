import { AppWindow } from 'lucide-react'
import type { DesktopIcon } from '../../../types'
import { useIconDominantColor } from '../hooks/useIconDominantColor'

/** One artwork layer for workspace tiles and drag/landing previews. */
export function IconArtwork({
  icon,
  enlarged,
  fallbackSize,
  imageSize,
  name = icon.name,
}: {
  icon: DesktopIcon
  enlarged: boolean
  fallbackSize: number
  imageSize?: number
  name?: string
}) {
  const color = useIconDominantColor(enlarged ? icon.icon_base64 : undefined)
  return (
    <>
      {color ? (
        <span
          aria-hidden="true"
          data-icon-color-fill
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: color, opacity: 'var(--launchpad-icon-opacity, 1)' }}
        />
      ) : null}
      {icon.icon_base64 ? (
        <img
          src={icon.icon_base64}
          alt={name}
          draggable={false}
          className="launchpad-icon-artwork relative h-full w-full object-contain"
          style={imageSize === undefined ? undefined : { width: imageSize, height: imageSize }}
        />
      ) : (
        <AppWindow
          className="launchpad-icon-artwork relative text-foreground/60"
          style={{ width: fallbackSize, height: fallbackSize }}
        />
      )}
    </>
  )
}
