import { useCallback, useLayoutEffect, useRef } from 'react'

export function useStableSearchEvent<Args extends unknown[]>(handler: (...args: Args) => void) {
  const handlerRef = useRef(handler)

  useLayoutEffect(() => {
    handlerRef.current = handler
  }, [handler])

  return useCallback((...args: Args) => handlerRef.current(...args), [])
}
