import { useEffect, useState } from 'react'
import { loadIconColor, readCachedIconColor } from '../../../lib/iconColorSampling'

export function useIconDominantColor(source: string | undefined): string | null {
  const [sample, setSample] = useState(() => ({ source, color: readCachedIconColor(source) }))
  useEffect(() => {
    if (!source) return
    let active = true
    void loadIconColor(source).then(color => {
      if (active) setSample({ source, color })
    })
    return () => {
      active = false
    }
  }, [source])
  // Changing an icon must never display the previous image's color while decoding.
  return sample.source === source ? sample.color : readCachedIconColor(source)
}
