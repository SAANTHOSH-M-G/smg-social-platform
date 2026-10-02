import { Link, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import type { Conversation } from '@/types'
import { timeAgo } from '@/utils/format'
import { EmptyState } from './Common'
import { Send } from 'lucide-react'

export function ChatList({ conversations, loading }: { conversations: Conversation[]; loading?: boolean }) {
  const { conversationId } = useParams()

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-12 w-12 rounded-full" />
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
    return <EmptyState icon={<Send size={26} />} title="No messages yet" description="Start a conversation from someone's profile." />
  }

  return (
    <div className="divide-y divide-paper-100 dark:divide-ink-800">
      {conversations.map((c) => {
        const other = c.members[0]
        const preview = c.last_message
          ? c.last_message.deleted_at
            ? 'Message deleted'
            : c.last_message.media_url
            ? 'Sent an attachment'
            : c.last_message.content
          : 'Say hello 👋'
        return (
          <Link
            key={c.id}
            to={`/messages/${c.id}`}
            className={clsx('flex items-center gap-3 px-4 py-3 hover:bg-paper-50 dark:hover:bg-ink-800', conversationId === c.id && 'bg-paper-50 dark:bg-ink-800')}
          >
            <Avatar src={other?.avatar_url} name={other?.full_name || other?.username || 'SMG'} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{other?.username ?? 'Conversation'}</p>
              <p className={clsx('truncate text-xs', c.unread_count ? 'font-semibold text-ink-900 dark:text-paper-50' : 'text-ink-500 dark:text-paper-200/60')}>
                {preview} · {timeAgo(c.last_message_at)}
              </p>
            </div>
            {Boolean(c.unread_count) && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-signal-500" />}
          </Link>
        )
      })}
    </div>
  )
}
