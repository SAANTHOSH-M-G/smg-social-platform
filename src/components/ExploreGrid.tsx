import { useState } from 'react'
import { Heart, MessageCircle, Play } from 'lucide-react'
import clsx from 'clsx'
import type { Post } from '@/types'
import { PostModal } from './PostModal'
import { formatCount } from '@/utils/format'

export function ExploreGrid({ posts, onChange, onDeleted }: { posts: Post[]; onChange?: (post: Post) => void; onDeleted?: (id: string) => void }) {
  const [activePost, setActivePost] = useState<Post | null>(null)

  return (
    <>
      <div className="grid auto-rows-[33vw] grid-cols-3 gap-0.5 sm:auto-rows-[220px] sm:gap-1">
        {posts.map((post, i) => {
          const large = i % 9 === 0 || i % 9 === 4
          const cover = post.media[0]
          return (
            <button
              key={post.id}
              onClick={() => setActivePost(post)}
              className={clsx('group relative overflow-hidden bg-paper-100 dark:bg-ink-800', large && 'col-span-2 row-span-2')}
            >
              {post.is_reel && post.cover_url ? (
                <img src={post.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : cover?.media_type === 'video' ? (
                <video src={cover.media_url + '#t=0.3'} className="h-full w-full object-cover" muted preload="metadata" />
              ) : (
                <img src={cover?.media_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
              {post.is_reel && (
                <div className="absolute right-2 top-2 text-white drop-shadow">
                  <Play size={18} className="fill-white" />
                </div>
              )}
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
