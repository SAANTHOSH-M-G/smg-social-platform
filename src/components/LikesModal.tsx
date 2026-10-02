import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { Modal } from './Common'
import { UserCard } from './UserCard'
import type { Profile } from '@/types'

/** "Likes" list: avatar, username and a follow button for each person. `load` runs each time it opens. */
export function LikesModal({ open, onClose, load, title = 'Likes' }: { open: boolean; onClose: () => void; load: () => Promise<Profile[]>; title?: string }) {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(false)
    load()
      .then((u) => !cancelled && setUsers(u))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title={title} className="w-full max-w-sm overflow-hidden rounded-none bg-white dark:bg-ink-900 sm:rounded-2xl">
      <div className="max-h-[60vh] min-h-[160px] overflow-y-auto p-2">
        {loading && (
          <div className="space-y-3 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-full" />
                <div className="skeleton h-3 w-32 rounded" />
              </div>
            ))}
          </div>
        )}
        {error && <p className="py-10 text-center text-sm text-ink-500">Couldn't load likes.</p>}
        {!loading && !error && users.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-ink-500">
            <Heart size={28} />
            <p className="text-sm">No likes yet.</p>
          </div>
        )}
        {!loading && users.map((u) => <UserCard key={u.id} profile={u} onNavigate={onClose} />)}
      </div>
    </Modal>
  )
}
