import { useEffect, useRef, useState, type RefObject } from 'react'
import { Play, Pause, Music2, Volume2, VolumeX } from 'lucide-react'
import clsx from 'clsx'

const FEED_SOUND_KEY = 'smg.feed.sound'
const VISIBLE_RATIO = 0.6

function readFeedSound(): boolean {
  try {
    return sessionStorage.getItem(FEED_SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

// Module-level so every player in the feed shares one sound preference and only one track plays at a time.
let feedSoundOn = readFeedSound()
let current: HTMLAudioElement | null = null
const listeners = new Set<() => void>()
function setFeedSound(on: boolean) {
  feedSoundOn = on
  try {
    sessionStorage.setItem(FEED_SOUND_KEY, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

/**
 * Music attached to a post. Starts by itself when the post is mostly on screen, stops as soon as it
 * scrolls away (or the tab is hidden), and never overlaps another post's track. The play/pause button
 * is a manual override; the speaker button mutes/unmutes feed music for the rest of the session.
 *
 * `watchRef` is the element whose visibility drives playback (the post's media); defaults to this pill.
 */
export function AudioTrackPlayer({
  url,
  title,
  compact = false,
  watchRef,
  autoPlay = true,
}: {
  url: string
  title: string
  compact?: boolean
  watchRef?: RefObject<HTMLElement>
  autoPlay?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const inViewRef = useRef(false)
  const userPausedRef = useRef(false)
  const blockedRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [soundOn, setSoundOn] = useState(feedSoundOn)

  const play = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (current && current !== audio) current.pause() // one track at a time
    audio.muted = !feedSoundOn
    try {
      await audio.play()
      current = audio
      blockedRef.current = false
    } catch {
      // Browser refused autoplay (no interaction yet): retry on the next real gesture while still in view.
      blockedRef.current = true
    }
  }

  const pause = () => {
    const audio = audioRef.current
    audio?.pause()
    if (current === audio) current = null
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const sync = () => setSoundOn(feedSoundOn)
    listeners.add(sync)

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
            userPausedRef.current = false // next time it scrolls into view it autoplays again
            blockedRef.current = false
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
    const gestures = ['pointerdown', 'keydown', 'touchend'] as const
    gestures.forEach((g) => window.addEventListener(g, onGesture))
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      listeners.delete(sync)
      observer?.disconnect()
      gestures.forEach((g) => window.removeEventListener(g, onGesture))
      document.removeEventListener('visibilitychange', onVisibility)
      audio.pause()
      if (current === audio) current = null
    }
  }, [url, autoPlay, watchRef])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = !soundOn
  }, [soundOn])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (playing) {
      userPausedRef.current = true
      pause()
    } else {
      userPausedRef.current = false
      void play()
    }
  }

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation()
    setFeedSound(!feedSoundOn)
    // turning sound on from a click is a valid gesture: start now if this post is on screen
    if (!feedSoundOn === true && inViewRef.current && !userPausedRef.current) void play()
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
      <button onClick={toggleSound} aria-label={soundOn ? 'Mute music' : 'Unmute music'} className="shrink-0 text-ink-500 hover:text-ink-900 dark:text-paper-200/60 dark:hover:text-paper-50">
        {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
      </button>
      <audio
        ref={audioRef}
        src={url}
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      />
    </div>
  )
}
