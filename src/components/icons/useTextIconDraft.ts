import { useMemo, useState } from 'react'
import { createTextIconDataUri, normalizeTextIconText } from '../../lib/textIcon'
import type { TextIconColor } from '../../lib/textIconColor'
import { DEFAULT_TEXT_ICON_TEXT, type AddIconDialogInitialState } from './addIconDialogState'

/** 管理文字图标的文本、前景色和裁剪预览，编辑内容时重新生成图片。 */
export function useTextIconDraft(initial: AddIconDialogInitialState) {
  const [iconText, setIconText] = useState(initial.iconText)
  const [iconTextColor, setIconTextColor] = useState(initial.iconTextColor)
  const [editedTextIconPreview, setEditedTextIconPreview] = useState(initial.editedTextIconPreview)
  const textIconPreview = useMemo(
    () =>
      editedTextIconPreview || createTextIconDataUri(iconText, 'none', 256, iconTextColor, false),
    [editedTextIconPreview, iconText, iconTextColor]
  )

  const changeText = (text: string) => {
    setEditedTextIconPreview('')
    setIconText(normalizeTextIconText(text))
  }
  const changeTextColor = (color: TextIconColor) => {
    setEditedTextIconPreview('')
    setIconTextColor(color)
  }
  const reset = () => {
    setIconText(DEFAULT_TEXT_ICON_TEXT)
    setIconTextColor('black')
    setEditedTextIconPreview('')
  }
  const restore = () => {
    setIconText(initial.iconText)
    setIconTextColor(initial.iconTextColor)
    setEditedTextIconPreview(initial.editedTextIconPreview)
  }

  return {
    iconText,
    iconTextColor,
    textIconPreview,
    setIconText,
    setEditedTextIconPreview,
    changeText,
    changeTextColor,
    reset,
    restore,
  }
}
