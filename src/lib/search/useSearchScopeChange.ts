import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { getSearchScopeTransition, searchSourceIncludesFiles, type SearchSource } from './scope'

interface UseSearchScopeChangeOptions {
  currentSource: SearchSource
  setSource: Dispatch<SetStateAction<SearchSource>>
  setSelectedIconIndex: Dispatch<SetStateAction<number>>
  setSelectedFileIndex: (index: number) => void
  setCombinedIndex: Dispatch<SetStateAction<number>>
  resetPreview: () => void
  resetFileResults: () => void
  setFilterMenuOpen: Dispatch<SetStateAction<boolean>>
}

export function useSearchScopeChange({
  currentSource,
  setSource,
  setSelectedIconIndex,
  setSelectedFileIndex,
  setCombinedIndex,
  resetPreview,
  resetFileResults,
  setFilterMenuOpen,
}: UseSearchScopeChangeOptions) {
  return useCallback(
    (nextSource: SearchSource) => {
      const transition = getSearchScopeTransition(currentSource, nextSource)

      setSource(nextSource)
      setFilterMenuOpen(false)
      if (transition.resetSelections) {
        setSelectedIconIndex(-1)
        setSelectedFileIndex(-1)
        setCombinedIndex(-1)
      }
      if (transition.resetPreview) {
        resetPreview()
      }
      if (transition.changed && !searchSourceIncludesFiles(nextSource)) {
        resetFileResults()
      }
    },
    [
      currentSource,
      resetFileResults,
      resetPreview,
      setCombinedIndex,
      setFilterMenuOpen,
      setSelectedFileIndex,
      setSelectedIconIndex,
      setSource,
    ]
  )
}
