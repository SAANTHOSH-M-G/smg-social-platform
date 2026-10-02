import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, MessageCircle, UserPlus, AtSign, Send, Check, X, ImageOff } from 'lucide-react'
import { Avatar } from './Avatar'
import { EmptyState } from './Common'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { AppNotification } from '@/types'
import { getNotifications, markAllRead } from '@/services/notifications'
import { getPendingFollowRequests, respondToFollowRequest } from '@/services/follows'
import type { FollowRequest } from '@/types'
import { timeAgo } from '@/utils/format'

const ICONS: Record<AppNotification['type'], JSX.Element> = {
  like: <Heart size={14} className="fill-white text-white" />,
  comment: <MessageCircle size={14} className="fill-white text-white" />,
  comment_reply: <MessageCircle size={14} className="fill-white text-white" />,
  follow: <UserPlus size={14} className="text-white" />,
  follow_request: <UserPlus size={14} className="text-white" />,
  follow_accepted: <UserPlus size={14} className="text-white" />,
  mention: <AtSign size={14} className="text-white" />,
  message: <Send size={14} className="text-white" />,
}

const COLORS: Record<AppNotification['type'], string> = {
  like: 'bg-ember-500',
  comment: 'bg-signal-500',
  comment_reply: 'bg-signal-500',
  follow: 'bg-signal-500',
  follow_request: 'bg-signal-500',
  follow_accepted: 'bg-emerald-500',
  mention: 'bg-signal-500',
  message: 'bg-signal-400',
}

function describeNotification(n: AppNotification) {
  const contentWord = n.post?.is_reel ? 'reel' : 'post'
  if (n.story_id && n.type === 'like') return 'liked your story.'
  switch (n.type) {
    case 'like':
      return `liked your ${contentWord}.`
    case 'comment':
      return `commented on your ${contentWord}.`
    case 'comment_reply':
      return 'replied to your comment.'
    case 'follow':
      return 'started following you.'
    case 'follow_accepted':
      return 'accepted your follow request.'
    case 'mention':
      return n.post ? `tagged you in a ${contentWord}.` : 'mentioned you.'
    case 'message':
      return 'sent you a message.'
    default:
      return ''
  }
}

/** Where clicking a notification should actually take you. */
function notificationHref(n: AppNotification): string | null {
  if (n.post) return n.post.is_reel ? `/reel/${n.post.id}` : `/p/${n.post.id}`
  if (n.story) return `/story/${n.story.id}`
  if (n.type === 'follow' || n.type === 'follow_accepted') return n.actor ? `/${n.actor.username}` : null
  if (n.type === 'message') return '/messages'
  return null
}

function NotificationThumbnail({ post, story }: { post?: AppNotification['post']; story?: AppNotification['story'] }) {
  const [failed, setFailed] = useState(false)
  const media = post?.media?.[0]
  const src = story ? story.media_url : (post?.is_reel && post.cover_url) || media?.media_url

  if (!src || failed) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-paper-100 text-ink-400 dark:bg-ink-800">
        <ImageOff size={16} />
      </div>
    )
  }

  return <img src={src} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" onError={() => setFailed(true)} />
}

export function NotificationPanel() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [requests, setRequests] = useState<FollowRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    Promise.all([getNotifications(profile.id), getPendingFollowRequests(profile.id)]).then(([n, r]) => {
      setNotifications(n)
      setRequests(r)
      setLoading(false)
      void markAllRead(profile.id)
    })
  }, [profile])

  const handleRequest = async (requestId: string, accept: boolean) => {
    try {
      await respondToFollowRequest(requestId, accept)
      setRequests((prev) => prev.filter((r) => r.id !== requestId))
      showToast(accept ? 'Request accepted' : 'Request declined', 'success')
    } catch {
      showToast('Could not update request', 'error')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 rounded-full" />
            <div className="skeleton h-3 w-2/3 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (notifications.length === 0 && requests.length === 0) {
    return <EmptyState icon={<Heart size={28} />} title="No notifications yet" description="Likes, comments and follows will show up here." />
  }

  return (
    <div className="divide-y divide-paper-100 dark:divide-ink-800">
      {requests.length > 0 && (
        <div className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink-500">Follow requests</h3>
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <Avatar src={r.requester?.avatar_url} name={r.requester?.full_name || r.requester?.username || ''} size="md" />
                <div className="min-w-0 flex-1 text-sm">
                  <Link to={`/${r.requester?.username}`} className="font-semibold hover:underline">
                    {r.requester?.username}
                  </Link>{' '}
                  wants to follow you.
                </div>
                <button onClick={() => handleRequest(r.id, true)} className="rounded-lg bg-signal-500 p-2 text-white hover:bg-signal-600">
                  <Check size={16} />
                </button>
                <button onClick={() => handleRequest(r.id, false)} className="rounded-lg bg-paper-100 p-2 hover:bg-paper-200 dark:bg-ink-700">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {notifications.map((n) => {
        const href = notificationHref(n)
        const row = (
          <div className="flex items-center gap-3 px-4 py-3 hover:bg-paper-50 dark:hover:bg-ink-800">
            <div className="relative">
              <Avatar src={n.actor?.avatar_url} name={n.actor?.full_name || n.actor?.username || 'SMG'} size="md" />
              <span className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white dark:ring-ink-950 ${COLORS[n.type]}`}>
                {ICONS[n.type]}
              </span>
            </div>
            <p className="flex-1 text-sm">
              <Link
                to={`/${n.actor?.username}`}
                onClick={(e) => e.stopPropagation()}
                className="mr-1 font-semibold hover:underline"
              >
                {n.actor?.username}
              </Link>
              {describeNotification(n)} <span className="text-ink-500">{timeAgo(n.created_at)}</span>
            </p>
            {(n.post || n.story) && <NotificationThumbnail post={n.post} story={n.story} />}
          </div>
        )
        return href ? (
          <Link key={n.id} to={href} className="block">
            {row}
          </Link>
        ) : (
          <div key={n.id}>{row}</div>
        )
      })}
    </div>
  )
}
