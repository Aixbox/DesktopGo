import type { MutableRefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { translate } from '@/lib/i18n'
import type { AiOrganizeSession } from '@/lib/aiOrganizeSessions'
import { formatSessionTime } from './aiOrganizePanelModel'

interface AiOrganizeHistoryMenuProps {
  expanded: boolean
  menuRef: MutableRefObject<HTMLDivElement | null>
  prefersReducedMotion: boolean | null
  sessionsLoaded: boolean
  sessions: AiOrganizeSession[]
  activeSessionId: string | null
  isBusy: boolean
  onNewSession: () => void
  onSelectSession: (session: AiOrganizeSession) => void
  onDeleteSession: (sessionId: string) => void | Promise<void>
}

export function AiOrganizeHistoryMenu({
  expanded,
  menuRef,
  prefersReducedMotion,
  sessionsLoaded,
  sessions,
  activeSessionId,
  isBusy,
  onNewSession,
  onSelectSession,
  onDeleteSession,
}: AiOrganizeHistoryMenuProps) {
  return (
    <AnimatePresence initial={false}>
      {expanded ? (
        <motion.div
          ref={menuRef}
          initial={prefersReducedMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-3 top-[calc(100%-0.25rem)] z-20 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border/85 bg-background shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
            <span className="text-xs font-medium text-foreground">{translate('会话历史')}</span>
            <button
              type="button"
              onClick={onNewSession}
              disabled={isBusy}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border/80 px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {translate('新对话')}
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {!sessionsLoaded ? (
              <div className="flex h-12 items-center gap-2 px-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {translate('正在加载会话...')}
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                {translate('还没有保存的整理对话。')}
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map(session => {
                  const isActiveSession = session.id === activeSessionId
                  return (
                    <div
                      key={session.id}
                      className={`group flex items-stretch rounded-md transition-colors ${
                        isActiveSession
                          ? 'bg-blue-500/10 text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSession(session)}
                        disabled={isBusy}
                        className="min-w-0 flex-1 rounded-l-md px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="truncate text-xs font-medium">{session.title}</div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                          <span>{formatSessionTime(session.updatedAt)}</span>
                          <span>
                            {translate('{count} 版', { count: session.snapshots.length })}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteSession(session.id)}
                        disabled={isBusy}
                        aria-label={translate('删除会话')}
                        title={translate('删除会话')}
                        className="flex w-9 shrink-0 items-center justify-center rounded-r-md text-muted-foreground opacity-70 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100 dark:hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
