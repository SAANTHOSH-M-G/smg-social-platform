import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, MessageCircle, Send, Bookmark, Volume2, VolumeX, Music2 } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { FollowButton } from './FollowButton'
import { useAuth } from '@/contexts/AuthContext'
import type { Post } from '@/types'
import { toggleLike, toggleSave } from '@/services/posts'
import { formatCount } from '@/utils/format'
import { CommentSection } from './CommentSection'
import { ShareModal } from './ShareModal'
import { AudioTrackPlayer } from './AudioTrackPlayer'
import { Modal } from './Common'

function ReelSlide({ post, isActive, onChange }: { post: Post; isActive: boolean; onChange: (post: Post) => void }) {
  const { profile } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.comment_count)
  const isOwn = profile?.id === post.user_id

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isActive) {
      video.currentTime = 0
      video.play().catch(() => undefined)
    } else {
      video.pause()
    }
  }, [isActive])

  const handleLike = async () => {
    if (!profile) return
    const nextLiked = !post.liked_by_me
    onChange({ ...post, liked_by_me: nextLiked, like_count: post.like_count + (nextLiked ? 1 : -1) })
    await toggleLike(post.id, profile.id, post.liked_by_me ?? false)
  }

  const handleSave = async () => {
    if (!profile) return
    const nextSaved = !post.saved_by_me
    onChange({ ...post, saved_by_me: nextSaved })
    await toggleSave(post.id, profile.id, post.saved_by_me ?? false)
  }

  const media = post.media[0]

  return (
    <div className="relative flex h-full w-full snap-start items-center justify-center bg-black">
      {media?.media_type === 'video' ? (
        <video
          ref={videoRef}
          src={media.media_url}
          poster={post.cover_url ?? undefined}
          className="h-full w-full object-cover sm:rounded-xl"
          loop
          muted={muted}
          playsInline
          onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
        />
      ) : (
        <img src={media?.media_url} alt="" className="h-full w-full object-cover sm:rounded-xl" />
      )}

      <button onClick={() => setMuted((m) => !m)} className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white">
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/70 to-transparent p-4 pb-6 text-white">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link to={`/${post.author.username}`}>
              <Avatar src={post.author.avatar_url} name={post.author.full_name || post.author.username} size="sm" />
            </Link>
            <Link to={`/${post.author.username}`} className="font-semibold">
              {post.author.username}
            </Link>
            {!isOwn && <FollowButton target={post.author} size="sm" className="!bg-white/20 !text-white hover:!bg-white/30" />}
          </div>
          {post.caption && <p className="mt-2 text-sm">{post.caption}</p>}
          {post.audio_url ? (
            <div className="mt-2">
              <AudioTrackPlayer url={post.audio_url} title={post.audio_title} compact />
            </div>
          ) : (
            post.audio_title && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs">
                <Music2 size={13} /> {post.audio_title}
              </p>
            )
          )}
        </div>
        <div className="flex flex-col items-center gap-4">
          <button onClick={handleLike} className="flex flex-col items-center gap-1">
            <Heart size={28} className={clsx(post.liked_by_me && 'fill-ember-500 text-ember-500')} />
            <span className="text-xs font-semibold">{formatCount(post.like_count)}</span>
          </button>
          <button onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-1">
            <MessageCircle size={28} />
            <span className="text-xs font-semibold">{formatCount(commentCount)}</span>
          </button>
          <button onClick={() => setShareOpen(true)} className="flex flex-col items-center gap-1">
            <Send size={26} />
          </button>
          <button onClick={handleSave} className="flex flex-col items-center gap-1">
            <Bookmark size={26} className={clsx(post.saved_by_me && 'fill-white')} />
          </button>
        </div>
      </div>

      <Modal open={commentsOpen} onClose={() => setCommentsOpen(false)} title="Comments" className="h-[70vh] w-full max-w-md rounded-t-2xl bg-white dark:bg-ink-900 sm:h-[70vh] sm:rounded-2xl">
        <div className="h-[calc(70vh-52px)]">
          <CommentSection postId={post.id} onCountChange={(d) => setCommentCount((c) => c + d)} />
        </div>
      </Modal>
      <ShareModal post={post} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}

export function ReelViewer({ reels, onChange }: { reels: Post[]; onChange?: (post: Post) => void }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    const container = containerRef.current
    if (!container) return
    const index = Math.round(container.scrollTop / container.clientHeight)
    setActiveIndex(index)
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="no-scrollbar h-[calc(100vh-56px)] w-full snap-y snap-mandatory overflow-y-auto md:h-screen md:max-w-[420px] md:py-4"
    >
      {reels.map((post, i) => (
        <div key={post.id} className="h-[calc(100vh-56px)] w-full snap-start md:h-[calc(100vh-32px)] md:pb-4">
          <ReelSlide post={post} isActive={i === activeIndex} onChange={(p) => onChange?.(p)} />
        </div>
      ))}
    </div>
  )
}
