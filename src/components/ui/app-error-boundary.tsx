import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { Button } from './button'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('DesktopGo render failed:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        role="alert"
        className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground"
      >
        <TriangleAlert className="h-8 w-8 text-amber-600 dark:text-amber-300" />
        <div className="max-w-md space-y-1.5">
          <h1 className="text-base font-semibold">{translate('界面暂时无法显示')}</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {translate('重新加载 DesktopGo 后通常可以恢复，当前数据不会被修改。')}
          </p>
        </div>
        <Button type="button" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
          {translate('重新加载')}
        </Button>
      </div>
    )
  }
}
