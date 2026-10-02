import { useRef, useState } from 'react'
import { Play, Pause, Music2 } from 'lucide-react'
import clsx from 'clsx'

export function AudioTrackPlayer({ url, title, compact = false }: { url: string; title: string; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      void audio.play()
    }
  }

  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-full bg-paper-100 dark:bg-ink-800',
        compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
      )}
    >
      <button
        onClick={toggle}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-white dark:bg-paper-50 dark:text-ink-950"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={12} className="fill-current" /> : <Play size={12} className="fill-current" />}
      </button>
      <Music2 size={14} className="shrink-0 text-ink-500 dark:text-paper-200/60" />
      <span className="truncate font-medium">{title || 'Original audio'}</span>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        preload="none"
      />
    </div>
  )
}
