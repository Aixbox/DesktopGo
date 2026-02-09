import { invoke } from '@tauri-apps/api/core'

function App() {
  const handleClose = () => {
    invoke('toggle_window')
  }

  return (
    <div className="w-screen h-screen bg-black/80 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">DesktopGo</h1>
        <p className="text-white mb-8">按 Ctrl+Space 切换显示/隐藏</p>
        <button
          onClick={handleClose}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          关闭启动台
        </button>
      </div>
    </div>
  )
}

export default App
