import { Suspense, lazy, useEffect } from 'react'
import { Launchpad } from './components/Launchpad'
import { ToastProvider } from './components/ui/toast'
import { I18nProvider } from './lib/i18n'

const Settings = lazy(() =>
  import('./components/Settings').then(module => ({ default: module.Settings }))
)

function App() {
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-app-context-menu-trigger="true"]')) {
        return
      }

      event.preventDefault()
    }

    document.addEventListener('contextmenu', handleContextMenu, true)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true)
    }
  }, [])

  return (
    <I18nProvider>
      <ToastProvider>
        {page === 'settings' ? (
          <Suspense fallback={<div className="settings-shell h-screen w-screen bg-background" />}>
            <Settings />
          </Suspense>
        ) : (
          <Launchpad />
        )}
      </ToastProvider>
    </I18nProvider>
  )
}

export default App
