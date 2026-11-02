import { useEffect, useRef, useState } from 'react'

/** A resize keeps its handle available until the next press outside that handle. */
export function useFolderResizeHandleFocus() {
  const frameRef = useRef<HTMLDivElement>(null)
  const [retained, setRetained] = useState(false)

  useEffect(() => {
    if (!retained) return
    const dismissOutside = (event: PointerEvent) => {
      if (frameRef.current?.contains(event.target as Node)) return
      setRetained(false)
    }
    // Pointerup/click may occur outside the folder after a captured resize; only a new press dismisses.
    document.addEventListener('pointerdown', dismissOutside, true)
    return () => document.removeEventListener('pointerdown', dismissOutside, true)
  }, [retained])

  return { frameRef, retained, retain: () => setRetained(true) }
}
