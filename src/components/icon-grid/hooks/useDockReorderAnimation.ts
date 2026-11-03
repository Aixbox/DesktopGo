import { useLayoutEffect, useRef, type RefObject } from 'react'
import { createDockReorderMotion, readDockReorderPoses } from './dockReorderMotion'

/** Runs after DockBar commits its actual slots, including holes and system placeholders. */
export function useDockReorderAnimation(gridRef: RefObject<HTMLDivElement | null>, step: number) {
  const controllerRef = useRef<ReturnType<typeof createDockReorderMotion> | null>(null)
  useLayoutEffect(() => {
    const controller = createDockReorderMotion()
    controllerRef.current = controller
    return () => {
      controller.dispose()
      controllerRef.current = null
    }
  }, [])
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    controllerRef.current?.update(
      readDockReorderPoses(grid),
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      step
    )
  })
}
