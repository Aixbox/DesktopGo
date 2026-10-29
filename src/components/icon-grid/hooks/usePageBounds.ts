import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

/** Keep page controls valid after normalization removes or adds pages. */
export const usePageBounds = (
  currentPage: number,
  pageCount: number,
  hoverPage: number | null,
  setCurrentPage: Dispatch<SetStateAction<number>>,
  setHoverPage: Dispatch<SetStateAction<number | null>>,
  currentPageRef: MutableRefObject<number>
) => {
  useEffect(() => {
    if (currentPage >= pageCount) {
      const nextPage = pageCount - 1
      currentPageRef.current = nextPage
      setCurrentPage(nextPage)
    }
    if (hoverPage !== null && hoverPage >= pageCount) setHoverPage(null)
  }, [currentPage, currentPageRef, hoverPage, pageCount, setCurrentPage, setHoverPage])
}
