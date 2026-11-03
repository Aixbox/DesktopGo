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
    // 0 表示布局尚未准备好，不能据此把当前页改成 -1 或丢掉原来的页码。
    if (pageCount < 1) return
    if (currentPage >= pageCount) {
      const nextPage = pageCount - 1
      currentPageRef.current = nextPage
      setCurrentPage(nextPage)
    }
    if (hoverPage !== null && hoverPage >= pageCount) setHoverPage(null)
  }, [currentPage, currentPageRef, hoverPage, pageCount, setCurrentPage, setHoverPage])
}
