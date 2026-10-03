import { useEffect, useRef, useState, type RefObject } from 'react'
import { Play, Pause, Music2, Volume2, VolumeX } from 'lucide-react'
import clsx from 'clsx'
import { useFeedSound, getFeedSound, setFeedSound, registerMedia, claimPlayback, isFeedSuspended, onFeedSuspendChange } from '@/hooks/useFeedSound'

const VISIBLE_RATIO = 0.6

/**
 * Music attached to a post. Starts by itself when the post is mostly on screen, stops as soon as it
 * scrolls away (or the tab is hidden), never overlaps another post, and follows the shared feed sound
 * setting - muting one post mutes all of them, unmuting turns them all back on.
 *
 * `variant="label"` renders just the "♪ title · artist" line (the speaker button lives on the post's
 * media); `variant="pill"` adds play/pause and a speaker button (used in the post modal).
 * `watchRef` is the element whose visibility drives playback (the post's media).
 */
export function AudioTrackPlayer({
  url,
  title,
  postId,
  compact = false,
  variant = 'pill',
  watchRef,
  autoPlay = true,
  onBlockedChange,
}: {
  url: string
  title: string
  postId?: string
  compact?: boolean
  variant?: 'pill' | 'label'
  watchRef?: RefObject<HTMLElement>
  autoPlay?: boolean
  onBlockedChange?: (blocked: boolean) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const inViewRef = useRef(false)
  const userPausedRef = useRef(false)
  const blockedRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [soundOn] = useFeedSound()
  const group = postId ?? url

  const setBlocked = (b: boolean) => {
    blockedRef.current = b
    onBlockedChange?.(b)
  }

  const play = async (force = false) => {
    const audio = audioRef.current
    if (!audio) return
    if (isFeedSuspended() && !force) return // an overlay (story, popup...) is on top
    claimPlayback(group)
    audio.muted = !getFeedSound()
    try {
      await audio.play()
      setBlocked(false)
    } catch {
      // Browser refused autoplay (no interaction yet): retry on the next real gesture while in view.
      if (getFeedSound()) setBlocked(true)
    }
  }

  const pause = () => audioRef.current?.pause()

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const unregister = registerMedia(group, audio)

    const target = watchRef?.current ?? rootRef.current
    let observer: IntersectionObserver | undefined
    if (autoPlay && target) {
      observer = new IntersectionObserver(
        ([entry]) => {
          const visible = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO
          inViewRef.current = visible
          if (visible) {
            if (!userPausedRef.current && document.visibilityState === 'visible') void play()
          } else {
            userPausedRef.current = false // autoplays again next time it scrolls into view
            setBlocked(false)
            pause()
          }
        },
        { threshold: [0, VISIBLE_RATIO, 1] }
      )
      observer.observe(target)
    }

    const onGesture = () => {
      if (blockedRef.current && inViewRef.current && !userPausedRef.current) void play()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause()
      else if (inViewRef.current && !userPausedRef.current) void play()
    }
    const offSuspend = onFeedSuspendChange((s) => {
      if (!s && inViewRef.current && !userPausedRef.current && document.visibilityState === 'visible') void play()
    })
    const gestures = ['pointerdown', 'keydown', 'touchend'] as const
    gestures.forEach((g) => window.addEventListener(g, onGesture))
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      unregister()
      offSuspend()
      observer?.disconnect()
      gestures.forEach((g) => window.removeEventListener(g, onGesture))
      document.removeEventListener('visibilitychange', onVisibility)
      audio.pause()
    }
  }, [url, group, autoPlay, watchRef])

  // shared mute button: apply instantly, and (re)start if sound was just turned on while this post is visible
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !soundOn
    if (soundOn && inViewRef.current && !userPausedRef.current && (audio.paused || blockedRef.current)) void play()
    if (!soundOn) setBlocked(false)
  }, [soundOn])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (playing) {
      userPausedRef.current = true
      pause()
    } else {
      userPausedRef.current = false
      void play(true)
    }
  }

  const audioEl = (
    <audio
      ref={audioRef}
      src={url}
      loop
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      preload="metadata"
    />
  )

  if (variant === 'label') {
    return (
      <div ref={rootRef} className="flex min-w-0 items-center gap-1.5 text-xs text-ink-600 dark:text-paper-200/80">
        <Music2 size={12} className="shrink-0" />
        <span className="truncate">{title || 'Original audio'}</span>
        {audioEl}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={clsx('flex items-center gap-2 rounded-full bg-paper-100 dark:bg-ink-800', compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm')}
    >
      <button
        onClick={toggle}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-white dark:bg-paper-50 dark:text-ink-950"
        aria-label={playing ? 'Pause music' : 'Play music'}
      >
        {playing ? <Pause size={12} className="fill-current" /> : <Play size={12} className="fill-current" />}
      </button>
      <Music2 size={14} className="shrink-0 text-ink-500 dark:text-paper-200/60" />
      <span className="min-w-0 flex-1 truncate font-medium">{title || 'Original audio'}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setFeedSound(!soundOn)
        }}
        aria-label={soundOn ? 'Mute' : 'Unmute'}
        className="shrink-0 text-ink-500 hover:text-ink-900 dark:text-paper-200/60 dark:hover:text-paper-50"
      >
        {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
      </button>
      {audioEl}
    </div>
  )
}
