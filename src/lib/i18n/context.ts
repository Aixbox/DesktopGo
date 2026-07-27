import { createContext, useContext } from 'react'
import type { AppLanguage } from '@/types'

export type TranslationParams = Record<string, string | number | null | undefined>

export interface I18nContextValue {
  language: AppLanguage
  locale: string
  ready: boolean
  setLanguage: (language: AppLanguage) => Promise<void>
  t: (message: string, params?: TranslationParams) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }

  return context
}
