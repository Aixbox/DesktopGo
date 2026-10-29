import { COLOROS_MOTION, MOTION_SPRING_EASING } from '../constants'

/**
 * Motion values shared by the paged and scrollable launchpad surfaces.
 *
 * The Android implementation keeps these values in profile resources. Keeping
 * them in one domain module gives the React views a single source of truth and
 * lets reduced-motion users remove time from an animation without changing
 * the resulting layout snapshot.
 */
export const LAUNCHPAD_MOTION_TOKENS = {
  pageSnapMs: COLOROS_MOTION.pageSnapMs,
  workspacePageSnapMs: COLOROS_MOTION.workspacePageSnapMs,
  largeScreenPageSnapMs: COLOROS_MOTION.largeScreenPageSnapMs,
  largeScreenWorkspacePageSnapMs: COLOROS_MOTION.largeScreenWorkspacePageSnapMs,
  adjacentScreenDropMs: COLOROS_MOTION.adjacentScreenDropMs,
  workspaceReorderAlarmMs: COLOROS_MOTION.workspaceReorderAlarmMs,
  folderReorderAlarmMs: COLOROS_MOTION.folderReorderAlarmMs,
  folderDropMs: COLOROS_MOTION.folderDropMs,
  spring: COLOROS_MOTION.spring,
  easing: MOTION_SPRING_EASING,
} as const

/** Resolve a duration without changing the state transition itself. */
export const resolveMotionDuration = (durationMs: number, reducedMotion: boolean): number =>
  reducedMotion ? 0 : Math.max(0, durationMs)

/**
 * Browser-safe reduced-motion detection for imperative animation code.
 * React views should prefer framer-motion's useReducedMotion hook, while
 * domain/animation helpers can use this function without depending on React.
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
