import { emit, listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppLanguage } from '@/types'
import { translate } from '@/lib/i18n'
import { getSetting, setSetting } from '../settingsStore'
import { I18nContext, type I18nContextValue } from './context'
import {
  getIntlLocale,
  isAppLanguage,
  LANGUAGE_CHANGED_EVENT,
  setActiveLanguage,
  syncDocumentLanguage,
  type LanguageChangedPayload,
} from './language'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('zh')
  const [ready, setReady] = useState(false)

  const applyLanguageState = useCallback((nextLanguage: AppLanguage) => {
    setActiveLanguage(nextLanguage)
    setLanguageState(current => (current === nextLanguage ? current : nextLanguage))
  }, [])

  setActiveLanguage(language)

  useEffect(() => {
    let disposed = false

    void getSetting('language')
      .then(savedLanguage => {
        if (disposed) return
        applyLanguageState(savedLanguage)
      })
      .catch(error => {
        console.error('Failed to load app language:', error)
      })
      .finally(() => {
        if (!disposed) {
          setReady(true)
        }
      })

    return () => {
      disposed = true
    }
  }, [applyLanguageState])

  useEffect(() => {
    let disposed = false
    let detachLanguageListener: (() => void) | null = null

    const syncSavedLanguage = async () => {
      try {
        const savedLanguage = await getSetting('language')
        if (!disposed) {
          applyLanguageState(savedLanguage)
        }
      } catch (error) {
        console.error('Failed to sync app language:', error)
      }
    }

    void listen<LanguageChangedPayload>(LANGUAGE_CHANGED_EVENT, event => {
      if (disposed || !isAppLanguage(event.payload?.language)) {
        return
      }

      applyLanguageState(event.payload.language)
    })
      .then(unlisten => {
        if (disposed) {
          unlisten()
          return
        }

        detachLanguageListener = unlisten
      })
      .catch(error => {
        console.error('Failed to listen for language changes:', error)
      })

    const handleFocus = () => {
      void syncSavedLanguage()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      disposed = true
      window.removeEventListener('focus', handleFocus)
      detachLanguageListener?.()
    }
  }, [applyLanguageState])

  useEffect(() => {
    syncDocumentLanguage(language)
  }, [language])

  const setLanguage = useCallback(
    async (nextLanguage: AppLanguage) => {
      applyLanguageState(nextLanguage)
      try {
        await setSetting('language', nextLanguage)
      } catch (error) {
        console.error('Failed to persist app language:', error)
      }

      try {
        await emit<LanguageChangedPayload>(LANGUAGE_CHANGED_EVENT, { language: nextLanguage })
      } catch (error) {
        console.error('Failed to broadcast app language change:', error)
      }
    },
    [applyLanguageState]
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: getIntlLocale(language),
      ready,
      setLanguage,
      t: (message, params) => translate(message, params, language),
    }),
    [language, ready, setLanguage]
  )

  return <I18nContext.Provider value={value}>{ready ? children : null}</I18nContext.Provider>
}
