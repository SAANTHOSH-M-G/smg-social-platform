import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, MessageCircle, Send, Bookmark, Volume2, VolumeX, Music2, Play, X, AlertCircle, RotateCcw } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { FollowButton } from './FollowButton'
import { Spinner } from './Common'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { Post } from '@/types'
import { toggleLike, toggleSave } from '@/services/posts'
import { formatCount } from '@/utils/format'
import { CommentSection } from './CommentSection'
import { ShareModal } from './ShareModal'
import { Modal } from './Common'

const SOUND_KEY = 'smg.reels.sound'
const WHEEL_LOCK_MS = 800
const SWIPE_MIN_PX = 50
const DOUBLE_TAP_MS = 300
/** When a reel has its own music, the video's original audio is kept quiet underneath it. */
const ORIGINAL_AUDIO_WITH_MUSIC = 0.25

function readSoundPreference(): boolean {
  try {
    return sessionStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return Boolean(el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable))
}

/** True while any modal (comments, share, music picker...) is open - the feed must not react to wheel/keys then. */
function modalIsOpen() {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
}

/** Shared by the viewer and the loading state so both occupy exactly the same screen area. */
const STAGE_CLASS =
  'fixed inset-x-0 top-14 bottom-12 z-10 flex justify-center overflow-hidden bg-black md:inset-y-0 md:left-[72px] md:right-0 md:bg-paper-50 md:dark:bg-ink-950 lg:left-64'

export function ReelsSkeleton() {
  return (
    <div className={STAGE_CLASS}>
      <div className="h-full w-full md:max-w-[440px] md:py-4">
        <div className="skeleton h-full w-full rounded-none md:rounded-2xl" />
      </div>
    </div>
  )
}

interface SlideProps {
  post: Post
  isActive: boolean
  preload: 'auto' | 'metadata' | 'none'
  soundOn: boolean
  soundBlocked: boolean
  onToggleSound: () => void
  onSoundBlocked: () => void
  onChange: (post: Post) => void
}

