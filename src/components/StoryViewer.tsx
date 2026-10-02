import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Trash2, Eye, Heart, Send, Link2 } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { StoryGroup } from '@/types'
import { markStoryViewed, deleteStory, getStoryViewers, toggleStoryLike, replyToStory } from '@/services/stories'
import { timeAgo } from '@/utils/format'
import { ConfirmDialog } from './Common'

const STORY_DURATION_MS = 5000

export function StoryViewer({
  groups,
  initialIndex,
  onClose,
  onGroupsChange,
  startStoryIndex = 0,
}: {
  groups: StoryGroup[]
  initialIndex: number
  onClose: () => void
  onGroupsChange: (groups: StoryGroup[]) => void
  /** Which story within the starting group to open on (used by shared /story/:id links). */
  startStoryIndex?: number
}) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [groupIndex, setGroupIndex] = useState(initialIndex)
  const [storyIndex, setStoryIndex] = useState(startStoryIndex)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewers, setViewers] = useState<{ id: string; avatar_url: string; username: string }[]>([])
  const [showViewers, setShowViewers] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const rafRef = useRef<number>()
  const startRef = useRef<number>(0)
  const elapsedRef = useRef<number>(0)

  const group = groups[groupIndex]
  const story = group?.stories[storyIndex]
  const isOwn = profile?.id === group?.author.id

  const goNext = useMemo(
    () => () => {
      if (!group) return
      if (storyIndex < group.stories.length - 1) {
        setStoryIndex((i) => i + 1)
      } else if (groupIndex < groups.length - 1) {
        setGroupIndex((i) => i + 1)
        setStoryIndex(0)
      } else {
        onClose()
      }
    },
    [group, storyIndex, groupIndex, groups.length, onClose]
  )

  const goPrev = () => {
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1)
    } else if (groupIndex > 0) {
      setGroupIndex((i) => i - 1)
      setStoryIndex(groups[groupIndex - 1].stories.length - 1)
    }
  }

  useEffect(() => {
    setProgress(0)
    elapsedRef.current = 0
  }, [groupIndex, storyIndex])

  useEffect(() => {
    if (!story || !profile) return
    void markStoryViewed(story.id, profile.id)
  }, [story, profile])

  useEffect(() => {
    setLiked(story?.liked_by_me ?? false)
    setLikeCount(story?.like_count ?? 0)
    setReplyText('')
  }, [story?.id])

  useEffect(() => {
    if (paused || !story) return
    startRef.current = performance.now() - elapsedRef.current
    const tick = (now: number) => {
      const elapsed = now - startRef.current
      elapsedRef.current = elapsed
      const pct = Math.min(100, (elapsed / STORY_DURATION_MS) * 100)
      setProgress(pct)
      if (pct >= 100) {
        goNext()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [paused, story, goNext])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!group || !story) return null

  const handleDelete = async () => {
    if (!profile) return
    await deleteStory(story.id, profile.id)
    const updatedStories = group.stories.filter((s) => s.id !== story.id)
    const nextGroups = updatedStories.length
      ? groups.map((g, i) => (i === groupIndex ? { ...g, stories: updatedStories } : g))
      : groups.filter((_, i) => i !== groupIndex)
    onGroupsChange(nextGroups)
    setConfirmDelete(false)
    if (!updatedStories.length) onClose()
  }

  const openViewers = async () => {
    const list = await getStoryViewers(story.id)
    setViewers(list)
    setShowViewers(true)
  }

  const handleLike = async () => {
    if (!profile) return
    const next = !liked
    setLiked(next)
    setLikeCount((c) => c + (next ? 1 : -1))
    try {
      await toggleStoryLike(story.id, profile.id, liked)
    } catch {
      setLiked(!next)
      setLikeCount((c) => c + (next ? -1 : 1))
      showToast('Could not update like', 'error')
    }
  }

  const handleReply = async () => {
    if (!profile || !replyText.trim()) return
    setSendingReply(true)
    try {
      await replyToStory(story.id, profile.id, group.author.id, replyText)
      setReplyText('')
      showToast('Reply sent', 'success')
    } catch {
      showToast('Could not send reply', 'error')
    } finally {
      setSendingReply(false)
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/story/${story.id}`
    try {
      await navigator.clipboard.writeText(url)
      showToast('Link copied to clipboard', 'success')
    } catch {
      showToast(url, 'default')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black">
      <button onClick={onClose} className="absolute right-4 top-4 z-20 text-white/90 hover:text-white">
        <X size={28} />
      </button>

      <button onClick={goPrev} className="absolute left-0 top-0 z-10 hidden h-full w-16 items-center justify-start pl-2 text-white/70 hover:text-white sm:flex">
        <ChevronLeft size={32} />
      </button>
      <button onClick={goNext} className="absolute right-0 top-0 z-10 hidden h-full w-16 items-center justify-end pr-2 text-white/70 hover:text-white sm:flex">
        <ChevronRight size={32} />
      </button>

      <div className="relative flex h-full w-full max-w-md flex-col sm:h-[92vh] sm:rounded-xl">
        <div className="absolute inset-x-2 top-2 z-20 flex gap-1">
          {group.stories.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full bg-white"
                style={{ width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        <div className="absolute inset-x-2 top-6 z-20 flex items-center gap-2 text-white">
          <Avatar src={group.author.avatar_url} name={group.author.full_name || group.author.username} size="sm" />
          <span className="text-sm font-semibold">{group.author.username}</span>
          <span className="text-xs text-white/70">{timeAgo(story.created_at)}</span>
          {isOwn && (
            <button onClick={() => setConfirmDelete(true)} className="ml-auto rounded-full p-1.5 hover:bg-white/10">
              <Trash2 size={18} />
            </button>
          )}
        </div>

        <div
          className="relative flex flex-1 items-center justify-center overflow-hidden bg-ink-950 select-none"
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
        >
          {story.media_type === 'video' ? (
            <video src={story.media_url} className="max-h-full max-w-full" autoPlay muted playsInline />
          ) : (
            <img src={story.media_url} alt="" className="max-h-full max-w-full object-contain" />
          )}
          <button onClick={goPrev} className="absolute inset-y-0 left-0 w-1/3 sm:hidden" aria-label="Previous" />
          <button onClick={goNext} className="absolute inset-y-0 right-0 w-1/3 sm:hidden" aria-label="Next" />
        </div>

        {story.caption && (
          <div className="bg-ink-950 px-4 py-2 text-sm text-white/90">{story.caption}</div>
        )}

        {isOwn ? (
          <button onClick={openViewers} className="flex items-center gap-2 bg-ink-950 px-4 py-3 text-sm text-white/80 hover:text-white">
            <Eye size={16} /> View activity
            {likeCount > 0 && (
              <span className="ml-auto flex items-center gap-1 text-ember-400">
                <Heart size={14} className="fill-current" /> {likeCount}
              </span>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-ink-950 px-3 py-3">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleReply()}
              placeholder={`Reply to ${group.author.username}...`}
              className="flex-1 rounded-full border border-white/20 bg-transparent px-4 py-2 text-sm text-white outline-none placeholder:text-white/50"
            />
            <button onClick={handleLike} disabled={!profile} className="shrink-0 text-white hover:text-ember-400">
              <Heart size={24} className={clsx(liked && 'fill-ember-500 text-ember-500')} />
            </button>
            <button onClick={handleShare} className="shrink-0 text-white hover:text-white/70">
              <Link2 size={22} />
            </button>
            {replyText.trim() && (
              <button onClick={handleReply} disabled={sendingReply} className="shrink-0 text-signal-400 disabled:opacity-50">
                <Send size={22} />
              </button>
            )}
          </div>
        )}
      </div>

      {showViewers && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setShowViewers(false)}>
          <div
            className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-ink-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 font-semibold">Viewed by {viewers.length}</h3>
            <div className="space-y-3">
              {viewers.map((v) => (
                <div key={v.id} className="flex items-center gap-3">
                  <Avatar src={v.avatar_url} name={v.username} size="sm" />
                  <span className="text-sm font-medium">{v.username}</span>
                </div>
              ))}
              {viewers.length === 0 && <p className="text-sm text-ink-500">No views yet.</p>}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete story?"
        description="This story will be removed for everyone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>,
    document.body
  )
}
