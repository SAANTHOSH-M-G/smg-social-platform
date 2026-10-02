import { Link, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { Send, SearchX } from 'lucide-react'
import { Avatar } from './Avatar'
import type { Conversation } from '@/types'
import { timeAgo } from '@/utils/format'
import { EmptyState } from './Common'

function previewOf(c: Conversation, meId?: string) {
  const m = c.last_message
  if (!m) return 'Say hello 👋'
  const prefix = m.sender_id === meId ? 'You: ' : ''
  if (m.deleted_at) return `${prefix}Message deleted`
  if (m.view_once) return `${prefix}Sent a view-once photo`
  if (m.media_url) return `${prefix}${m.media_type === 'video' ? 'Sent a video' : 'Sent a photo'}`
  return `${prefix}${m.content}`
}

export function ChatList({
  conversations,
  loading,
  meId,
  onlineIds,
  filtered,
  onStartNew,
}: {
  conversations: Conversation[]
  loading?: boolean
  meId?: string
  onlineIds?: Set<string>
  /** True when `conversations` is the result of a search filter (changes the empty state). */
  filtered?: boolean
  onStartNew?: () => void
}) {
  const { conversationId } = useParams()

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-14 w-14 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-2.5 w-36 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (conversations.length === 0) {
    return filtered ? (
      <EmptyState icon={<SearchX size={26} />} title="No chats found" description="Try a different name, or start a new message with the pencil icon." />
    ) : (
      <div className="flex flex-col items-center">
        <EmptyState icon={<Send size={26} />} title="No messages yet" description="Send a message to start a conversation." />
        {onStartNew && (
          <button onClick={onStartNew} className="-mt-8 rounded-lg bg-signal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-signal-600">
            Send message
          </button>
        )}
      </div>
    )
  }

  return (
    <ul className="divide-y divide-paper-100 dark:divide-ink-800">
      {conversations.map((c) => {
        const other = c.members[0]
        const unread = c.unread_count ?? 0
        const online = other ? onlineIds?.has(other.id) : false
        return (
          <li key={c.id}>
            <Link
              to={`/messages/${c.id}`}
              aria-current={conversationId === c.id ? 'page' : undefined}
              className={clsx(
                'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-50 dark:hover:bg-ink-800',
                conversationId === c.id && 'bg-paper-50 dark:bg-ink-800'
              )}
            >
              <div className="relative">
                <Avatar src={other?.avatar_url} name={other?.full_name || other?.username || 'SMG'} size="lg" />
                {online && <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-ink-950" aria-label="Active now" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className={clsx('truncate text-sm', unread ? 'font-bold' : 'font-semibold')}>{other?.username ?? 'Conversation'}</p>
                <p className={clsx('truncate text-xs', unread ? 'font-semibold text-ink-900 dark:text-paper-50' : 'text-ink-500 dark:text-paper-200/60')}>
                  {previewOf(c, meId)} · {timeAgo(c.last_message?.created_at ?? c.last_message_at)}
                </p>
              </div>
              {unread > 0 && (
                <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-signal-500 px-1.5 text-[11px] font-bold text-white" aria-label={`${unread} unread`}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
