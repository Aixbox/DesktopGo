import { useEffect, useState } from 'react'

export type DocumentDirection = 'ltr' | 'rtl'

const readDocumentDirection = (): DocumentDirection => {
  if (typeof document === 'undefined') return 'ltr'
  if (document.documentElement.dir === 'rtl') return 'rtl'
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    return window.getComputedStyle(document.documentElement).direction === 'rtl' ? 'rtl' : 'ltr'
  }
  return 'ltr'
}

/** Keep layout direction changes (for example after a locale switch) observable by views. */
export const useDocumentDirection = (): DocumentDirection => {
  const [direction, setDirection] = useState<DocumentDirection>(readDocumentDirection)

  useEffect(() => {
    const update = () => {
      const next = readDocumentDirection()
      setDirection(previous => (previous === next ? previous : next))
    }

    update()
    const root = document.documentElement
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['dir', 'class', 'style'] })
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return direction
}
