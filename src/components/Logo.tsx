interface LogoIconProps {
  size?: number
  className?: string
}

/** 方案6D 玻璃拟态 2×2 网格图标 */
export function LogoIcon({ size = 24, className }: LogoIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 80"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="20" fill="#1a1a2e" />
      <rect
        width="80"
        height="80"
        rx="20"
        fill="url(#logo-bg)"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
      />
      <rect
        x="16"
        y="16"
        width="20"
        height="20"
        rx="6"
        fill="rgba(167,139,250,0.6)"
        stroke="#a78bfa"
        strokeWidth="2"
      />
      <rect
        x="44"
        y="16"
        width="20"
        height="20"
        rx="6"
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="2"
      />
      <rect
        x="16"
        y="44"
        width="20"
        height="20"
        rx="6"
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="2"
      />
      <rect
        x="44"
        y="44"
        width="20"
        height="20"
        rx="6"
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="2"
      />
    </svg>
  )
}

interface LogoTextProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const textSizes = {
  sm: 'text-sm',
  md: 'text-xl',
  lg: 'text-3xl',
}

/** DesktopGo 品牌文字 */
export function LogoText({ size = 'md', className }: LogoTextProps) {
  return (
    <span className={`inline-flex items-baseline ${className ?? ''}`}>
      <span className={`${textSizes[size]} font-light text-muted-foreground/70 tracking-wide`}>
        Desktop
      </span>
      <span className={`${textSizes[size]} font-bold text-[#a78bfa] tracking-wide`}>Go</span>
    </span>
  )
}

interface LogoProps {
  iconSize?: number
  textSize?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  showText?: boolean
  className?: string
}

/** 完整 Logo：图标 + 文字 */
export function Logo({
  iconSize = 24,
  textSize = 'md',
  showIcon = true,
  showText = true,
  className,
}: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      {showIcon && <LogoIcon size={iconSize} />}
      {showText && <LogoText size={textSize} />}
    </span>
  )
}
