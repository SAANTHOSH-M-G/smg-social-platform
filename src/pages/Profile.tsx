import { useEffect, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import clsx from 'clsx'
import { Grid3x3, Clapperboard, Bookmark, Tag } from 'lucide-react'
import { ProfileHeader } from '@/components/ProfileHeader'
import { PostGrid } from '@/components/PostGrid'
import { useAuth } from '@/contexts/AuthContext'
import { getProfileByUsername } from '@/services/profiles'
import { getUserPosts, getSavedPosts } from '@/services/posts'
import { getFollowState } from '@/services/follows'
import type { Post, Profile } from '@/types'

type Tab = 'posts' | 'reels' | 'saved' | 'tagged'

export function ProfilePage() {
  const { username } = useParams()
  const { profile: me } = useAuth()
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [canView, setCanView] = useState(true)

  useEffect(() => {
    if (!username) return
    setProfile(undefined)
    getProfileByUsername(username).then(setProfile)
  }, [username])

  useEffect(() => {
    if (!profile || !me) return
    const check = async () => {
      if (!profile.is_private || profile.id === me.id) {
        setCanView(true)
        return
      }
      const { isFollowing } = await getFollowState(me.id, profile.id)
      setCanView(isFollowing)
    }
    check()
  }, [profile, me])

  useEffect(() => {
    if (!profile || !canView) {
      setPosts([])
      setPostsLoading(false)
      return
    }
    setPostsLoading(true)
    const loader =
      tab === 'saved'
        ? getSavedPosts(profile.id)
        : tab === 'reels'
        ? getUserPosts(profile.id, me?.id, true)
        : getUserPosts(profile.id, me?.id, false)
    loader.then(setPosts).finally(() => setPostsLoading(false))
  }, [profile, canView, tab, me?.id])

  if (profile === undefined) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="flex items-center gap-6 sm:gap-12">
          <div className="skeleton h-24 w-24 rounded-full sm:h-32 sm:w-32" />
          <div className="flex-1 space-y-3">
            <div className="skeleton h-5 w-40 rounded" />
            <div className="skeleton h-3 w-64 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (profile === null) return <Navigate to="/" replace />

  const isOwn = me?.id === profile.id
  const tabs: { key: Tab; label: string; icon: JSX.Element }[] = [
    { key: 'posts', label: 'Posts', icon: <Grid3x3 size={16} /> },
    { key: 'reels', label: 'Reels', icon: <Clapperboard size={16} /> },
    ...(isOwn ? [{ key: 'saved' as Tab, label: 'Saved', icon: <Bookmark size={16} /> }] : []),
    { key: 'tagged', label: 'Tagged', icon: <Tag size={16} /> },
  ]

  return (
    <div className="px-0 py-4 sm:px-4">
      <ProfileHeader profile={profile} postCount={profile.posts_count} canViewContent={canView} />

      {canView && (
        <>
          <div className="mt-2 flex justify-center gap-10 border-t border-paper-200 dark:border-ink-700">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  'flex items-center gap-1.5 border-t-2 px-2 py-3 text-xs font-semibold uppercase tracking-wide',
                  tab === t.key ? 'border-ink-900 text-ink-900 dark:border-paper-50 dark:text-paper-50' : 'border-transparent text-ink-400'
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div className="mt-1">
            {tab === 'tagged' ? (
              <div className="py-16 text-center text-sm text-ink-500 dark:text-paper-200/60">Tagged posts will appear here.</div>
            ) : (
              <PostGrid
                posts={posts}
                loading={postsLoading}
                emptyTitle={tab === 'saved' ? 'No saved posts' : tab === 'reels' ? 'No reels yet' : 'No posts yet'}
                onChange={(p) => setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
                onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
