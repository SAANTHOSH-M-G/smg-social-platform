import { useEffect, useMemo, useRef, useState } from 'react'
import { Image as ImageIcon, Type, X, Plus } from 'lucide-react'
import clsx from 'clsx'
import { Modal, Spinner } from './Common'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { createStory } from '@/services/stories'
import { UploadValidationError, validateMediaFile } from '@/services/storage'
import { renderTextStory, TEXT_STORY_BACKGROUNDS } from '@/utils/storyText'

const MAX_BATCH = 10

type Draft = { id: string; file: File; url: string; caption: string }

/**
 * Adds one or more stories without touching the existing active ones. Every
 * draft becomes its own `stories` row, so the viewer plays them in order.
 */
export function StoryComposer({
  open,
  onClose,
  onPosted,
  initialMode = 'media',
}: {
  open: boolean
  onClose: () => void
  onPosted: () => void
  initialMode?: 'media' | 'text'
}) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [mode, setMode] = useState<'media' | 'text'>(initialMode)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selected, setSelected] = useState(0)
  const [text, setText] = useState('')
  const [bg, setBg] = useState(0)
  const [posting, setPosting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftsRef = useRef<Draft[]>([])
  draftsRef.current = drafts

  // revoke every preview URL on close/unmount
  useEffect(
    () => () => {
      draftsRef.current.forEach((d) => URL.revokeObjectURL(d.url))
    },
    []
  )

  useEffect(() => {
    if (open) setMode(initialMode)
  }, [open, initialMode])

  const reset = () => {
    drafts.forEach((d) => URL.revokeObjectURL(d.url))
    setDrafts([])
    setSelected(0)
    setText('')
    setProgress(null)
  }

  const close = () => {
    if (posting) return
    reset()
    onClose()
  }

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    const next: Draft[] = []
    for (const file of Array.from(list)) {
      try {
        validateMediaFile(file)
        next.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), caption: '' })
      } catch (e) {
        showToast(`${file.name}: ${e instanceof UploadValidationError ? e.message : 'Invalid file'}`, 'error')
      }
    }
    const room = MAX_BATCH - drafts.length
    if (next.length > room) {
      next.slice(room).forEach((d) => URL.revokeObjectURL(d.url))
      showToast(`You can add up to ${MAX_BATCH} stories at once`, 'default')
    }
    setDrafts((prev) => [...prev, ...next.slice(0, room)])
  }

  const removeDraft = (id: string) => {
    setDrafts((prev) => {
      const target = prev.find((d) => d.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((d) => d.id !== id)
    })
    setSelected(0)
  }

  const current = drafts[Math.min(selected, drafts.length - 1)]
  const canPost = mode === 'text' ? text.trim().length > 0 : drafts.length > 0
  const gradientStyle = useMemo(() => {
    const [a, b] = TEXT_STORY_BACKGROUNDS[bg]
    return { backgroundImage: `linear-gradient(135deg, ${a}, ${b})` }
  }, [bg])

  const post = async () => {
    if (!profile || !canPost || posting) return
    setPosting(true)
    try {
      if (mode === 'text') {
        setProgress({ done: 0, total: 1 })
        await createStory(profile.id, await renderTextStory(text, bg))
      } else {
        // sequential on purpose: preserves order, so story 1 stays before story 2
        setProgress({ done: 0, total: drafts.length })
        for (let i = 0; i < drafts.length; i++) {
          await createStory(profile.id, drafts[i].file, drafts[i].caption.trim())
          setProgress({ done: i + 1, total: drafts.length })
        }
      }
      showToast(mode === 'media' && drafts.length > 1 ? `${drafts.length} stories added` : 'Added to your story', 'success')
      reset()
      onPosted()
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not upload story', 'error')
      // anything already uploaded is live; refresh so the bar reflects it
      onPosted()
    } finally {
      setPosting(false)
      setProgress(null)
    }
  }

  return (
    <Modal open={open} onClose={close} className="flex max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-none bg-white dark:bg-ink-900 sm:max-h-[90vh] sm:rounded-2xl">
      <div className="flex items-center justify-between border-b border-paper-200 px-4 py-3 dark:border-ink-700">
        <button onClick={close} aria-label="Close" className="rounded-full p-1 hover:bg-paper-100 dark:hover:bg-ink-800">
          <X size={20} />
        </button>
        <h2 className="text-sm font-semibold">Add to your story</h2>
        <button onClick={post} disabled={!canPost || posting} className="flex min-w-[48px] justify-end text-sm font-semibold text-signal-500 disabled:opacity-40">
          {posting ? <Spinner size={16} /> : 'Share'}
        </button>
      </div>

      <div className="grid grid-cols-2 border-b border-paper-200 text-sm font-semibold dark:border-ink-700" role="tablist">
        {(['media', 'text'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => !posting && setMode(m)}
            className={clsx('flex items-center justify-center gap-2 py-2.5', mode === m ? 'border-b-2 border-signal-500 text-signal-500' : 'text-ink-500')}
          >
            {m === 'media' ? <ImageIcon size={16} /> : <Type size={16} />} {m === 'media' ? 'Photo / video' : 'Text'}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {mode === 'media' && (
          <>
            {drafts.length === 0 ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-[9/14] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-paper-200 text-ink-500 hover:border-signal-400 dark:border-ink-700"
              >
                <ImageIcon size={40} strokeWidth={1.25} />
                <span className="text-sm font-medium">Choose photos or videos</span>
                <span className="text-xs">Select several to add multiple stories at once</span>
              </button>
            ) : (
              <>
                <div className="relative mx-auto flex aspect-[9/14] w-full max-w-[280px] items-center justify-center overflow-hidden rounded-xl bg-black">
                  {current.file.type.startsWith('video/') ? (
                    <video key={current.id} src={current.url} className="h-full w-full object-contain" muted loop autoPlay playsInline />
                  ) : (
                    <img src={current.url} alt="Story preview" className="h-full w-full object-contain" />
                  )}
                </div>
                <input
                  value={current.caption}
                  onChange={(e) => setDrafts((prev) => prev.map((d) => (d.id === current.id ? { ...d, caption: e.target.value.slice(0, 200) } : d)))}
                  placeholder="Add a caption…"
                  aria-label="Story caption"
                  className="mt-3 w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
                />
                <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                  {drafts.map((d, i) => (
                    <div key={d.id} className="relative shrink-0">
                      <button
                        onClick={() => setSelected(i)}
                        aria-label={`Preview story ${i + 1}`}
                        className={clsx('h-16 w-12 overflow-hidden rounded-lg bg-black ring-2', i === selected ? 'ring-signal-500' : 'ring-transparent')}
                      >
                        {d.file.type.startsWith('video/') ? <video src={d.url} className="h-full w-full object-cover" muted /> : <img src={d.url} alt="" className="h-full w-full object-cover" />}
                      </button>
                      <button
                        onClick={() => removeDraft(d.id)}
                        aria-label={`Remove story ${i + 1}`}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 text-white ring-2 ring-white dark:ring-ink-900"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {drafts.length < MAX_BATCH && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Add more"
                      className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-paper-200 text-ink-400 dark:border-ink-700"
                    >
                      <Plus size={18} />
                    </button>
                  )}
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              hidden
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </>
        )}

        {mode === 'text' && (
          <>
            <div style={gradientStyle} className="relative mx-auto flex aspect-[9/14] w-full max-w-[280px] items-center justify-center rounded-xl p-6">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 280))}
                placeholder="Type something…"
                aria-label="Story text"
                rows={5}
                className="w-full resize-none bg-transparent text-center font-display text-2xl font-bold text-white outline-none placeholder:text-white/60"
              />
            </div>
            <p className="mt-1 text-center text-xs text-ink-400">{text.length}/280</p>
            <div className="mt-2 flex justify-center gap-2">
              {TEXT_STORY_BACKGROUNDS.map(([a, b], i) => (
                <button
                  key={i}
                  onClick={() => setBg(i)}
                  aria-label={`Background ${i + 1}`}
                  style={{ backgroundImage: `linear-gradient(135deg, ${a}, ${b})` }}
                  className={clsx('h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-ink-900', i === bg ? 'ring-signal-500' : 'ring-transparent')}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {progress && progress.total > 1 && (
        <div className="border-t border-paper-200 px-4 py-2 text-center text-xs text-ink-500 dark:border-ink-700">
          Uploading {progress.done}/{progress.total}…
        </div>
      )}
    </Modal>
  )
}
