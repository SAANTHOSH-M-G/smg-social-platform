import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, X, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { FollowButton } from './FollowButton'
import { ConfirmDialog } from './Common'
import { CommentSection } from './CommentSection'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { Post } from '@/types'
import { toggleLike, toggleSave, deletePost } from '@/services/posts'
import { formatCount, timeAgo } from '@/utils/format'

export function PostModal({
  post,
  onClose,
  onChange,
  onDeleted,
}: {
  post: Post
  onClose: () => void
  onChange?: (post: Post) => void
  onDeleted?: (id: string) => void
}) {
  const { profile } = useAuth()
  const [mediaIndex, setMediaIndex] = useState(0)
  const [commentCount, setCommentCount] = useState(post.comment_count)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { showToast } = useToast()
  const isOwn = profile?.id === post.user_id
  const media = post.media[mediaIndex]

  const handleLike = async () => {
    if (!profile) return
    const nextLiked = !post.liked_by_me
    onChange?.({ ...post, liked_by_me: nextLiked, like_count: post.like_count + (nextLiked ? 1 : -1) })
    await toggleLike(post.id, profile.id, post.liked_by_me ?? false)
  }

  const handleSave = async () => {
    if (!profile) return
    const nextSaved = !post.saved_by_me
    onChange?.({ ...post, saved_by_me: nextSaved })
    await toggleSave(post.id, profile.id, post.saved_by_me ?? false)
  }

  const handleDelete = async () => {
    if (!profile) return
    await deletePost(post.id, profile.id)
    onDeleted?.(post.id)
    showToast('Post deleted', 'success')
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-0 sm:p-6" onClick={onClose}>
      <button onClick={onClose} className="absolute right-4 top-4 z-10 text-white hover:opacity-80">
        <X size={28} />
      </button>
      <div
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white dark:bg-ink-900 sm:h-[85vh] sm:flex-row sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex flex-1 items-center justify-center bg-black sm:min-w-0">
          {media?.media_type === 'video' ? (
            <video src={media.media_url} className="max-h-full max-w-full" controls autoPlay playsInline />
          ) : (
            <img src={media?.media_url} alt="" className="max-h-full max-w-full object-contain" />
          )}
          {post.media.length > 1 && (
            <>
              {mediaIndex > 0 && (
                <button onClick={() => setMediaIndex((i) => i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5">
                  <ChevronLeft size={20} />
                </button>
              )}
              {mediaIndex < post.media.length - 1 && (
                <button onClick={() => setMediaIndex((i) => i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1.5">
                  <ChevronRight size={20} />
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex w-full flex-col sm:w-[380px] sm:shrink-0">
          <div className="flex items-center gap-3 border-b border-paper-200 p-3.5 dark:border-ink-700">
            <Avatar src={post.author.avatar_url} name={post.author.full_name || post.author.username} size="sm" />
            <Link to={`/${post.author.username}`} className="flex-1 truncate text-sm font-semibold hover:underline" onClick={onClose}>
              {post.author.username}
            </Link>
            {!isOwn && <FollowButton target={post.author} size="sm" />}
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} className="rounded-full p-1.5 hover:bg-paper-100 dark:hover:bg-ink-800">
                <MoreHorizontal size={20} />
              </button>
              {menuOpen && isOwn && (
                <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-paper-200 bg-white py-1 shadow-soft dark:border-ink-700 dark:bg-ink-800">
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full px-4 py-2.5 text-left text-sm text-ember-500 hover:bg-paper-50 dark:hover:bg-ink-700"
                  >
                    Delete post
                  </button>
                </div>
              )}
            </div>
          </div>

          {post.caption && (
            <div className="flex gap-2.5 border-b border-paper-200 p-3.5 text-sm dark:border-ink-700">
              <Avatar src={post.author.avatar_url} name={post.author.username} size="sm" />
              <p>
                <span className="mr-1.5 font-semibold">{post.author.username}</span>
                {post.caption}
              </p>
            </div>
          )}

          <div className="min-h-0 flex-1">
            <CommentSection postId={post.id} onCountChange={(d) => setCommentCount((c) => c + d)} />
          </div>

          <div className="border-t border-paper-200 p-3 dark:border-ink-700">
            <div className="flex items-center gap-1">
              <button onClick={handleLike} className="rounded-full p-2 hover:bg-paper-100 dark:hover:bg-ink-800">
                <Heart size={24} className={clsx(post.liked_by_me && 'fill-ember-500 text-ember-500')} />
              </button>
              <span className="p-2 text-ink-400">
                <MessageCircle size={24} />
              </span>
              <span className="p-2 text-ink-400">
                <Send size={24} />
              </span>
              <button onClick={handleSave} className="ml-auto rounded-full p-2 hover:bg-paper-100 dark:hover:bg-ink-800">
                <Bookmark size={24} className={clsx(post.saved_by_me && 'fill-ink-900 dark:fill-paper-50')} />
              </button>
            </div>
            <p className="px-2 pt-1 text-sm font-semibold">{formatCount(post.like_count)} likes</p>
            <p className="px-2 text-xs uppercase tracking-wide text-ink-500 dark:text-paper-200/50">
              {timeAgo(post.created_at)} ago · {commentCount} comments
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete post?"
        description="This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>,
    document.body
  )
}
