import type { LaunchpadOpenFocusTarget } from '@/types'

export const DEFAULT_LAUNCHPAD_OPEN_FOCUS_TARGET: LaunchpadOpenFocusTarget = 'launchpad'

export const isLaunchpadOpenFocusTarget = (
  value: unknown
): value is LaunchpadOpenFocusTarget => value === 'search' || value === 'launchpad'

export const normalizeLaunchpadOpenFocusTarget = (
  value: unknown
): LaunchpadOpenFocusTarget =>
  isLaunchpadOpenFocusTarget(value) ? value : DEFAULT_LAUNCHPAD_OPEN_FOCUS_TARGET
