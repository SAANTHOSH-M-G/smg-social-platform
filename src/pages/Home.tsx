import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StoryBar } from '@/components/StoryBar'
import { PostCard } from '@/components/PostCard'
import { PostCardSkeleton, EmptyState } from '@/components/Common'
import { UserCard } from '@/components/UserCard'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { getFeed } from '@/services/posts'
import { getSuggestedProfiles } from '@/services/profiles'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import type { Post, Profile } from '@/types'
import { Camera } from 'lucide-react'

export function HomePage() {
  const { profile } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [suggestions, setSuggestions] = useState<Profile[]>([])

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    getFeed(profile.id, 0)
      .then((p) => {
        setPosts(p)
        setHasMore(p.length > 0)
      })
      .finally(() => setLoading(false))
    getSuggestedProfiles(profile.id).then(setSuggestions)
  }, [profile])

  const loadMore = useCallback(async () => {
    if (!profile || loadingMore || !hasMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    const more = await getFeed(profile.id, nextPage)
    setPosts((prev) => [...prev, ...more])
    setHasMore(more.length > 0)
    setPage(nextPage)
    setLoadingMore(false)
  }, [profile, page, loadingMore, hasMore])

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !loading)

  const handleChange = (updated: Post) => setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  const handleDeleted = (id: string) => setPosts((prev) => prev.filter((p) => p.id !== id))

  return (
    <div className="flex gap-8 px-0 py-4 sm:px-4 lg:px-8">
      <div className="mx-auto w-full max-w-[470px] space-y-4">
        <StoryBar />

        {loading && (
          <div className="space-y-4">
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        )}

        {!loading && posts.length === 0 && (
          <EmptyState
            icon={<Camera size={28} />}
            title="Your feed is empty"
            description="Follow people to see their posts here, or check out Explore."
          />
        )}

        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onChange={handleChange} onDeleted={handleDeleted} />
          ))}
        </div>

        <div ref={sentinelRef} className="h-4" />
        {loadingMore && <PostCardSkeleton />}
      </div>

      <aside className="sticky top-6 hidden w-[320px] shrink-0 self-start lg:block">
        {profile && (
          <div className="mb-6 flex items-center gap-3">
            <Link to={`/${profile.username}`}>
              <Avatar src={profile.avatar_url} name={profile.full_name || profile.username} size="lg" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link to={`/${profile.username}`} className="block truncate text-sm font-semibold hover:underline">
                {profile.username}
              </Link>
              <p className="truncate text-xs text-ink-500 dark:text-paper-200/60">{profile.full_name}</p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-500 dark:text-paper-200/60">Suggested for you</p>
        </div>
        <div className="mt-2 space-y-1">
          {suggestions.map((s) => (
            <UserCard key={s.id} profile={s} subtitle="Suggested for you" />
          ))}
          {suggestions.length === 0 && <p className="py-4 text-sm text-ink-400">No suggestions right now.</p>}
        </div>
      </aside>
    </div>
  )
}
