import type { AppLanguage } from '@/types'

export const LANGUAGE_CHANGED_EVENT = 'desktopgo://language-changed'

export interface LanguageChangedPayload {
  language: AppLanguage
}

let currentLanguage: AppLanguage = 'zh'

export function setActiveLanguage(language: AppLanguage) {
  currentLanguage = language
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'zh' || value === 'en'
}

export function getIntlLocale(language: AppLanguage = currentLanguage) {
  return language === 'zh' ? 'zh-CN' : 'en-US'
}

export function getCurrentLanguage() {
  return currentLanguage
}

export function syncDocumentLanguage(language: AppLanguage) {
  setActiveLanguage(language)
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
}
