import { useCallback, useEffect, useState } from 'react'
import { getSearchPreview } from './api'
import type { SearchPreview } from './types'

interface UseSearchPreviewOptions {
  enabled: boolean
  path: string
}

export function useSearchPreview({ enabled, path }: UseSearchPreviewOptions) {
  const [preview, setPreview] = useState<SearchPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setPreview(null)
    setLoading(false)
    setError(null)
  }, [])

  useEffect(() => {
    if (!enabled || !path) return

    let cancelled = false
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setLoading(true)
      setError(null)

      try {
        const nextPreview = await getSearchPreview(path)
        if (!cancelled) setPreview(nextPreview)
      } catch (previewError) {
        if (cancelled) return
        setPreview(null)
        setError(String(previewError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [enabled, path])

  return { preview, loading, error, reset }
}
