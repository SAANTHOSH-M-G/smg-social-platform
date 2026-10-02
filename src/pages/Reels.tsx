import { useCallback, useEffect, useRef, useState } from 'react'
import { ReelViewer, ReelsSkeleton } from '@/components/ReelViewer'
import { EmptyState } from '@/components/Common'
import { useAuth } from '@/contexts/AuthContext'
import { getReelsFeed } from '@/services/posts'
import type { Post } from '@/types'
import { Clapperboard } from 'lucide-react'

const PAGE_SIZE = 10

export function ReelsPage() {
  const { profile } = useAuth()
  const [reels, setReels] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const pageRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const doneRef = useRef(false)

  const loadFirst = useCallback(() => {
    if (!profile) return
    setLoading(true)
    setError(false)
    pageRef.current = 0
    doneRef.current = false
    getReelsFeed(profile.id, 0, PAGE_SIZE)
      .then((first) => {
        setReels(first)
        doneRef.current = first.length < PAGE_SIZE
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [profile])

  useEffect(() => loadFirst(), [loadFirst])

  const loadMore = useCallback(() => {
    if (!profile || loadingMoreRef.current || doneRef.current) return
    loadingMoreRef.current = true
    getReelsFeed(profile.id, pageRef.current + 1, PAGE_SIZE)
      .then((next) => {
        pageRef.current += 1
        doneRef.current = next.length < PAGE_SIZE
        setReels((prev) => [...prev, ...next.filter((n) => !prev.some((p) => p.id === n.id))])
      })
      .catch(() => undefined)
      .finally(() => {
        loadingMoreRef.current = false
      })
  }, [profile])

  const handleChange = useCallback((p: Post) => setReels((prev) => prev.map((x) => (x.id === p.id ? p : x))), [])

  if (loading) return <ReelsSkeleton />

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center text-sm text-ink-500">
        Couldn't load reels.
        <button onClick={loadFirst} className="font-semibold text-signal-500">
          Try again
        </button>
      </div>
    )
  }

  if (reels.length === 0) {
    return <EmptyState icon={<Clapperboard size={28} />} title="No reels yet" description="Videos posted to Reels will show up here." />
  }

  return <ReelViewer reels={reels} onChange={handleChange} onNearEnd={loadMore} />
}
