import { Suspense, lazy, useEffect } from 'react'
import { Launchpad } from './components/Launchpad'
import { UpdateAvailableToast } from './components/update/UpdateAvailableToast'
import { ToastProvider } from './components/ui/toast'
import { AppErrorBoundary } from './components/ui/app-error-boundary'
import { I18nProvider } from './lib/i18n/I18nProvider'

const Settings = lazy(() =>
  import('./components/Settings').then(module => ({ default: module.Settings }))
)

const WallpaperViewer = lazy(() =>
  import('./components/viewer/WallpaperViewer').then(module => ({
    default: module.WallpaperViewer,
  }))
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
        <AppErrorBoundary>
          {page === 'wallpaper-viewer' ? (
            <Suspense fallback={<div className="h-full w-full bg-black" />}>
              <WallpaperViewer />
            </Suspense>
          ) : page === 'settings' ? (
            <Suspense fallback={<div className="settings-shell h-full w-full bg-background" />}>
              <Settings />
            </Suspense>
          ) : (
            <>
              <Launchpad />
              <UpdateAvailableToast />
            </>
          )}
        </AppErrorBoundary>
      </ToastProvider>
    </I18nProvider>
  )
}

export default App
