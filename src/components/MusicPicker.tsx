import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Music2, Pause, Play, Search, Trash2, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import { Spinner, ConfirmDialog } from './Common'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { deleteTrack, searchMusic, uploadTrack } from '@/services/music'
import { UploadValidationError, validateAudioFile } from '@/services/storage'
import { formatDuration } from '@/utils/format'
import type { AudioTrack } from '@/types'

type Tab = 'library' | 'mine' | 'upload'

/**
 * Music selector: search the library, preview a track, pick it - or upload a track you own the
 * rights to. Calls `onSelect` with the chosen AudioTrack; the caller stores the reference on the post.
 */
export function MusicPicker({
  open,
  onClose,
  onSelect,
  selectedId,
}: {
  open: boolean
  onClose: () => void
  onSelect: (track: AudioTrack) => void
  selectedId?: string | null
}) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('library')
  const [query, setQuery] = useState('')
  const [library, setLibrary] = useState<AudioTrack[]>([])
  const [mine, setMine] = useState<AudioTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AudioTrack | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const debounced = useDebounce(query, 250)

  // upload form
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stopPreview = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    setPreviewId(null)
  }, [])

  const load = useCallback(async (q: string) => {
    setLoading(true)
    setError(false)
    try {
      const res = await searchMusic(q)
      setLibrary(res.library)
      setMine(res.mine)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load(debounced)
  }, [open, debounced, load])

  useEffect(() => {
    if (!open) stopPreview()
  }, [open, stopPreview])
  useEffect(() => stopPreview, [stopPreview])
  useEffect(() => {
    if (tab === 'upload') stopPreview()
  }, [tab, stopPreview])

  const togglePreview = async (track: AudioTrack) => {
    setPreviewError(null)
    if (previewId === track.id) return stopPreview()
    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current
    audio.pause()
    audio.src = track.audio_url
    audio.loop = true
    audio.onended = () => setPreviewId(null)
    setPreviewId(track.id)
    try {
      await audio.play()
    } catch {
      setPreviewId(null)
      setPreviewError(track.id)
    }
  }

  const choose = (track: AudioTrack) => {
    stopPreview()
    onSelect(track)
    onClose()
  }

  const pickFile = (f?: File) => {
    if (!f) return
    try {
      validateAudioFile(f)
      setFile(f)
      if (!title) setTitle(f.name.replace(/\.[^/.]+$/, '').slice(0, 100))
    } catch (e) {
      showToast(e instanceof UploadValidationError ? e.message : 'Invalid audio file', 'error')
    }
  }

  const submitUpload = async () => {
    if (!profile || !file || uploading) return
    setUploading(true)
    try {
      const track = await uploadTrack(profile.id, file, { title, artist })
      showToast('Track uploaded', 'success')
      setFile(null)
      setTitle('')
      setArtist('')
      setRightsConfirmed(false)
      choose(track)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not upload track', 'error')
    } finally {
      setUploading(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const track = pendingDelete
    setPendingDelete(null)
    try {
      if (previewId === track.id) stopPreview()
      await deleteTrack(track)
      setMine((prev) => prev.filter((t) => t.id !== track.id))
    } catch {
      showToast('Could not delete track', 'error')
    }
  }

  if (!open) return null

  const list = tab === 'library' ? library : mine

  const row = (track: AudioTrack) => {
    const playing = previewId === track.id
    const selected = selectedId === track.id
    return (
      <li key={track.id} className={clsx('flex items-center gap-3 rounded-xl px-2 py-2', selected && 'bg-signal-50 dark:bg-ink-800')}>
        <button
          onClick={() => togglePreview(track)}
          aria-label={playing ? `Pause preview of ${track.title}` : `Preview ${track.title}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-signal-400 to-signal-700 text-white"
        >
          {playing ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{track.title}</p>
          <p className="truncate text-xs text-ink-500 dark:text-paper-200/60">
            {track.artist || 'Unknown artist'} · {formatDuration(track.duration_seconds)}
            {previewError === track.id && <span className="ml-1 text-ember-500">· couldn't play</span>}
          </p>
        </div>
        {track.source === 'upload' && (
          <button onClick={() => setPendingDelete(track)} aria-label={`Delete ${track.title}`} className="rounded-full p-1.5 text-ink-400 hover:text-ember-500">
            <Trash2 size={16} />
          </button>
        )}
        <button
          onClick={() => choose(track)}
          className={clsx('shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold', selected ? 'bg-signal-500 text-white' : 'bg-paper-100 hover:bg-paper-200 dark:bg-ink-700 dark:hover:bg-ink-600')}
        >
          {selected ? (
            <span className="flex items-center gap-1">
              <Check size={13} /> Selected
            </span>
          ) : (
            'Use'
          )}
        </button>
      </li>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="Choose music">
      <div className="flex h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-soft dark:bg-ink-900 sm:h-[600px] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-paper-200 px-4 py-3 dark:border-ink-700">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Music2 size={18} /> Music
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-paper-100 dark:hover:bg-ink-800">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-3 border-b border-paper-200 text-sm font-semibold dark:border-ink-700" role="tablist">
          {(
            [
              ['library', 'Library'],
              ['mine', 'My uploads'],
              ['upload', 'Upload'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={clsx('py-2.5', tab === id ? 'border-b-2 border-signal-500 text-signal-500' : 'text-ink-500')}>
              {label}
            </button>
          ))}
        </div>

        {tab !== 'upload' && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2 rounded-lg bg-paper-100 px-3 py-2 dark:bg-ink-800">
              <Search size={16} className="text-ink-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs or artists" aria-label="Search music" className="flex-1 bg-transparent text-sm outline-none" />
              {query && (
                <button onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} className="text-ink-400" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab !== 'upload' && (
            <>
              {loading && list.length === 0 && (
                <div className="space-y-3 p-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="skeleton h-11 w-11 rounded-lg" />
                      <div className="flex-1 space-y-1.5">
                        <div className="skeleton h-3 w-32 rounded" />
                        <div className="skeleton h-2.5 w-20 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {error && (
                <p className="py-10 text-center text-sm text-ink-500">
                  Couldn't load music.{' '}
                  <button onClick={() => void load(debounced)} className="font-semibold text-signal-500">
                    Retry
                  </button>
                </p>
              )}
              {!loading && !error && list.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-ink-500">
                  <Music2 size={28} />
                  {query.trim() ? <p>No tracks match "{query}".</p> : tab === 'mine' ? <p>You haven't uploaded any tracks yet.</p> : <p>The library is empty. Run the 004 migration to add the starter tracks.</p>}
                  {tab === 'mine' && (
                    <button onClick={() => setTab('upload')} className="font-semibold text-signal-500">
                      Upload a track
                    </button>
                  )}
                </div>
              )}
              <ul className="space-y-1">{list.map(row)}</ul>
              {tab === 'library' && library.length > 0 && <p className="px-2 pt-3 text-center text-[11px] text-ink-400">Royalty-free loops by SMG Originals (CC0).</p>}
            </>
          )}

          {tab === 'upload' && (
            <div className="space-y-3 p-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-paper-200 p-6 text-sm text-ink-500 hover:border-signal-400 dark:border-ink-700"
              >
                <Upload size={24} />
                {file ? <span className="font-medium text-ink-900 dark:text-paper-50">{file.name}</span> : <span>Choose an audio file (MP3, M4A, WAV, OGG · max 20 MB)</span>}
              </button>
              <input ref={fileInputRef} type="file" accept=".mp3,.m4a,.mp4,.wav,.ogg,audio/*" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
              <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))} placeholder="Track title" aria-label="Track title" className="w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700" />
              <input value={artist} onChange={(e) => setArtist(e.target.value.slice(0, 100))} placeholder="Artist (optional)" aria-label="Artist" className="w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700" />
              <label className="flex items-start gap-2 text-xs text-ink-600 dark:text-paper-200/70">
                <input type="checkbox" checked={rightsConfirmed} onChange={(e) => setRightsConfirmed(e.target.checked)} className="mt-0.5" />
                I own the rights to this audio, or it is royalty-free / licensed for this use.
              </label>
              <button
                onClick={submitUpload}
                disabled={!file || !title.trim() || !rightsConfirmed || uploading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal-500 py-2.5 text-sm font-semibold text-white hover:bg-signal-600 disabled:opacity-50"
              >
                {uploading && <Spinner size={14} />} Upload and use
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog open={Boolean(pendingDelete)} title="Delete this track?" description="Posts already using it will keep playing it." confirmLabel="Delete" onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />
    </div>,
    document.body
  )
}
