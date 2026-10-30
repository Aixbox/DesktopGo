import type { CellReorderIntent } from './evasionPolicy'
import type { HoverZone } from '../model'

interface ReorderAlarmIntent {
  targetId: string
  targetIndex: number | null
  zone: HoverZone
}

interface MutableAlarmRef<T> {
  current: T | null
}

interface ArmPendingCellReorderAlarmParams<TTimer> {
  timerRef: MutableAlarmRef<TTimer>
  intentRef: MutableAlarmRef<ReorderAlarmIntent>
  intent: CellReorderIntent
  delayMs: number
  clearPending: () => void
  setTimer: (callback: () => void, delayMs: number) => TTimer
  onAlarm: (intent: ReorderAlarmIntent) => void
}

/** Keeps one cell alarm armed while later pointer moves update the live drag state. */
export const armPendingCellReorderAlarm = <TTimer>({
  timerRef,
  intentRef,
  intent,
  delayMs,
  clearPending,
  setTimer,
  onAlarm,
}: ArmPendingCellReorderAlarmParams<TTimer>): boolean => {
  const pendingIntent = intentRef.current
  const hasPendingCellAlarm =
    timerRef.current !== null && pendingIntent !== null && pendingIntent.targetIndex !== null
  if (hasPendingCellAlarm) return false

  if (timerRef.current !== null) clearPending()
  intentRef.current = intent
  timerRef.current = setTimer(
    () => {
      const latestIntent = intentRef.current
      timerRef.current = null
      intentRef.current = null
      if (latestIntent) onAlarm(latestIntent)
    },
    Math.max(0, delayMs)
  )
  return true
}
