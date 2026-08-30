import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

interface UseAiOrganizeMenuDismissParams {
  historyExpanded: boolean
  presetsExpanded: boolean
  historyButtonRef: MutableRefObject<HTMLButtonElement | null>
  historyMenuRef: MutableRefObject<HTMLDivElement | null>
  presetsButtonRef: MutableRefObject<HTMLButtonElement | null>
  presetsMenuRef: MutableRefObject<HTMLDivElement | null>
  setHistoryExpanded: Dispatch<SetStateAction<boolean>>
  setPresetsExpanded: Dispatch<SetStateAction<boolean>>
}

// 点击弹层外部或按下 Esc 时收起会话历史与提示预设弹层。
export function useAiOrganizeMenuDismiss({
  historyExpanded,
  presetsExpanded,
  historyButtonRef,
  historyMenuRef,
  presetsButtonRef,
  presetsMenuRef,
  setHistoryExpanded,
  setPresetsExpanded,
}: UseAiOrganizeMenuDismissParams) {
  useEffect(() => {
    if (!historyExpanded && !presetsExpanded) return

    const isInside = (node: Node, elements: Array<HTMLElement | null>) =>
      elements.some(element => element?.contains(node))

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return

      if (
        historyExpanded &&
        !isInside(target, [historyButtonRef.current, historyMenuRef.current])
      ) {
        setHistoryExpanded(false)
      }

      if (
        presetsExpanded &&
        !isInside(target, [presetsButtonRef.current, presetsMenuRef.current])
      ) {
        setPresetsExpanded(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setHistoryExpanded(false)
      setPresetsExpanded(false)
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [
    historyButtonRef,
    historyExpanded,
    historyMenuRef,
    presetsButtonRef,
    presetsExpanded,
    presetsMenuRef,
    setHistoryExpanded,
    setPresetsExpanded,
  ])
}
