import { useCallback, useEffect, useState } from 'react'
import { ReelViewer } from '@/components/ReelViewer'
import { EmptyState } from '@/components/Common'
import { useAuth } from '@/contexts/AuthContext'
import { getReelsFeed } from '@/services/posts'
import type { Post } from '@/types'
import { Clapperboard } from 'lucide-react'

export function ReelsPage() {
  const { profile } = useAuth()
  const [reels, setReels] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!profile) return
    setLoading(true)
    getReelsFeed(profile.id)
      .then(setReels)
      .finally(() => setLoading(false))
  }, [profile])

  useEffect(() => load(), [load])

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center md:h-screen">
        <div className="skeleton h-full w-full max-w-[420px] rounded-none sm:rounded-xl" />
      </div>
    )
  }

  if (reels.length === 0) {
    return <EmptyState icon={<Clapperboard size={28} />} title="No reels yet" description="Videos posted to Reels will show up here." />
  }

  return (
    <div className="flex justify-center bg-black md:bg-transparent">
      <ReelViewer reels={reels} onChange={(p) => setReels((prev) => prev.map((x) => (x.id === p.id ? p : x)))} />
    </div>
  )
}