const ReelSlide = memo(function ReelSlide({ post, isActive, preload, soundOn, soundBlocked, onToggleSound, onSoundBlocked, onChange }: SlideProps) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const videoRef = useRef<HTMLVideoElement>(null)
  const musicRef = useRef<HTMLAudioElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const slideRef = useRef<HTMLDivElement>(null)
  const lastTimeRef = useRef(0)
  const lastTapRef = useRef(0)
  const tapTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const heartTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const [userPaused, setUserPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [fit, setFit] = useState<'cover' | 'contain'>('contain')
  const [expanded, setExpanded] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [burst, setBurst] = useState<{ x: number; y: number; id: number } | null>(null)
  const isOwn = profile?.id === post.user_id
  const media = post.media[0]
  const isVideo = media?.media_type === 'video'
  const hasMusic = Boolean(post.audio_url)

  // The post object changes on like/save; handlers read the latest through a ref so memo + timers stay correct.
  const postRef = useRef(post)
  postRef.current = post

  // --- playback: only the active, un-paused reel plays; everything else is paused and rewound ---
  useEffect(() => {
    const video = videoRef.current
    const music = musicRef.current
    if (!isActive || userPaused) {
      video?.pause()
      music?.pause()
      if (!isActive) {
        if (video && video.currentTime > 0) video.currentTime = 0
        if (music) music.currentTime = 0
        if (barRef.current) barRef.current.style.transform = 'scaleX(0)'
        setUserPaused(false)
      }
      return
    }

    let cancelled = false
    const start = async () => {
      if (video) {
        video.muted = !soundOn
        video.volume = hasMusic ? ORIGINAL_AUDIO_WITH_MUSIC : 1
      }
      if (music) music.muted = !soundOn
      try {
        await video?.play()
        if (music && !cancelled) await music.play()
      } catch {
        // Browsers refuse audible autoplay until the person has interacted with the page. Never fight
        // that: fall back to muted playback and let the next real gesture turn the sound on.
        if (cancelled) return
        if (soundOn) {
          if (video) video.muted = true
          if (music) music.muted = true
          onSoundBlocked()
          video?.play().catch(() => undefined)
          music?.play().catch(() => undefined)
        }
      }
    }
    void start()
    return () => {
      cancelled = true
    }
    // soundBlocked is included so a user gesture (which clears it) re-runs this and retries with sound
  }, [isActive, userPaused, soundOn, soundBlocked, hasMusic, attempt])

  // tear everything down on unmount
  useEffect(() => {
    const video = videoRef.current
    const music = musicRef.current
    return () => {
      clearTimeout(tapTimerRef.current)
      clearTimeout(heartTimerRef.current)
      video?.pause()
      music?.pause()
    }
  }, [])

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !v.duration) return
    if (barRef.current) barRef.current.style.transform = `scaleX(${v.currentTime / v.duration})`
    // video looped -> restart the music with it so they stay in step
    if (v.currentTime < lastTimeRef.current - 0.5 && musicRef.current) musicRef.current.currentTime = 0
    lastTimeRef.current = v.currentTime
  }

  const handleLike = useCallback(async () => {
    if (!profile) return
    const current = postRef.current
    const nextLiked = !current.liked_by_me
    onChange({ ...current, liked_by_me: nextLiked, like_count: current.like_count + (nextLiked ? 1 : -1) })
    try {
      await toggleLike(current.id, profile.id, current.liked_by_me ?? false)
    } catch {
      onChange(current)
      showToast('Could not update like', 'error')
    }
  }, [profile, onChange, showToast])

  const handleSave = async () => {
    if (!profile) return
    const current = postRef.current
    onChange({ ...current, saved_by_me: !current.saved_by_me })
    try {
      await toggleSave(current.id, profile.id, current.saved_by_me ?? false)
    } catch {
      onChange(current)
      showToast('Could not update save', 'error')
    }
  }

  const togglePlayback = () => setUserPaused((p) => !p)

  // single tap = play/pause, double tap = like (with heart burst)
  const handleSurfaceClick = (e: React.MouseEvent) => {
    // The first tap after sound was blocked is the gesture that unlocks audio - don't also pause.
    if (soundBlocked) return
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      clearTimeout(tapTimerRef.current)
      lastTapRef.current = 0
      if (!postRef.current.liked_by_me) void handleLike()
      const rect = slideRef.current?.getBoundingClientRect()
      setBurst({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0), id: now })
      clearTimeout(heartTimerRef.current)
      heartTimerRef.current = setTimeout(() => setBurst(null), 800)
    } else {
      lastTapRef.current = now
      tapTimerRef.current = setTimeout(togglePlayback, DOUBLE_TAP_MS - 40)
    }
  }

  // Space (handled by the viewer) toggles through this custom event so it reaches only the active slide
  useEffect(() => {
    if (!isActive) return
    const onToggle = () => setUserPaused((p) => !p)
    window.addEventListener('smg:reel-toggle-play', onToggle)
    return () => window.removeEventListener('smg:reel-toggle-play', onToggle)
  }, [isActive])

  const retry = () => {
    setError(false)
    setLoading(true)
    setAttempt((a) => a + 1)
    videoRef.current?.load()
  }

  return (
    <div ref={slideRef} className="relative h-full w-full overflow-hidden bg-black md:rounded-2xl">
      {isVideo ? (
        <video
          key={attempt}
          ref={videoRef}
          src={media.media_url}
          poster={post.cover_url ?? undefined}
          className={clsx('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
          loop
          playsInline
          preload={preload}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (v.videoWidth && v.videoHeight) setFit(v.videoWidth / v.videoHeight <= 0.8 ? 'cover' : 'contain')
          }}
          onCanPlay={() => setLoading(false)}
          onPlaying={() => {
            setLoading(false)
            setError(false)
          }}
          onWaiting={() => isActive && setLoading(true)}
          onTimeUpdate={handleTimeUpdate}
          onError={() => {
            setLoading(false)
            setError(true)
          }}
        />
      ) : (
        <img src={media?.media_url} alt={post.caption || 'Reel'} className="h-full w-full object-cover" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setError(true) }} />
      )}

      {hasMusic && <audio ref={musicRef} src={post.audio_url ?? undefined} loop preload={isActive ? 'auto' : 'none'} />}

      {/* tap surface (below the controls) */}
      <button type="button" onClick={handleSurfaceClick} aria-label={userPaused ? 'Play reel' : 'Pause reel'} className="absolute inset-0 z-[1] cursor-pointer" />

      {isActive && loading && !error && (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center text-white">
          <Spinner size={32} />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center text-white">
          <AlertCircle size={32} />
          <p className="text-sm">This reel couldn't be played.</p>
          <button onClick={retry} className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">
            <RotateCcw size={16} /> Try again
          </button>
        </div>
      )}
      {userPaused && isActive && !error && (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
          <span className="rounded-full bg-black/50 p-5 text-white">
            <Play size={34} className="fill-current" />
          </span>
        </div>
      )}
      {burst && (
        <Heart
          key={burst.id}
          size={96}
          style={{ left: burst.x - 48, top: burst.y - 48 }}
          className="pointer-events-none absolute z-[3] animate-pop-in fill-ember-500 text-ember-500 drop-shadow-lg"
        />
      )}

      {/* top controls */}
      <div className="absolute inset-x-0 top-0 z-[4] flex items-start justify-end gap-2 bg-gradient-to-b from-black/40 to-transparent p-3">
        {isActive && soundBlocked && soundOn && (
          <button onClick={onToggleSound} className="mr-auto rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">
            Tap to turn on sound
          </button>
        )}
        <button
          onClick={onToggleSound}
          aria-label={soundOn ? 'Mute' : 'Unmute'}
          title={soundOn ? 'Mute (M)' : 'Unmute (M)'}
          className="rounded-full bg-black/45 p-2 text-white backdrop-blur hover:bg-black/60"
        >
          {soundOn && !soundBlocked ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>

      {/* bottom info + actions */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-5 pt-16 text-white">
        <div className="pointer-events-auto min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link to={`/${post.author.username}`}>
              <Avatar src={post.author.avatar_url} name={post.author.full_name || post.author.username} size="sm" />
            </Link>
            <Link to={`/${post.author.username}`} className="truncate font-semibold">
              {post.author.username}
            </Link>
            {!isOwn && <FollowButton target={post.author} size="sm" className="!bg-white/20 !text-white hover:!bg-white/30" />}
          </div>
          {post.caption && (
            <button onClick={() => setExpanded((v) => !v)} className="mt-2 block w-full text-left text-sm [overflow-wrap:anywhere]" aria-expanded={expanded}>
              <span className={clsx(!expanded && 'line-clamp-2')}>{post.caption}</span>
            </button>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs">
            <Music2 size={13} className="shrink-0" />
            <span className="truncate">
              {hasMusic ? `${post.audio_title || 'Original audio'}${post.audio_artist ? ` · ${post.audio_artist}` : ''}` : `Original audio · ${post.author.username}`}
            </span>
          </p>
        </div>

        <div className="pointer-events-auto flex flex-col items-center gap-5">
          <button onClick={handleLike} aria-label={post.liked_by_me ? 'Unlike' : 'Like'} aria-pressed={post.liked_by_me} className="flex flex-col items-center gap-1">
            <Heart size={28} className={clsx('transition-transform active:scale-90', post.liked_by_me && 'fill-ember-500 text-ember-500')} />
            <span className="text-xs font-semibold">{formatCount(post.like_count)}</span>
          </button>
          <button onClick={() => setCommentsOpen(true)} aria-label="Comments" className="flex flex-col items-center gap-1">
            <MessageCircle size={28} />
            <span className="text-xs font-semibold">{formatCount(post.comment_count)}</span>
          </button>
          <button onClick={() => setShareOpen(true)} aria-label="Share" className="flex flex-col items-center gap-1">
            <Send size={26} />
          </button>
          <button onClick={handleSave} aria-label={post.saved_by_me ? 'Unsave' : 'Save'} aria-pressed={post.saved_by_me} className="flex flex-col items-center gap-1">
            <Bookmark size={26} className={clsx(post.saved_by_me && 'fill-white')} />
          </button>
        </div>
      </div>

      {/* playback progress */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[3px] bg-white/25">
        <div ref={barRef} className="h-full origin-left bg-white" style={{ transform: 'scaleX(0)' }} />
      </div>

      {commentsOpen && (
        <Modal open onClose={() => setCommentsOpen(false)} title="Comments" className="h-[70vh] w-full max-w-md rounded-t-2xl bg-white dark:bg-ink-900 sm:h-[70vh] sm:rounded-2xl">
          <div className="h-[calc(70vh-52px)]">
            <CommentSection postId={post.id} onCountChange={(d) => onChange({ ...postRef.current, comment_count: postRef.current.comment_count + d })} />
          </div>
        </Modal>
      )}
      {shareOpen && <ShareModal post={post} open onClose={() => setShareOpen(false)} />}
    </div>
  )
})

export function ReelViewer({
  reels,
  onChange,
  onClose,
  onNearEnd,
}: {
  reels: Post[]
  onChange?: (post: Post) => void
  /** Shown as a close button / handles Escape when the viewer is used as a modal-style page. */
  onClose?: () => void
  /** Called when the viewer gets within 3 reels of the end so the page can load more. */
  onNearEnd?: () => void
}) {
  const [index, setIndex] = useState(0)
  const [soundOn, setSoundOn] = useState(readSoundPreference)
  const [soundBlocked, setSoundBlocked] = useState(false)
  const lockUntil = useRef(0)
  const touchStart = useRef<{ y: number; x: number } | null>(null)
  const count = reels.length

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.max(0, Math.min(count - 1, i + delta)))
    },
    [count]
  )

  useEffect(() => {
    if (index >= count - 3) onNearEnd?.()
  }, [index, count, onNearEnd])

  // keep the index valid if the list shrinks
  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(0, count - 1))
  }, [count, index])

  const setSound = useCallback((on: boolean) => {
    setSoundOn(on)
    setSoundBlocked(false)
    try {
      sessionStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
    } catch {
      /* private mode: preference just won't persist across reloads */
    }
  }, [])

  const toggleSound = useCallback(() => {
    // while blocked the speaker icon shows "off": a click there means "turn it on"
    setSound(soundBlocked ? true : !soundOn)
  }, [soundOn, soundBlocked, setSound])

  // The first real gesture after the browser blocked audible autoplay unlocks sound for every later reel.
  useEffect(() => {
    if (!soundBlocked) return
    const unlock = () => setSoundBlocked(false)
    const events = ['click', 'keydown', 'touchend'] as const
    events.forEach((e) => window.addEventListener(e, unlock, { once: true }))
    return () => events.forEach((e) => window.removeEventListener(e, unlock))
  }, [soundBlocked])

  // Wheel anywhere on the page (not just over the video) pages through reels, and never scrolls the page behind.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (modalIsOpen()) return
      if ((e.target as HTMLElement | null)?.closest?.('[data-allow-scroll]')) return
      e.preventDefault()
      if (Math.abs(e.deltaY) < 8) return
      const now = performance.now()
      if (now < lockUntil.current) return
      lockUntil.current = now + WHEEL_LOCK_MS
      go(e.deltaY > 0 ? 1 : -1)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!modalIsOpen()) onClose?.()
        return
      }
      if (modalIsOpen() || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        go(-1)
      } else if (e.key === ' ' || e.key === 'k') {
        // let a focused button/link handle its own Space activation
        if ((e.target as HTMLElement | null)?.closest?.('a,button') && e.key === ' ') return
        e.preventDefault()
        window.dispatchEvent(new Event('smg:reel-toggle-play'))
      } else if (e.key === 'm' || e.key === 'M') {
        toggleSound()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose, toggleSound])

  const handleChange = useCallback((p: Post) => onChange?.(p), [onChange])
  const unlockSound = useCallback(() => setSoundBlocked(true), [])

  return (
    <div
      className={STAGE_CLASS}
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      onTouchStart={(e) => {
        const t = e.touches[0]
        touchStart.current = { y: t.clientY, x: t.clientX }
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current
        touchStart.current = null
        if (!start || modalIsOpen()) return
        const t = e.changedTouches[0]
        const dy = t.clientY - start.y
        const dx = t.clientX - start.x
        if (Math.abs(dy) >= SWIPE_MIN_PX && Math.abs(dy) > Math.abs(dx)) go(dy < 0 ? 1 : -1) // swipe up = next
      }}
    >
      {onClose && (
        <button onClick={onClose} aria-label="Close reel" className="absolute left-3 top-3 z-20 rounded-full bg-black/45 p-2 text-white hover:bg-black/60 md:left-6">
          <X size={20} />
        </button>
      )}

      <div className="relative h-full w-full md:max-w-[440px]" role="feed" aria-label="Reels">
        {reels.map((post, i) => {
          const offset = i - index
          if (Math.abs(offset) > 1) return null // only the active reel and its neighbours exist in the DOM
          return (
            <div
              key={post.id}
              aria-hidden={offset !== 0}
              className="absolute inset-0 transition-transform duration-[380ms] ease-[cubic-bezier(0.22,0.8,0.26,0.99)] will-change-transform md:py-4"
              style={{ transform: `translate3d(0, ${offset * 100}%, 0)`, pointerEvents: offset === 0 ? 'auto' : 'none' }}
            >
              <ReelSlide
                post={post}
                isActive={offset === 0}
                preload={offset === 0 ? 'auto' : offset === 1 ? 'auto' : 'metadata'}
                soundOn={soundOn}
                soundBlocked={soundBlocked}
                onToggleSound={toggleSound}
                onSoundBlocked={unlockSound}
                onChange={handleChange}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
