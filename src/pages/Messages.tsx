import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { Edit, Search, Send } from 'lucide-react'
import { ChatList } from '@/components/ChatList'
import { ChatWindow } from '@/components/ChatWindow'
import { NewChatModal } from '@/components/NewChatModal'
import { NotesBar } from '@/components/NotesBar'
import { EmptyState } from '@/components/Common'
import { useAuth } from '@/contexts/AuthContext'
import { getConversations, getPresence, isPresenceLive, subscribeToInbox } from '@/services/messages'
import type { Conversation } from '@/types'

export function MessagesPage() {
  const { profile } = useAuth()
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())
  const [checkedId, setCheckedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    try {
      const list = await getConversations(profile.id)
      setConversations(list)
      setError(false)
      const presence = await getPresence(list.flatMap((c) => c.members.map((m) => m.id)))
      setOnlineIds(new Set(presence.filter(isPresenceLive).map((p) => p.user_id)))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  // Deep link / just-created conversation that isn't in the loaded list yet: refetch once before giving up.
  useEffect(() => {
    if (!conversationId || loading || conversations.some((c) => c.id === conversationId)) return
    void load().finally(() => setCheckedId(conversationId))
  }, [conversationId, loading])

  // New message / read receipt anywhere -> refresh previews, ordering and unread counts.
  useEffect(() => {
    if (!profile) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribeToInbox(profile.id, () => {
      clearTimeout(timer)
      timer = setTimeout(() => void load(), 250)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [profile, load])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => c.members.some((m) => m.username.toLowerCase().includes(q) || (m.full_name ?? '').toLowerCase().includes(q)))
  }, [conversations, filter])

  const active = conversations.find((c) => c.id === conversationId)
  const activeMissing = Boolean(conversationId) && !loading && !active && checkedId === conversationId

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] md:h-[100dvh]">
      <div className={clsx('flex w-full flex-col border-r border-paper-200 dark:border-ink-700 md:w-[380px] md:shrink-0', conversationId && 'hidden md:flex')}>
        <div className="flex items-center justify-between border-b border-paper-200 px-4 py-4 dark:border-ink-700">
          <h1 className="font-display text-lg font-semibold">{profile?.username}</h1>
          <button
            onClick={() => setNewChatOpen(true)}
            aria-label="New message"
            title="New message"
            className="rounded-full p-1.5 hover:bg-paper-100 dark:hover:bg-ink-800"
          >
            <Edit size={20} />
          </button>
        </div>
        <NotesBar />
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg bg-paper-100 px-3 py-2 dark:bg-ink-800">
            <Search size={16} className="text-ink-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search messages"
              aria-label="Search conversations"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="p-6 text-center text-sm text-ink-500">
              Couldn't load your messages.{' '}
              <button onClick={() => void load()} className="font-semibold text-signal-500">
                Retry
              </button>
            </div>
          ) : (
            <ChatList
              conversations={visible}
              loading={loading}
              meId={profile?.id}
              onlineIds={onlineIds}
              filtered={Boolean(filter.trim())}
              onStartNew={() => setNewChatOpen(true)}
            />
          )}
        </div>
      </div>

      <div className={clsx('min-w-0 flex-1', !conversationId && 'hidden md:flex md:items-center md:justify-center')}>
        {active ? (
          <ChatWindow key={active.id} conversation={active} onBack={() => navigate('/messages')} onActivity={load} />
        ) : activeMissing ? (
          <EmptyState icon={<Send size={28} />} title="Conversation not found" description="It may have been removed, or you don't have access to it." />
        ) : conversationId ? (
          <div className="skeleton h-full w-full" />
        ) : (
          !conversationId && (
            <div className="flex flex-col items-center">
              <EmptyState icon={<Send size={28} />} title="Your messages" description="Send private messages and photos to people you follow." />
              <button onClick={() => setNewChatOpen(true)} className="-mt-8 rounded-lg bg-signal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-signal-600">
                Send message
              </button>
            </div>
          )
        )}
      </div>

      <NewChatModal open={newChatOpen} onClose={() => setNewChatOpen(false)} />
    </div>
  )
}
