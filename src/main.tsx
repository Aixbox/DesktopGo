import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { initTheme } from './lib/theme'
import { initWindowStyle } from './lib/windowStyle'
import { applySavedAppearance } from './lib/appearance'

void initTheme().catch(e => {
  console.error('Failed to initialize theme:', e)
})

void initWindowStyle().catch(e => {
  console.error('Failed to initialize window style:', e)
})

void applySavedAppearance().catch(e => {
  console.error('Failed to initialize appearance:', e)
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
