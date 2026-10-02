import { useState } from 'react'
import { Heart, MessageCircle, Play, Images } from 'lucide-react'
import type { Post } from '@/types'
import { PostModal } from './PostModal'
import { EmptyState, GridSkeleton } from './Common'
import { formatCount } from '@/utils/format'
import { Camera } from 'lucide-react'

export function PostGrid({
  posts,
  loading,
  emptyTitle = 'No posts yet',
  emptyDescription,
  onChange,
  onDeleted,
}: {
  posts: Post[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  onChange?: (post: Post) => void
  onDeleted?: (id: string) => void
}) {
  const [activePost, setActivePost] = useState<Post | null>(null)

  if (loading) return <GridSkeleton />
  if (posts.length === 0) {
    return <EmptyState icon={<Camera size={28} />} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
        {posts.map((post) => {
          const cover = post.media[0]
          return (
            <button key={post.id} onClick={() => setActivePost(post)} className="group relative aspect-square overflow-hidden bg-paper-100 dark:bg-ink-800">
              {post.is_reel && post.cover_url ? (
                <img src={post.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : cover?.media_type === 'video' ? (
                <video src={cover.media_url + '#t=0.3'} className="h-full w-full object-cover" muted preload="metadata" />
              ) : (
                <img src={cover?.media_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
              <div className="absolute right-1.5 top-1.5 text-white drop-shadow">
                {post.is_reel ? <Play size={16} className="fill-white" /> : post.media.length > 1 ? <Images size={16} /> : null}
              </div>
              <div className="absolute inset-0 hidden items-center justify-center gap-5 bg-black/40 text-white group-hover:flex">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Heart size={18} className="fill-white" /> {formatCount(post.like_count)}
                </span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <MessageCircle size={18} className="fill-white" /> {formatCount(post.comment_count)}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      {activePost && (
        <PostModal
          post={activePost}
          onClose={() => setActivePost(null)}
          onChange={(p) => {
            setActivePost(p)
            onChange?.(p)
          }}
          onDeleted={(id) => {
            setActivePost(null)
            onDeleted?.(id)
          }}
        />
      )}
    </>
  )
}
