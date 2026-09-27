import { useEffect, useRef, useState } from 'react'
import { Heart, Send } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { Comment } from '@/types'
import { addComment, deleteComment, getComments, toggleCommentLike } from '@/services/comments'
import { timeAgo } from '@/utils/format'

function CommentRow({
  comment,
  onReply,
  onDelete,
}: {
  comment: Comment
  onReply: (username: string, parentId: string) => void
  onDelete: (id: string) => void
}) {
  const { profile } = useAuth()
  const [liked, setLiked] = useState(comment.liked_by_me ?? false)
  const [likeCount, setLikeCount] = useState(comment.like_count)

  const handleLike = async () => {
    if (!profile) return
    setLiked(!liked)
    setLikeCount((c) => c + (liked ? -1 : 1))
    await toggleCommentLike(comment.id, profile.id, liked)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2.5">
        <Avatar src={comment.author.avatar_url} name={comment.author.full_name || comment.author.username} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="mr-1.5 font-semibold">{comment.author.username}</span>
            {comment.content}
          </p>
          <div className="mt-1 flex items-center gap-3 text-xs text-ink-500 dark:text-paper-200/60">
            <span>{timeAgo(comment.created_at)}</span>
            {likeCount > 0 && <span>{likeCount} likes</span>}
            <button onClick={() => onReply(comment.author.username, comment.id)} className="font-semibold">
              Reply
            </button>
            {profile?.id === comment.user_id && (
              <button onClick={() => onDelete(comment.id)} className="font-semibold text-ember-500">
                Delete
              </button>
            )}
          </div>
        </div>
        <button onClick={handleLike} className="mt-1 shrink-0">
          <Heart size={13} className={clsx(liked && 'fill-ember-500 text-ember-500')} />
        </button>
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-9 space-y-2 border-l border-paper-200 pl-3 dark:border-ink-700">
          {comment.replies.map((r) => (
            <CommentRow key={r.id} comment={r} onReply={onReply} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

export function CommentSection({ postId, onCountChange }: { postId: string; onCountChange?: (delta: number) => void }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<{ username: string; parentId: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getComments(postId, profile?.id)
      .then(setComments)
      .finally(() => setLoading(false))
  }, [postId, profile?.id])

  const handleReply = (username: string, parentId: string) => {
    setReplyTo({ username, parentId })
    setText(`@${username} `)
    inputRef.current?.focus()
  }

  const handleDelete = async (id: string) => {
    await deleteComment(id, profile!.id)
    setComments((prev) =>
      prev
        .filter((c) => c.id !== id)
        .map((c) => ({ ...c, replies: c.replies?.filter((r) => r.id !== id) }))
    )
    onCountChange?.(-1)
  }

  const handleSubmit = async () => {
    if (!profile || !text.trim()) return
    try {
      const created = await addComment(postId, profile.id, text.trim(), replyTo?.parentId)
      if (replyTo) {
        setComments((prev) =>
          prev.map((c) => (c.id === replyTo.parentId ? { ...c, replies: [...(c.replies ?? []), created] } : c))
        )
      } else {
        setComments((prev) => [...prev, created])
      }
      setText('')
      setReplyTo(null)
      onCountChange?.(1)
    } catch {
      showToast('Could not post comment', 'error')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-2.5">
              <div className="skeleton h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 w-3/4 rounded" />
                <div className="skeleton h-2.5 w-1/3 rounded" />
              </div>
            </div>
          ))}
        {!loading && comments.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-500 dark:text-paper-200/60">No comments yet. Start the conversation.</p>
        )}
        {comments.map((c) => (
          <CommentRow key={c.id} comment={c} onReply={handleReply} onDelete={handleDelete} />
        ))}
      </div>
      {profile && (
        <div className="flex items-center gap-2 border-t border-paper-200 p-3 dark:border-ink-700">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={replyTo ? `Replying to ${replyTo.username}...` : 'Add a comment...'}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="font-semibold text-signal-500 disabled:opacity-40"
          >
            <Send size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
