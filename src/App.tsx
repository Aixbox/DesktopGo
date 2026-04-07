import { useEffect } from 'react'
import { Launchpad } from './components/Launchpad'
import { Settings } from './components/Settings'
import { ToastProvider } from './components/ui/toast'

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

  return <ToastProvider>{page === 'settings' ? <Settings /> : <Launchpad />}</ToastProvider>
}

export default App
