import { useEffect, useState } from 'react'
import { loadRoundedIcon, readCachedRoundedIcon } from '../services/roundedIcon'

export function useRoundedIcon(source: string | undefined): string | null {
  const [result, setResult] = useState(() => ({ source, image: readCachedRoundedIcon(source) }))
  useEffect(() => {
    if (!source) return
    let active = true
    void loadRoundedIcon(source).then(image => {
      if (active) setResult({ source, image })
    })
    return () => {
      active = false
    }
  }, [source])
  return result.source === source ? result.image : readCachedRoundedIcon(source)
}
