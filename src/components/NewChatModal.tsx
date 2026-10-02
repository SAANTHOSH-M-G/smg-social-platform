import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Modal, Spinner } from './Common'
import { Avatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { getSuggestedProfiles, searchProfiles } from '@/services/profiles'
import { getOrCreateDirectConversation } from '@/services/messages'
import type { Profile } from '@/types'

/** "New message" picker: search people, pick one, land in the (existing or new) 1:1 conversation. */
export function NewChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [suggested, setSuggested] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)
  const [startingWith, setStartingWith] = useState<string | null>(null)
  const debounced = useDebounce(query, 250)

  useEffect(() => {
    if (!open || !profile) return
    getSuggestedProfiles(profile.id, 8).then(setSuggested).catch(() => undefined)
  }, [open, profile])

  useEffect(() => {
    if (!open) return
    if (!debounced.trim()) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    searchProfiles(debounced)
      .then((r) => !cancelled && setResults(r.filter((p) => p.id !== profile?.id)))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setSearching(false))
    return () => {
      cancelled = true
    }
  }, [debounced, open, profile?.id])

  const close = () => {
    setQuery('')
    setResults([])
    onClose()
  }

  const start = async (other: Profile) => {
    if (!profile || startingWith) return
    setStartingWith(other.id)
    try {
      const id = await getOrCreateDirectConversation(profile.id, other.id)
      close()
      navigate(`/messages/${id}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not start conversation', 'error')
    } finally {
      setStartingWith(null)
    }
  }

  const list = query.trim() ? results : suggested

  return (
    <Modal open={open} onClose={close} title="New message" className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-none bg-white dark:bg-ink-900 sm:rounded-2xl">
      <div className="flex items-center gap-2 border-b border-paper-200 px-4 py-3 dark:border-ink-700">
        <Search size={18} className="text-ink-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          aria-label="Search people"
          className="flex-1 bg-transparent text-sm outline-none"
        />
        {searching && <Spinner size={14} />}
      </div>
      <div className="min-h-[220px] flex-1 overflow-y-auto p-2">
        {!query.trim() && list.length > 0 && <p className="px-3 py-2 text-xs font-semibold text-ink-500">Suggested</p>}
        {list.map((u) => (
          <button
            key={u.id}
            onClick={() => start(u)}
            disabled={Boolean(startingWith)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-paper-50 disabled:opacity-60 dark:hover:bg-ink-800"
          >
            <Avatar src={u.avatar_url} name={u.full_name || u.username} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{u.username}</p>
              <p className="truncate text-xs text-ink-500">{u.full_name}</p>
            </div>
            {startingWith === u.id && <Spinner size={16} />}
          </button>
        ))}
        {query.trim() && !searching && list.length === 0 && <p className="py-10 text-center text-sm text-ink-500">No people found for "{query}"</p>}
      </div>
    </Modal>
  )
}
