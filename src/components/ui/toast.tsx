/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'info' | 'success' | 'error'

type ToastItem = {
  id: string
  key?: string
  title?: string
  message: string
  tone: ToastTone
  duration: number
}

type ShowToastOptions = {
  key?: string
  title?: string
  message: string
  tone?: ToastTone
  duration?: number
}

type ToastOptionsWithoutMessage = Omit<ShowToastOptions, 'message' | 'tone'>

type ToastContextValue = {
  showToast: (options: ShowToastOptions) => string
  dismissToast: (id: string) => void
  info: (message: string, options?: ToastOptionsWithoutMessage) => string
  success: (message: string, options?: ToastOptionsWithoutMessage) => string
  error: (message: string, options?: ToastOptionsWithoutMessage) => string
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_TOAST_DURATION: Record<ToastTone, number> = {
  info: 2400,
  success: 2600,
  error: 4200,
}

const MAX_VISIBLE_TOASTS = 4

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(calc(100vw-2rem),24rem)] flex-col gap-2 sm:bottom-5 sm:right-5">
      {toasts.map(toast => {
        const icon =
          toast.tone === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
          ) : toast.tone === 'error' ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-300" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
          )

        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto rounded-2xl border bg-card/95 px-4 py-3 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/85',
              toast.tone === 'success' && 'border-emerald-500/25',
              toast.tone === 'error' && 'border-red-500/25',
              toast.tone === 'info' && 'border-blue-500/20'
            )}
          >
            <div className="flex items-start gap-3">
              {icon}
              <div className="min-w-0 flex-1 space-y-1">
                {toast.title ? (
                  <p className="text-sm font-medium text-foreground">{toast.title}</p>
                ) : null}
                <p className="break-words text-sm leading-5 text-foreground/85">{toast.message}</p>
              </div>
              <button
                type="button"
                aria-label="关闭提示"
                onClick={() => onDismiss(toast.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastsRef = useRef<ToastItem[]>([])
  const timersRef = useRef(new Map<string, number>())

  useEffect(() => {
    toastsRef.current = toasts
  }, [toasts])

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }

    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const scheduleDismiss = useCallback(
    (id: string, duration: number) => {
      const previousTimer = timersRef.current.get(id)
      if (previousTimer) {
        window.clearTimeout(previousTimer)
      }

      const timeoutId = window.setTimeout(() => {
        dismissToast(id)
      }, duration)

      timersRef.current.set(id, timeoutId)
    },
    [dismissToast]
  )

  const showToast = useCallback(
    (options: ShowToastOptions) => {
      const tone = options.tone ?? 'info'
      const duration = options.duration ?? DEFAULT_TOAST_DURATION[tone]
      const existingToast = options.key
        ? toastsRef.current.find(toast => toast.key === options.key)
        : undefined
      const nextId = existingToast?.id ?? createToastId()
      const nextToast: ToastItem = {
        id: nextId,
        key: options.key,
        title: options.title,
        message: options.message,
        tone,
        duration,
      }

      setToasts(prev => {
        const nextToasts = [...prev.filter(toast => toast.id !== nextId), nextToast]
        return nextToasts.slice(-MAX_VISIBLE_TOASTS)
      })
      scheduleDismiss(nextId, duration)

      return nextId
    },
    [scheduleDismiss]
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timeoutId of timers.values()) {
        window.clearTimeout(timeoutId)
      }
      timers.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      dismissToast,
      info: (message, options) => showToast({ ...options, message, tone: 'info' }),
      success: (message, options) => showToast({ ...options, message, tone: 'success' }),
      error: (message, options) => showToast({ ...options, message, tone: 'error' }),
    }),
    [dismissToast, showToast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }

  return context
}
