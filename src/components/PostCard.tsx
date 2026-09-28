import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Flag,
  Link2,
  Pencil,
} from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { FollowButton } from './FollowButton'
import { ConfirmDialog } from './Common'
import { EditPostModal } from './EditPostModal'
import { ShareModal } from './ShareModal'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { Post } from '@/types'
import { toggleLike, toggleSave, deletePost, reportPost } from '@/services/posts'
import { formatCount, timeAgo } from '@/utils/format'
import { PostModal } from './PostModal'
import { useOnClickOutside } from '@/hooks/useOnClickOutside'

function renderCaption(caption: string) {
  const parts = caption.split(/(\s+)/)
  return parts.map((part, i) => {
    if (part.startsWith('#')) return <span key={i} className="font-medium text-signal-500">{part}</span>
    if (part.startsWith('@')) return <span key={i} className="font-medium text-signal-500">{part}</span>
    return part
  })
}

export function PostCard({ post, onChange, onDeleted }: { post: Post; onChange?: (post: Post) => void; onDeleted?: (id: string) => void }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [mediaIndex, setMediaIndex] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [likeBurst, setLikeBurst] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useOnClickOutside(menuRef, () => setMenuOpen(false))

  const isOwn = profile?.id === post.user_id

  const handleLike = async () => {
    if (!profile) return
    const nextLiked = !post.liked_by_me
    onChange?.({ ...post, liked_by_me: nextLiked, like_count: post.like_count + (nextLiked ? 1 : -1) })
    if (nextLiked) {
      setLikeBurst(true)
      setTimeout(() => setLikeBurst(false), 600)
    }
    try {
      await toggleLike(post.id, profile.id, post.liked_by_me ?? false)
    } catch {
      onChange?.(post)
      showToast('Could not update like', 'error')
    }
  }

  const handleSave = async () => {
    if (!profile) return
    const nextSaved = !post.saved_by_me
    onChange?.({ ...post, saved_by_me: nextSaved })
    try {
      await toggleSave(post.id, profile.id, post.saved_by_me ?? false)
      showToast(nextSaved ? 'Saved' : 'Removed from saved', 'success')
    } catch {
      onChange?.(post)
      showToast('Could not update save', 'error')
    }
  }

  const handleDelete = async () => {
    if (!profile) return
    try {
      await deletePost(post.id, profile.id)
      onDeleted?.(post.id)
      showToast('Post deleted', 'success')
    } catch {
      showToast('Could not delete post', 'error')
    }
    setConfirmDelete(false)
  }

  const handleShare = async () => {
    const url = `${window.location.origin}${post.is_reel ? '/reel/' : '/p/'}${post.id}`
    try {
      await navigator.clipboard.writeText(url)
      showToast('Link copied to clipboard', 'success')
    } catch {
      showToast(url, 'default')
    }
    setMenuOpen(false)
  }

  const handleReport = async () => {
    if (!profile) return
    try {
      await reportPost(profile.id, post.id, 'inappropriate_content')
      showToast('Thanks, we received your report', 'success')
    } catch {
      showToast('Could not submit report', 'error')
    }
    setMenuOpen(false)
  }

  const media = post.media[mediaIndex]

  return (
    <article className="border-b border-paper-200 bg-white pb-2 dark:border-ink-700 dark:bg-ink-900 sm:rounded-2xl sm:border">
      <div className="flex items-center gap-3 p-3">
        <Link to={`/${post.author.username}`}>
          <Avatar src={post.author.avatar_url} name={post.author.full_name || post.author.username} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            <Link to={`/${post.author.username}`} className="truncate font-semibold hover:underline">
              {post.author.username}
            </Link>
            {post.location && <span className="truncate text-ink-500 dark:text-paper-200/60">· {post.location}</span>}
          </div>
          <span className="text-xs text-ink-500 dark:text-paper-200/60">{timeAgo(post.created_at)} ago</span>
        </div>
        {!isOwn && <FollowButton target={post.author} size="sm" />}
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen((v) => !v)} className="rounded-full p-1.5 hover:bg-paper-100 dark:hover:bg-ink-800">
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-paper-200 bg-white py-1 shadow-soft dark:border-ink-700 dark:bg-ink-800">
              <button onClick={handleShare} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-paper-50 dark:hover:bg-ink-700">
                <Link2 size={16} /> Copy link
              </button>
              {isOwn ? (
                <>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      setEditOpen(true)
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-paper-50 dark:hover:bg-ink-700"
                  >
                    <Pencil size={16} /> Edit post
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmDelete(true)
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ember-500 hover:bg-paper-50 dark:hover:bg-ink-700"
                  >
                    <Trash2 size={16} /> Delete post
                  </button>
                </>
              ) : (
                <button onClick={handleReport} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ember-500 hover:bg-paper-50 dark:hover:bg-ink-700">
                  <Flag size={16} /> Report
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="relative aspect-square w-full select-none bg-ink-950/5" onDoubleClick={handleLike}>
        {media?.media_type === 'video' ? (
          <video src={media.media_url} className="h-full w-full object-cover" controls playsInline />
        ) : (
          <img src={media?.media_url} alt={post.caption} className="h-full w-full object-cover" loading="lazy" />
        )}
        {likeBurst && (
          <Heart size={96} className="pointer-events-none absolute inset-0 m-auto animate-pop-in fill-white text-white drop-shadow-lg" />
        )}
        {post.media.length > 1 && (
          <>
            {mediaIndex > 0 && (
              <button
                onClick={() => setMediaIndex((i) => i - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow hover:bg-white dark:bg-ink-800/80"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {mediaIndex < post.media.length - 1 && (
              <button
                onClick={() => setMediaIndex((i) => i + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow hover:bg-white dark:bg-ink-800/80"
              >
                <ChevronRight size={18} />
              </button>
            )}
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {post.media.map((_, i) => (
                <span key={i} className={clsx('h-1.5 w-1.5 rounded-full', i === mediaIndex ? 'bg-white' : 'bg-white/50')} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-1 px-2 pt-2">
        <button onClick={handleLike} className="rounded-full p-2 hover:bg-paper-100 dark:hover:bg-ink-800" aria-label="Like">
          <Heart size={24} className={clsx(post.liked_by_me && 'fill-ember-500 text-ember-500')} />
        </button>
        <button onClick={() => setDetailOpen(true)} className="rounded-full p-2 hover:bg-paper-100 dark:hover:bg-ink-800" aria-label="Comment">
          <MessageCircle size={24} />
        </button>
        <button onClick={() => setShareOpen(true)} className="rounded-full p-2 hover:bg-paper-100 dark:hover:bg-ink-800" aria-label="Share">
          <Send size={24} />
        </button>
        <button onClick={handleSave} className="ml-auto rounded-full p-2 hover:bg-paper-100 dark:hover:bg-ink-800" aria-label="Save">
          <Bookmark size={24} className={clsx(post.saved_by_me && 'fill-ink-900 dark:fill-paper-50')} />
        </button>
      </div>

      <div className="space-y-1 px-3.5 pt-1 text-sm">
        <p className="font-semibold">{formatCount(post.like_count)} likes</p>
        {post.caption && (
          <p>
            <Link to={`/${post.author.username}`} className="mr-1.5 font-semibold hover:underline">
              {post.author.username}
            </Link>
            {renderCaption(post.caption)}
          </p>
        )}
        {post.tagged_users && post.tagged_users.length > 0 && (
          <p className="text-ink-500 dark:text-paper-200/60">
            with{' '}
            {post.tagged_users.map((t, i) => (
              <span key={t.id}>
                <Link to={`/${t.username}`} className="font-medium text-ink-900 hover:underline dark:text-paper-50">
                  {t.username}
                </Link>
                {i < post.tagged_users!.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        )}
        {post.comment_count > 0 && (
          <button onClick={() => setDetailOpen(true)} className="text-ink-500 dark:text-paper-200/60">
            View all {formatCount(post.comment_count)} comments
          </button>
        )}
      </div>

      {detailOpen && <PostModal post={post} onClose={() => setDetailOpen(false)} onChange={onChange} onDeleted={onDeleted} />}
      <EditPostModal post={post} open={editOpen} onClose={() => setEditOpen(false)} onSaved={(p) => onChange?.(p)} />
      <ShareModal post={post} open={shareOpen} onClose={() => setShareOpen(false)} />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete post?"
        description="This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </article>
  )
}
