import { useCallback, useEffect, useState } from 'react'
import { ExploreGrid } from '@/components/ExploreGrid'
import { GridSkeleton } from '@/components/Common'
import { useAuth } from '@/contexts/AuthContext'
import { getExploreGrid } from '@/services/posts'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import type { Post } from '@/types'

export function ExplorePage() {
  const { profile } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    getExploreGrid(profile.id, 0)
      .then((p) => {
        setPosts(p)
        setHasMore(p.length > 0)
      })
      .finally(() => setLoading(false))
  }, [profile])

  const loadMore = useCallback(async () => {
    if (!profile || !hasMore) return
    const nextPage = page + 1
    const more = await getExploreGrid(profile.id, nextPage)
    setPosts((prev) => [...prev, ...more])
    setHasMore(more.length > 0)
    setPage(nextPage)
  }, [profile, page, hasMore])

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !loading)

  return (
    <div className="px-0.5 py-4 sm:px-4">
      {loading ? (
        <GridSkeleton count={24} />
      ) : (
        <ExploreGrid
          posts={posts}
          onChange={(p) => setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
          onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))}
        />
      )}
      <div ref={sentinelRef} className="h-4" />
    </div>
  )
}
