import { useEffect, useState } from 'react'
import { Link2, Check } from 'lucide-react'
import { Modal, Spinner } from './Common'
import { Avatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { getConversations, getOrCreateDirectConversation, sendTextMessage } from '@/services/messages'
import { searchProfiles } from '@/services/profiles'
import type { Conversation, Post, Profile } from '@/types'

export function ShareModal({ post, open, onClose }: { post: Post; open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [sentTo, setSentTo] = useState<Set<string>>(new Set())
  const [sendingTo, setSendingTo] = useState<string | null>(null)
  const debouncedQuery = useDebounce(query, 250)

  const shareUrl = `${window.location.origin}${post.is_reel ? '/reel/' : '/p/'}${post.id}`

  useEffect(() => {
    if (!open || !profile) return
    setLoading(true)
    getConversations(profile.id)
      .then(setConversations)
      .finally(() => setLoading(false))
  }, [open, profile])

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([])
      return
    }
    searchProfiles(debouncedQuery).then((results) => setSearchResults(results.filter((r) => r.id !== profile?.id)))
  }, [debouncedQuery, profile?.id])

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      showToast('Link copied to clipboard', 'success')
    } catch {
      showToast(shareUrl, 'default')
    }
  }

  const sendToConversation = async (conversationId: string, label: string) => {
    if (!profile) return
    setSendingTo(conversationId)
    try {
      await sendTextMessage(conversationId, profile.id, `${post.is_reel ? 'Check out this reel' : 'Check out this post'}: ${shareUrl}`)
      setSentTo((prev) => new Set(prev).add(conversationId))
      showToast(`Sent to ${label}`, 'success')
    } catch {
      showToast('Could not send', 'error')
    } finally {
      setSendingTo(null)
    }
  }

  const handleSendToUser = async (user: Profile) => {
    if (!profile) return
    setSendingTo(user.id)
    try {
      const conversationId = await getOrCreateDirectConversation(profile.id, user.id)
      await sendToConversation(conversationId, user.username)
    } finally {
      setSendingTo(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share" className="w-full max-w-sm overflow-hidden rounded-none bg-white dark:bg-ink-900 sm:rounded-2xl">
      <div className="p-4">
        <button
          onClick={handleCopyLink}
          className="mb-4 flex w-full items-center gap-3 rounded-lg border border-paper-200 p-3 text-left text-sm font-medium hover:bg-paper-50 dark:border-ink-700 dark:hover:bg-ink-800"
        >
          <Link2 size={18} /> Copy link
        </button>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people to send to"
          className="mb-3 w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {query.trim() ? (
            searchResults.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-1 py-2">
                <Avatar src={u.avatar_url} name={u.full_name || u.username} size="sm" />
                <span className="flex-1 truncate text-sm font-medium">{u.username}</span>
                <ShareSendButton isSent={false} isSending={sendingTo === u.id} onClick={() => handleSendToUser(u)} />
              </div>
            ))
          ) : loading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-9 w-9 rounded-full" />
                  <div className="skeleton h-3 w-28 rounded" />
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">Search for someone to send this to.</p>
          ) : (
            conversations.map((c) => {
              const other = c.members[0]
              if (!other) return null
              return (
                <div key={c.id} className="flex items-center gap-3 px-1 py-2">
                  <Avatar src={other.avatar_url} name={other.full_name || other.username} size="sm" />
                  <span className="flex-1 truncate text-sm font-medium">{other.username}</span>
                  <ShareSendButton
                    isSent={sentTo.has(c.id)}
                    isSending={sendingTo === c.id}
                    onClick={() => sendToConversation(c.id, other.username)}
                  />
                </div>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}

function ShareSendButton({ isSent, isSending, onClick }: { isSent: boolean; isSending: boolean; onClick: () => void }) {
  if (isSent) {
    return (
      <span className="flex items-center gap-1 rounded-lg bg-paper-100 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:bg-ink-800">
        <Check size={14} /> Sent
      </span>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={isSending}
      className="rounded-lg bg-signal-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-signal-600 disabled:opacity-60"
    >
      {isSending ? <Spinner size={12} /> : 'Send'}
    </button>
  )
}
