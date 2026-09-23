import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { initTheme } from './lib/theme'
import { initWindowStyle } from './lib/windowStyle'
import { applySavedAppearance } from './lib/appearance'
import { attachConsole } from '@tauri-apps/plugin-log'

// 前端 console.* 转发进 Rust 侧文件日志（%LOCALAPPDATA%\com.aixbox.desktopgo\logs\），
// 安装版无 devtools 时也能留下现场。窗口销毁后 invoke 会失败，静默忽略。
attachConsole().catch(() => undefined)

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
