import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, X, Hash } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Avatar } from './Avatar'
import { useDebounce } from '@/hooks/useDebounce'
import { searchAll, getRecentSearches, pushRecentSearch, clearRecentSearches, removeRecentSearch, type HashtagResult } from '@/services/search'
import type { Profile } from '@/types'

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<Profile[]>([])
  const [hashtags, setHashtags] = useState<HashtagResult[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const debounced = useDebounce(query, 250)

  useEffect(() => {
    if (open) setRecent(getRecentSearches())
  }, [open])

  useEffect(() => {
    if (!debounced.trim()) {
      setUsers([])
      setHashtags([])
      return
    }
    searchAll(debounced).then((res) => {
      setUsers(res.users)
      setHashtags(res.hashtags)
    })
  }, [debounced])

  const handleSelect = (term: string) => {
    pushRecentSearch(term)
    setRecent(getRecentSearches())
    onClose()
    setQuery('')
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-sm flex-col bg-white dark:bg-ink-900 sm:h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-paper-200 p-4 dark:border-ink-700">
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-paper-100 px-3 py-2 dark:bg-ink-800">
            <Search size={18} className="text-ink-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="flex-1 bg-transparent text-sm outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')}>
                <X size={16} className="text-ink-400" />
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-sm font-medium">
            Cancel
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!query && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent</h3>
                {recent.length > 0 && (
                  <button
                    onClick={() => {
                      clearRecentSearches()
                      setRecent([])
                    }}
                    className="text-xs font-semibold text-signal-500"
                  >
                    Clear all
                  </button>
                )}
              </div>
              {recent.length === 0 && <p className="text-sm text-ink-500 dark:text-paper-200/60">No recent searches.</p>}
              <div className="space-y-1">
                {recent.map((term) => (
                  <div key={term} className="flex items-center justify-between rounded-lg px-1 py-2 hover:bg-paper-50 dark:hover:bg-ink-800">
                    <button onClick={() => setQuery(term)} className="flex-1 text-left text-sm">
                      {term}
                    </button>
                    <button
                      onClick={() => {
                        removeRecentSearch(term)
                        setRecent(getRecentSearches())
                      }}
                    >
                      <X size={14} className="text-ink-400" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {query && (
            <div className="space-y-4">
              {hashtags.length > 0 && (
                <div className="space-y-1">
                  {hashtags.map((h) => (
                    <Link
                      key={h.tag}
                      to={`/explore/tags/${h.tag}`}
                      onClick={() => handleSelect(`#${h.tag}`)}
                      className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-paper-50 dark:hover:bg-ink-800"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-100 dark:bg-ink-800">
                        <Hash size={18} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">#{h.tag}</p>
                        <p className="text-xs text-ink-500">{h.post_count} posts</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                {users.map((u) => (
                  <Link
                    key={u.id}
                    to={`/${u.username}`}
                    onClick={() => handleSelect(u.username)}
                    className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-paper-50 dark:hover:bg-ink-800"
                  >
                    <Avatar src={u.avatar_url} name={u.full_name || u.username} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{u.username}</p>
                      <p className="truncate text-xs text-ink-500">{u.full_name}</p>
                    </div>
                  </Link>
                ))}
              </div>
              {users.length === 0 && hashtags.length === 0 && (
                <p className="pt-6 text-center text-sm text-ink-500">No results for "{query}"</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
