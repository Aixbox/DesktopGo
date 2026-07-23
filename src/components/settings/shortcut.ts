import type { KeyboardEvent } from 'react'
import { translate } from '@/lib/i18n'

const SHORTCUT_MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
])

const SHORTCUT_KEY_DISPLAY_LABELS: Record<string, string> = {
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  CapsLock: 'Caps Lock',
  Comma: ',',
  ContextMenu: 'Menu',
  Delete: 'Delete',
  Enter: 'Enter',
  Equal: '=',
  Escape: 'Esc',
  Home: 'Home',
  Insert: 'Insert',
  Minus: '-',
  PageDown: 'Page Down',
  PageUp: 'Page Up',
  Period: '.',
  PrintScreen: 'Print Screen',
  Quote: "'",
  ScrollLock: 'Scroll Lock',
  Semicolon: ';',
  Slash: '/',
  Space: 'Space',
  Tab: 'Tab',
}

function formatShortcutToken(token: string) {
  const normalizedToken = token.trim()
  const lowerToken = normalizedToken.toLowerCase()

  switch (lowerToken) {
    case 'control':
    case 'ctrl':
      return 'Ctrl'
    case 'alt':
    case 'option':
      return 'Alt'
    case 'shift':
      return 'Shift'
    case 'super':
    case 'command':
    case 'cmd':
      return 'Super'
    case 'commandorcontrol':
    case 'commandorctrl':
    case 'cmdorctrl':
    case 'cmdorcontrol':
      return 'Ctrl'
    default:
      break
  }

  const mappedLabel = SHORTCUT_KEY_DISPLAY_LABELS[normalizedToken]
  if (mappedLabel) return mappedLabel

  if (/^key[a-z]$/i.test(normalizedToken)) return normalizedToken.slice(3).toUpperCase()
  if (/^digit[0-9]$/i.test(normalizedToken)) return normalizedToken.slice(5)
  if (/^numpad[0-9]$/i.test(normalizedToken)) return `Num ${normalizedToken.slice(6)}`
  if (/^f[0-9]{1,2}$/i.test(normalizedToken)) return normalizedToken.toUpperCase()

  return normalizedToken.charAt(0).toUpperCase() + normalizedToken.slice(1)
}

export function formatShortcutForDisplay(shortcut: string) {
  const tokens = shortcut
    .split('+')
    .map(token => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) return translate('未设置')
  return tokens.map(formatShortcutToken).join(' + ')
}

export function formatShortcutForInput(shortcut: string) {
  const tokens = shortcut
    .split('+')
    .map(token => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) return ''
  return tokens.map(formatShortcutToken).join('+')
}

export function normalizeShortcutDraftText(shortcut: string) {
  return shortcut
    .trim()
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, ' ')
}

export function buildShortcutFromKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  const hasModifier = event.ctrlKey || event.altKey || event.shiftKey

  if (!hasModifier) {
    return {
      error: translate('快捷键至少需要一个修饰键，例如 Ctrl + Space。'),
    }
  }

  if (!event.code || event.code === 'Unidentified' || SHORTCUT_MODIFIER_CODES.has(event.code)) {
    return {
      error: translate('请在按住修饰键后，再按一个主键，例如 Space、K 或 F1。'),
    }
  }

  const tokens: string[] = []
  if (event.ctrlKey) tokens.push('Ctrl')
  if (event.altKey) tokens.push('Alt')
  if (event.shiftKey) tokens.push('Shift')
  tokens.push(event.code)

  return {
    shortcut: tokens.join('+'),
  }
}
