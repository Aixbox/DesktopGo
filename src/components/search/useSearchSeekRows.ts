import { useCallback, useState } from 'react'
import {
  collectResolvedSearchRows,
  projectSearchSeekRows,
  type SearchVirtualRow,
} from './searchSeekRows'
import type { SearchHit } from '@/lib/search/types'

interface RetainedRows {
  cacheKey: string
  items: SearchHit[]
}

export function useSearchSeekRows(rows: SearchVirtualRow[], cacheKey: string) {
  const [retainedRows, setRetainedRows] = useState<RetainedRows>({ cacheKey, items: [] })
  const retainedItems = retainedRows.cacheKey === cacheKey ? retainedRows.items : []
  const resolvedItems = collectResolvedSearchRows(rows)

  const retainCurrentRows = useCallback(() => {
    if (resolvedItems.length === 0) return
    setRetainedRows(current => {
      const unchanged =
        current.cacheKey === cacheKey &&
        current.items.length === resolvedItems.length &&
        current.items.every((item, index) => item === resolvedItems[index])
      return unchanged ? current : { cacheKey, items: resolvedItems }
    })
  }, [cacheKey, resolvedItems])

  return {
    seekRows: projectSearchSeekRows(rows, retainedItems),
    retainCurrentRows,
  }
}
