import { useState } from 'react'
import { Music2, X } from 'lucide-react'
import { MusicPicker } from './MusicPicker'
import { formatDuration } from '@/utils/format'
import type { AudioTrack } from '@/types'

/** The "Add music" row used when creating or editing a post/reel. Shows the selected track and opens the picker. */
export function MusicField({
  track,
  onChange,
  fallbackTitle,
}: {
  track: AudioTrack | null
  onChange: (track: AudioTrack | null) => void
  /** Existing post whose track row is gone/unknown: still show what is attached. */
  fallbackTitle?: string
}) {
  const [open, setOpen] = useState(false)
  const label = track?.title ?? fallbackTitle

  return (
    <>
      {label ? (
        <div className="flex items-center gap-3 rounded-lg border border-paper-200 p-2.5 dark:border-ink-700">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-signal-400 to-signal-700 text-white">
            <Music2 size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{label}</p>
            <p className="truncate text-xs text-ink-500">{track ? `${track.artist || 'Unknown artist'} · ${formatDuration(track.duration_seconds)}` : 'Attached music'}</p>
          </div>
          <button onClick={() => setOpen(true)} className="text-xs font-semibold text-signal-500">
            Change
          </button>
          <button onClick={() => onChange(null)} aria-label="Remove music" className="text-ink-400 hover:text-ember-500">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-paper-200 p-2.5 text-sm text-ink-500 hover:border-signal-400 dark:border-ink-700"
        >
          <Music2 size={16} /> Add music
        </button>
      )}
      <MusicPicker open={open} onClose={() => setOpen(false)} onSelect={onChange} selectedId={track?.id} />
    </>
  )
}
