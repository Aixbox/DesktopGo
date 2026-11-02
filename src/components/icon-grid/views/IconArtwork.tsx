import { AppWindow } from 'lucide-react'
import type { DesktopIcon } from '../../../types'
import { useIconDominantColor } from '../hooks/useIconDominantColor'
import { useRoundedIcon } from '../hooks/useRoundedIcon'

// Broad, smooth lighting over the extracted color; no grain or image texture.
const ICON_COLOR_SHADING =
  'radial-gradient(ellipse at 20% 0%, rgb(255 255 255 / 14%), rgb(255 255 255 / 0%) 70%), ' +
  'linear-gradient(180deg, rgb(0 0 0 / 0%) 35%, rgb(0 0 0 / 9%) 100%)'

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
  const roundedImage = useRoundedIcon(enlarged ? icon.icon_base64 : undefined)
  const foregroundStyle = {
    ...(imageSize === undefined
      ? {}
      : {
          width: imageSize,
          height: imageSize,
          flexShrink: 0,
          transition: enlarged ? 'inherit' : undefined,
        }),
    // Rounded pixels already follow the visible artwork, including its transparent padding.
    ...(enlarged
      ? {
          borderRadius: roundedImage ? 0 : '25%',
          clipPath: roundedImage ? 'none' : 'inset(0 round 25%)',
        }
      : {}),
  }
  return (
    <>
      {color ? (
        <span
          aria-hidden="true"
          data-icon-color-fill
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: color,
            backgroundImage: ICON_COLOR_SHADING,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            opacity: 'var(--launchpad-icon-opacity, 1)',
          }}
        />
      ) : null}
      {icon.icon_base64 ? (
        <img
          src={roundedImage ?? icon.icon_base64}
          alt={name}
          draggable={false}
          className="launchpad-icon-artwork relative h-full w-full object-contain"
          style={enlarged || imageSize !== undefined ? foregroundStyle : undefined}
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
