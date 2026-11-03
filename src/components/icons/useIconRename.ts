import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useIconStore } from '../../stores/iconStore'
import { deriveIconEntryName, getPathLeaf } from '../../lib/iconManager'
import { translate } from '../../lib/i18n'
import { useToast } from '../ui/toast'
import type { DesktopIcon } from '../../types'

/** Windows Shell rename edits the file entry, independently of a display alias. */
export function useIconRename(icon: DesktopIcon) {
  const clearTrigger = useIconStore(state => state.clearRenameTrigger)
  const renameIconSource = useIconStore(state => state.renameIconSource)
  const toast = useToast()
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const editorActive = useRef(false)
  const submitting = useRef(false)
  const sourcePath = icon.shell_path || icon.path
  const sourceName =
    icon.item_type === 'folder' || sourcePath !== icon.path
      ? getPathLeaf(sourcePath)
      : deriveIconEntryName(sourcePath)

  useEffect(
    () =>
      useIconStore.subscribe((state, previous) => {
        if (
          state.renameTriggerPath !== icon.path ||
          state.renameTriggerPath === previous.renameTriggerPath
        )
          return
        setDraftName(sourceName)
        setIsRenaming(true)
        editorActive.current = true
        clearTrigger()
      }),
    [icon.path, sourceName, clearTrigger]
  )

  useEffect(() => {
    if (isRenaming && !isSaving) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming, isSaving])

  const cancelRename = () => {
    if (submitting.current) return
    editorActive.current = false
    setIsRenaming(false)
  }

  const commitRename = async () => {
    if (!editorActive.current || submitting.current) return
    const name = draftName.trim()
    if (!name || name === sourceName) {
      cancelRename()
      return
    }
    submitting.current = true
    setIsSaving(true)
    try {
      await renameIconSource(icon, name)
      editorActive.current = false
      setIsRenaming(false)
    } catch (error) {
      toast.error(String(error), { title: translate('重命名失败') })
    } finally {
      submitting.current = false
      setIsSaving(false)
    }
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      if (event.key === 'Enter') void commitRename()
      else cancelRename()
    }
  }

  return {
    isRenaming,
    draftName,
    setDraftName,
    isSaving,
    inputRef,
    commitRename,
    handleInputKeyDown,
  }
}
