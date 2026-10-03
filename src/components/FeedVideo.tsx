import { useEffect, useRef, useState } from 'react'
import { useFeedSound, registerMedia, claimPlayback, isFeedSuspended, onFeedSuspendChange } from '@/hooks/useFeedSound'

const VISIBLE_RATIO = 0.6

/**
 * Feed video: plays when mostly on screen, pauses when scrolled away, follows the shared feed sound
 * setting (muted when the post has its own music, which is played separately), tap to pause/resume.
 */
export function FeedVideo({
  postId,
  src,
  poster,
  hasMusic,
  onBlockedChange,
}: {
  postId: string
  src: string
  poster?: string | null
  hasMusic: boolean
  /** True while the browser has forced this video to play muted although sound is on. */
  onBlockedChange?: (blocked: boolean) => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const inView = useRef(false)
  const userPaused = useRef(false)
  const blocked = useRef(false)
  const [soundOn] = useFeedSound()
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const [paused, setPaused] = useState(true)

  const setBlocked = (b: boolean) => {
    blocked.current = b
    onBlockedChange?.(b)
  }

  const play = async (force = false) => {
    const v = ref.current
    if (!v) return
    if (isFeedSuspended() && !force) return // an overlay (story, popup...) is on top
    claimPlayback(postId)
    const wantSound = soundRef.current && !hasMusic
    v.muted = !wantSound
    try {
      await v.play()
      if (wantSound) setBlocked(false)
    } catch {
      if (wantSound) {
        // audible autoplay refused: play muted, unlock on the next gesture
        v.muted = true
        setBlocked(true)
        v.play().catch(() => undefined)
      }
    }
  }

  useEffect(() => {
    const v = ref.current
    if (!v) return
    const unregister = registerMedia(postId, v)
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO
        inView.current = visible
        if (visible) {
          if (!userPaused.current && document.visibilityState === 'visible') void play()
        } else {
          userPaused.current = false
          v.pause()
        }
      },
      { threshold: [0, VISIBLE_RATIO, 1] }
    )
    observer.observe(v)
    const onGesture = () => {
      if (blocked.current && inView.current && !userPaused.current) void play()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') v.pause()
      else if (inView.current && !userPaused.current) void play()
    }
    const offSuspend = onFeedSuspendChange((s) => {
      if (!s && inView.current && !userPaused.current) void play()
    })
    const gestures = ['pointerdown', 'keydown', 'touchend'] as const
    gestures.forEach((g) => window.addEventListener(g, onGesture))
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      unregister()
      offSuspend()
      observer.disconnect()
      gestures.forEach((g) => window.removeEventListener(g, onGesture))
      document.removeEventListener('visibilitychange', onVisibility)
      v.pause()
    }
  }, [postId, hasMusic])

  // mute/unmute from the shared button applies immediately to the playing video
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const wantSound = soundOn && !hasMusic
    v.muted = !wantSound
    if (wantSound && !v.paused && !blocked.current) return
    if (wantSound && inView.current && !userPaused.current) void play()
    if (!soundOn) setBlocked(false)
  }, [soundOn, hasMusic])

  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      className="h-full w-full cursor-pointer object-cover"
      loop
      playsInline
      preload="metadata"
      onPlay={() => setPaused(false)}
      onPause={() => setPaused(true)}
      onClick={() => {
        const v = ref.current
        if (!v) return
        if (blocked.current) return void play(true) // that tap is the gesture that turns sound on
        if (v.paused) {
          userPaused.current = false
          void play(true)
        } else {
          userPaused.current = true
          v.pause()
        }
      }}
      aria-label={paused ? 'Play video' : 'Pause video'}
    />
  )
}
