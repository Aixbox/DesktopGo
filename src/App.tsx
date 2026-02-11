import { Launchpad } from './components/Launchpad'
import { Settings } from './components/Settings'

function App() {
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')

  return (
    <>
      {page === 'settings' ? <Settings /> : <Launchpad />}
    </>
  )
}

export default App
