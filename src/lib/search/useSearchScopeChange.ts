import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { getSearchScopeTransition, type SearchSource } from './scope'

interface UseSearchScopeChangeOptions {
  currentSource: SearchSource
  setSource: Dispatch<SetStateAction<SearchSource>>
  setSelectedIconIndex: Dispatch<SetStateAction<number>>
  setSelectedFileIndex: (index: number) => void
  setCombinedIndex: Dispatch<SetStateAction<number>>
  resetPreview: () => void
  setFilterMenuOpen: Dispatch<SetStateAction<boolean>>
}

export function useSearchScopeChange({
  currentSource,
  setSource,
  setSelectedIconIndex,
  setSelectedFileIndex,
  setCombinedIndex,
  resetPreview,
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
    },
    [
      currentSource,
      resetPreview,
      setCombinedIndex,
      setFilterMenuOpen,
      setSelectedFileIndex,
      setSelectedIconIndex,
      setSource,
    ]
  )
}
