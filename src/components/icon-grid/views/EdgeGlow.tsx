interface EdgeGlowProps {
  direction: 'left' | 'right'
  active: boolean
}

export function EdgeGlow({ direction, active }: EdgeGlowProps) {
  const isLeft = direction === 'left'

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-10"
      style={{
        width: '100px',
        [isLeft ? 'left' : 'right']: 0,
      }}
      aria-hidden="true"
    >
      <div
        className="h-full w-full transition-opacity duration-300 ease-in-out"
        style={{
          opacity: active ? 1 : 0,
          background: isLeft
            ? 'radial-gradient(ellipse 100% 50% at 0% 50%, var(--edge-glow-color) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 100% 50% at 100% 50%, var(--edge-glow-color) 0%, transparent 70%)',
        }}
      />
    </div>
  )
}
