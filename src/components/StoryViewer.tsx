import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Trash2, Eye, Heart, Send, Pause, Play, Volume2, VolumeX, Plus, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { Spinner } from './Common'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { StoryGroup } from '@/types'
import { markStoryViewed, deleteStory, getStoryViewers, toggleStoryLike, replyToStory, type StoryViewer as StoryViewerRow } from '@/services/stories'
import { timeAgo } from '@/utils/format'
import { ConfirmDialog } from './Common'

const IMAGE_DURATION_MS = 5000
/** Longer videos are cut off at this length so one story can't hold the whole sequence hostage. */
const MAX_VIDEO_MS = 60_000
const HOLD_TO_PAUSE_MS = 180

export function StoryViewer({
  groups,
  initialIndex,
  onClose,
  onGroupsChange,
  startStoryIndex = 0,
  onAddStory,
}: {
  groups: StoryGroup[]
  initialIndex: number
  onClose: () => void
  onGroupsChange: (groups: StoryGroup[]) => void
  /** Which story within the starting group to open on (first unseen, or a shared /story/:id link). */
  startStoryIndex?: number
  /** Shown on your own stories so you can add another one without leaving the viewer. */
  onAddStory?: () => void
}) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [pos, setPos] = useState({ g: initialIndex, s: startStoryIndex })
  const [progress, setProgress] = useState(0)
  const [holding, setHolding] = useState(false)
  const [manualPause, setManualPause] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [hidden, setHidden] = useState(document.visibilityState === 'hidden')
  const [mediaLoading, setMediaLoading] = useState(true)
  const [mediaError, setMediaError] = useState(false)
  const [muted, setMuted] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewers, setViewers] = useState<StoryViewerRow[]>([])
  const [showViewers, setShowViewers] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const elapsedRef = useRef(0)
  const lastTickRef = useRef(0)
  const lastProgressRef = useRef(0)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const holdActiveRef = useRef(false)

  const group = groups[pos.g]
  const story = group?.stories[pos.s]
  const isOwn = profile?.id === group?.author.id
  const isVideo = story?.media_type === 'video'
  const paused = holding || manualPause || inputFocused || hidden || showViewers || confirmDelete

  // always-current copies for event handlers / the rAF loop
  const posRef = useRef(pos)
  const groupsRef = useRef(groups)
  posRef.current = pos
  groupsRef.current = groups

  const goNext = useCallback(() => {
    const { g, s } = posRef.current
    const list = groupsRef.current
    const current = list[g]
    if (!current) return onClose()
    if (s < current.stories.length - 1) setPos({ g, s: s + 1 })
    else if (g < list.length - 1) setPos({ g: g + 1, s: 0 })
    else onClose()
  }, [onClose])

  const goPrev = useCallback(() => {
    const { g, s } = posRef.current
    const list = groupsRef.current
    if (s > 0) setPos({ g, s: s - 1 })
    else if (g > 0) setPos({ g: g - 1, s: Math.max(0, list[g - 1].stories.length - 1) })
    else setPos({ g, s: 0 }) // first story: restart it
  }, [])

  // reset per-story state
  useEffect(() => {
    elapsedRef.current = 0
    lastProgressRef.current = 0
    lastTickRef.current = 0
    setProgress(0)
    setMediaLoading(true)
    setMediaError(false)
    setManualPause(false)
    setLiked(story?.liked_by_me ?? false)
    setLikeCount(story?.like_count ?? 0)
    setReplyText('')
  }, [story?.id])

  useEffect(() => {
    if (!story || !profile || isOwn) return
    void markStoryViewed(story.id, profile.id)
  }, [story?.id, profile, isOwn])

  // warm the cache for the next image so transitions are instant
  useEffect(() => {
    const next = group?.stories[pos.s + 1] ?? groups[pos.g + 1]?.stories[0]
    if (next && next.media_type === 'image') {
      const img = new Image()
      img.src = next.media_url
    }
  }, [pos, group, groups])

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // lock page scroll behind the viewer
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // video play/pause follows `paused`
  useEffect(() => {
    const v = videoRef.current
    if (!v || !isVideo) return
    if (paused) {
      v.pause()
    } else {
      v.muted = muted
      v.play().catch(() => {
        // Autoplay with sound was refused (e.g. opened via a direct /story link). Fall back to muted
        // playback; the speaker button lets the viewer turn sound on with a real click.
        if (!v.muted) {
          v.muted = true
          setMuted(true)
          v.play().catch(() => undefined)
        }
      })
    }
  }, [paused, isVideo, story?.id, mediaLoading])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  // single progress loop: images count wall-clock time while not paused/loading,
  // videos mirror the element's real playback position
  useEffect(() => {
    if (!story || mediaError) return
    let raf = 0
    const tick = (now: number) => {
      const v = videoRef.current
      let pct = lastProgressRef.current
      if (isVideo) {
        if (v && v.duration && isFinite(v.duration)) {
          const cap = Math.min(v.duration * 1000, MAX_VIDEO_MS)
          pct = Math.min(1, (v.currentTime * 1000) / cap)
        }
      } else {
        if (!paused && !mediaLoading) {
          if (lastTickRef.current) elapsedRef.current += now - lastTickRef.current
          pct = Math.min(1, elapsedRef.current / IMAGE_DURATION_MS)
        }
        lastTickRef.current = now
      }
      if (Math.abs(pct - lastProgressRef.current) >= 0.004 || pct === 1) {
        lastProgressRef.current = pct
        setProgress(pct)
      }
      if (pct >= 1 && !paused) {
        goNext()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    lastTickRef.current = 0
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [story?.id, isVideo, paused, mediaLoading, mediaError, goNext])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'Escape') onClose()
      else if (e.key === ' ') {
        e.preventDefault()
        setManualPause((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, onClose])

  useEffect(() => () => clearTimeout(holdTimerRef.current), [])

  if (!group || !story) return null

  // ---- tap / hold gestures on the media area (touch, mouse and pen) ----
  const onPointerDown = () => {
    holdActiveRef.current = false
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => {
      holdActiveRef.current = true
      setHolding(true)
    }, HOLD_TO_PAUSE_MS)
  }
  const endHold = () => {
    clearTimeout(holdTimerRef.current)
    setHolding(false)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasHold = holdActiveRef.current
    holdActiveRef.current = false
    endHold()
    if (wasHold) return // released a long-press: just resume
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width * 0.33) goPrev()
    else goNext()
  }

  const handleDelete = async () => {
    if (!profile) return
    const { g, s } = pos
    try {
      await deleteStory(story.id, profile.id)
    } catch {
      showToast('Could not delete story', 'error')
      setConfirmDelete(false)
      return
    }
    const remaining = group.stories.filter((x) => x.id !== story.id)
    const nextGroups = remaining.length ? groups.map((gr, i) => (i === g ? { ...gr, stories: remaining } : gr)) : groups.filter((_, i) => i !== g)
    setConfirmDelete(false)
    onGroupsChange(nextGroups)
    if (!remaining.length) {
      if (nextGroups[g]) setPos({ g, s: 0 })
      else onClose()
    } else {
      setPos({ g, s: Math.min(s, remaining.length - 1) })
    }
  }

  const openViewers = async () => {
    setShowViewers(true)
    try {
      setViewers(await getStoryViewers(story.id))
    } catch {
      setViewers([])
    }
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
    if (!profile || !replyText.trim() || sendingReply) return
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

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  const prevGroup = groups[pos.g - 1]
  const nextGroup = groups[pos.g + 1]

  // faded neighbour story on each side (desktop), click to jump to that person's stories
  const peek = (g: StoryGroup | undefined, index: number, side: 'left' | 'right') => {
    if (!g) return <div className="hidden w-44 shrink-0 lg:block" />
    const cover = g.stories[0]
    return (
      <button
        onClick={() => setPos({ g: index, s: 0 })}
        aria-label={`${side === 'left' ? 'Previous' : 'Next'} story: ${g.author.username}`}
        className="group relative hidden h-[52vh] w-44 shrink-0 overflow-hidden rounded-xl bg-ink-800 opacity-60 transition-opacity hover:opacity-90 lg:block"
      >
        {cover.media_type === 'image' ? (
          <img src={cover.media_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-signal-600 to-ink-800" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-3 text-white">
          <Avatar src={g.author.avatar_url} name={g.author.full_name || g.author.username} size="sm" />
          <span className="truncate text-xs font-semibold">{g.author.username}</span>
        </div>
      </button>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center gap-4 bg-ink-950/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${group.author.username}'s story`}>
      <button onClick={onClose} aria-label="Close story" className="absolute right-3 top-3 z-30 hidden rounded-full p-2 text-white/90 hover:bg-white/10 sm:block">
        <X size={26} />
      </button>

      <button onClick={goPrev} aria-label="Previous story" className="absolute left-3 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25 sm:block lg:left-[calc(50%-390px)]">
        <ChevronLeft size={22} />
      </button>
      <button onClick={goNext} aria-label="Next story" className="absolute right-3 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25 sm:block lg:right-[calc(50%-390px)]">
        <ChevronRight size={22} />
      </button>

      {peek(prevGroup, pos.g - 1, 'left')}

      {/* the story card */}
      <div className="relative h-[100dvh] w-full overflow-hidden bg-black sm:h-[94vh] sm:w-auto sm:max-w-[min(460px,100vw)] sm:aspect-[9/16] sm:rounded-2xl">
        {/* blurred copy of the photo fills any letterbox space */}
        {!isVideo && !mediaError && <img src={story.media_url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />}

        {/* media + gesture surface */}
        <div
          className="absolute inset-0 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={endHold}
          onPointerLeave={() => holdActiveRef.current && endHold()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {isVideo ? (
            <video
              ref={videoRef}
              key={story.id}
              src={story.media_url}
              className="h-full w-full object-contain"
              playsInline
              preload="auto"
              muted={muted}
              onCanPlay={() => setMediaLoading(false)}
              onPlaying={() => setMediaLoading(false)}
              onWaiting={() => setMediaLoading(true)}
              onEnded={goNext}
              onError={() => {
                setMediaLoading(false)
                setMediaError(true)
              }}
            />
          ) : (
            <img
              key={story.id}
              src={story.media_url}
              alt={story.caption || `Story by ${group.author.username}`}
              draggable={false}
              className="relative h-full w-full object-contain"
              onLoad={() => setMediaLoading(false)}
              onError={() => {
                setMediaLoading(false)
                setMediaError(true)
              }}
            />
          )}

          {mediaLoading && !mediaError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
              <Spinner size={30} />
            </div>
          )}
          {mediaError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white" onPointerDown={stop} onPointerUp={stop}>
              <AlertCircle size={32} />
              <p className="text-sm">This story couldn't be loaded.</p>
              <button onClick={goNext} className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">
                Skip
              </button>
            </div>
          )}
          {paused && !mediaLoading && !mediaError && !holding && (manualPause || inputFocused) && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/50 p-4 text-white">
                <Pause size={28} />
              </span>
            </div>
          )}
        </div>

        {/* top overlay: progress segments + author */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/60 via-black/20 to-transparent px-3 pb-10 pt-3">
          <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={group.stories.length} aria-valuenow={pos.s + 1} aria-label="Story progress">
            {group.stories.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <div className="h-full origin-left bg-white" style={{ transform: `scaleX(${i < pos.s ? 1 : i === pos.s ? progress : 0})` }} />
              </div>
            ))}
          </div>
          <div className="pointer-events-auto mt-3 flex items-center gap-2 text-white">
            <Avatar src={group.author.avatar_url} name={group.author.full_name || group.author.username} size="sm" />
            <span className="truncate text-sm font-semibold drop-shadow">{group.author.username}</span>
            <span className="shrink-0 text-xs text-white/70">{timeAgo(story.created_at)}</span>
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {isOwn && onAddStory && (
                <button onClick={onAddStory} aria-label="Add to your story" title="Add to your story" className="rounded-full p-1.5 hover:bg-white/15">
                  <Plus size={20} />
                </button>
              )}
              <button onClick={() => setManualPause((p) => !p)} aria-label={manualPause ? 'Resume' : 'Pause'} title={manualPause ? 'Resume' : 'Pause'} className="rounded-full p-1.5 hover:bg-white/15">
                {manualPause ? <Play size={18} className="fill-current" /> : <Pause size={18} className="fill-current" />}
              </button>
              {isVideo && (
                <button onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} className="rounded-full p-1.5 hover:bg-white/15">
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              )}
              {isOwn && (
                <button onClick={() => setConfirmDelete(true)} aria-label="Delete story" title="Delete story" className="rounded-full p-1.5 hover:bg-white/15">
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={onClose} aria-label="Close story" className="rounded-full p-1.5 hover:bg-white/15 sm:hidden">
                <X size={22} />
              </button>
            </div>
          </div>
        </div>

        {/* bottom overlay: caption + reply / activity */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-14">
          {story.caption && <p className="pointer-events-auto mb-3 text-sm text-white [overflow-wrap:anywhere] [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{story.caption}</p>}

          {isOwn ? (
            <button onClick={openViewers} className="pointer-events-auto flex items-center gap-2 text-sm text-white/90 hover:text-white">
              <Eye size={16} /> View activity
              {likeCount > 0 && (
                <span className="ml-3 flex items-center gap-1 text-ember-400">
                  <Heart size={14} className="fill-current" /> {likeCount}
                </span>
              )}
            </button>
          ) : (
            <div className="pointer-events-auto flex items-center gap-3">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                placeholder={`Reply to ${group.author.username}…`}
                aria-label="Reply to story"
                className="min-w-0 flex-1 rounded-full border border-white/50 bg-black/20 px-4 py-2.5 text-sm text-white outline-none backdrop-blur-sm placeholder:text-white/70 focus:border-white"
              />
              <button onClick={handleLike} disabled={!profile} aria-label={liked ? 'Unlike story' : 'Like story'} className="shrink-0 text-white transition-transform active:scale-90">
                <Heart size={26} className={clsx(liked && 'fill-ember-500 text-ember-500')} />
              </button>
              <button onClick={replyText.trim() ? handleReply : handleShare} disabled={sendingReply} aria-label={replyText.trim() ? 'Send reply' : 'Copy story link'} className="shrink-0 text-white disabled:opacity-50">
                <Send size={24} />
              </button>
            </div>
          )}
        </div>
      </div>

      {peek(nextGroup, pos.g + 1, 'right')}

      {showViewers && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setShowViewers(false)}>
          <div className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-ink-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold">
              Viewed by {viewers.length}
              <span className="ml-2 inline-flex items-center gap-1 text-sm font-medium text-ember-500">
                <Heart size={13} className="fill-current" /> {viewers.filter((v) => v.liked).length}
              </span>
            </h3>
            <div className="space-y-3">
              {viewers.map((v) => (
                <div key={v.id} className="flex items-center gap-3">
                  <Avatar src={v.avatar_url} name={v.full_name || v.username} size="sm" />
                  <span className="flex-1 truncate text-sm font-medium">{v.username}</span>
                  {v.liked && <Heart size={16} className="shrink-0 fill-ember-500 text-ember-500" aria-label="Liked your story" />}
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
