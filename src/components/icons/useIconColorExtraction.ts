import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { loadIconColor } from '../../lib/iconColorSampling'
import { isCustomIconColor, type IconColorId } from '../../lib/iconColors'

interface ExtractionOptions {
  source: string
  selectionKey: string
  value: IconColorId
  disabled: boolean
  onChange: (color: IconColorId) => void
}

interface ExtractionState {
  session: Omit<ExtractionOptions, 'onChange'>
  pending: boolean
  failed: boolean
}

/** 手动取色：只允许仍然匹配当前图片、选项和背景色的请求提交结果。 */
export function useIconColorExtraction(options: ExtractionOptions) {
  const { source, selectionKey, value, disabled } = options
  const session = useMemo(
    () => ({ source, selectionKey, value, disabled }),
    [source, selectionKey, value, disabled]
  )
  const latest = useRef({ session, onChange: options.onChange })
  const sequence = useRef(0)
  const [state, setState] = useState<ExtractionState | null>(null)
  useLayoutEffect(() => {
    latest.current = { session, onChange: options.onChange }
  })
  useLayoutEffect(
    () => () => {
      sequence.current += 1
    },
    [session]
  )

  const extract = async () => {
    const snapshot = latest.current.session
    if (snapshot.disabled || !snapshot.source) return
    const request = ++sequence.current
    setState({ session: snapshot, pending: true, failed: false })
    const color = await loadIconColor(snapshot.source).catch(() => null)
    if (request !== sequence.current || latest.current.session !== snapshot) return
    const failed = !isCustomIconColor(color)
    setState({ session: snapshot, pending: false, failed })
    if (!failed) latest.current.onChange(color)
  }

  const active = state?.session === session && !disabled
  return {
    extract,
    pending: Boolean(active && state.pending),
    failed: Boolean(active && state.failed),
  }
}
