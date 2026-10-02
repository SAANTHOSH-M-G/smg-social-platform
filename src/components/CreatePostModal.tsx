import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, MapPin, Users, X, ChevronLeft, Music2, ImagePlus } from 'lucide-react'
import { Modal, Spinner } from './Common'
import { Avatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { createPost } from '@/services/posts'
import { searchProfiles } from '@/services/profiles'
import { searchLocations } from '@/services/locations'
import { UploadValidationError, validateMediaFile, validateAudioFile } from '@/services/storage'
import type { Profile } from '@/types'

type Step = 'select' | 'details'

export function CreatePostModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: () => void }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [step, setStep] = useState<Step>('select')
  const [files, setFiles] = useState<File[]>([])
  const [caption, setCaption] = useState('')
  const [location, setLocation] = useState('')
  const [locationResults, setLocationResults] = useState<string[]>([])
  const [tagQuery, setTagQuery] = useState('')
  const [taggedUsers, setTaggedUsers] = useState<Profile[]>([])
  const [tagResults, setTagResults] = useState<Profile[]>([])
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioTitle, setAudioTitle] = useState('')
  const [publishing, setPublishing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const debouncedTagQuery = useDebounce(tagQuery, 250)
  const debouncedLocation = useDebounce(location, 250)
  const isReel = files.length === 1 && files[0]?.type.startsWith('video/')

  useEffect(() => {
    if (!debouncedTagQuery.trim()) {
      setTagResults([])
      return
    }
    let cancelled = false
    searchProfiles(debouncedTagQuery).then((results) => {
      if (!cancelled) setTagResults(results.filter((r) => r.id !== profile?.id))
    })
    return () => {
      cancelled = true
    }
  }, [debouncedTagQuery, profile?.id])

  useEffect(() => {
    if (!debouncedLocation.trim()) {
      setLocationResults([])
      return
    }
    let cancelled = false
    searchLocations(debouncedLocation).then((results) => {
      if (!cancelled) setLocationResults(results.filter((r) => r.toLowerCase() !== debouncedLocation.toLowerCase()))
    })
    return () => {
      cancelled = true
    }
  }, [debouncedLocation])

  const reset = () => {
    setStep('select')
    setFiles([])
    setCaption('')
    setLocation('')
    setLocationResults([])
    setTaggedUsers([])
    setTagQuery('')
    setTagResults([])
    setCoverFile(null)
    setAudioFile(null)
    setAudioTitle('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSelect = (fileList: FileList | null) => {
    if (!fileList?.length) return
    try {
      const selected = Array.from(fileList).slice(0, 10)
      selected.forEach(validateMediaFile)
      setFiles(selected)
      setStep('details')
    } catch (e) {
      showToast(e instanceof UploadValidationError ? e.message : 'Invalid file', 'error')
    }
  }

  const handleCoverSelect = (file?: File) => {
    if (!file) return
    try {
      validateMediaFile(file)
      setCoverFile(file)
    } catch (e) {
      showToast(e instanceof UploadValidationError ? e.message : 'Invalid cover image', 'error')
    }
  }

  const handleAudioSelect = (file?: File) => {
    if (!file) return
    try {
      validateAudioFile(file)
      setAudioFile(file)
      if (!audioTitle) setAudioTitle(file.name.replace(/\.[^/.]+$/, ''))
    } catch (e) {
      showToast(e instanceof UploadValidationError ? e.message : 'Invalid audio file', 'error')
    }
  }

  const handlePublish = async () => {
    if (!profile) return
    setPublishing(true)
    try {
      await createPost({
        userId: profile.id,
        caption,
        location,
        isReel,
        files,
        taggedUserIds: taggedUsers.map((u) => u.id),
        coverFile: isReel && coverFile ? coverFile : undefined,
        audioFile: audioFile ?? undefined,
        audioTitle,
      })
      showToast('Your post was published', 'success')
      onCreated?.()
      handleClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not publish post', 'error')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} className="w-full max-w-2xl overflow-hidden rounded-none bg-white dark:bg-ink-900 sm:rounded-2xl">
      <div className="flex items-center justify-between border-b border-paper-200 px-4 py-3 dark:border-ink-700">
        {step === 'details' ? (
          <button onClick={() => setStep('select')} className="rounded-full p-1 hover:bg-paper-100 dark:hover:bg-ink-800">
            <ChevronLeft size={20} />
          </button>
        ) : (
          <span className="w-7" />
        )}
        <h2 className="text-sm font-semibold">{step === 'select' ? 'Create new post' : 'Write a caption'}</h2>
        {step === 'details' ? (
          <button onClick={handlePublish} disabled={publishing} className="text-sm font-semibold text-signal-500 disabled:opacity-50">
            {publishing ? <Spinner size={16} /> : 'Share'}
          </button>
        ) : (
          <button onClick={handleClose} className="rounded-full p-1 hover:bg-paper-100 dark:hover:bg-ink-800">
            <X size={20} />
          </button>
        )}
      </div>

      {step === 'select' && (
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-20">
          <ImageIcon size={64} strokeWidth={1} className="text-ink-300 dark:text-ink-600" />
          <p className="text-center text-ink-500 dark:text-paper-200/70">Drag photos and videos here, or select from your device</p>
          <button onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-signal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-signal-600">
            Select from device
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => handleSelect(e.target.files)} />
        </div>
      )}

      {step === 'details' && (
        <div className="grid gap-0 sm:grid-cols-2">
          <div className="no-scrollbar flex aspect-square gap-2 overflow-x-auto bg-black sm:aspect-auto sm:h-[480px]">
            {files.map((file, i) => (
              <div key={i} className="relative flex h-full w-full shrink-0 items-center justify-center">
                {file.type.startsWith('video/') ? (
                  <video src={URL.createObjectURL(file)} className="max-h-full max-w-full" muted playsInline />
                ) : (
                  <img src={URL.createObjectURL(file)} alt="" className="max-h-full max-w-full object-contain" />
                )}
              </div>
            ))}
          </div>

          <div className="flex max-h-[480px] flex-col overflow-y-auto p-4">
            <div className="mb-3 flex items-center gap-2">
              <Avatar src={profile?.avatar_url} name={profile?.full_name || profile?.username || ''} size="sm" />
              <span className="text-sm font-semibold">{profile?.username}</span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption... use #hashtags and @mentions"
              rows={4}
              className="w-full resize-none rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
            />

            <label className="mt-4 flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-paper-200">
              <MapPin size={18} /> Location
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Search for a location (never uses your GPS)"
              className="mt-1.5 w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
            />
            {location && locationResults.length > 0 && (
              <div className="mt-1.5 space-y-1 rounded-lg border border-paper-200 p-1.5 dark:border-ink-700">
                {locationResults.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => {
                      setLocation(loc)
                      setLocationResults([])
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper-50 dark:hover:bg-ink-800"
                  >
                    <MapPin size={14} className="text-ink-400" /> {loc}
                  </button>
                ))}
              </div>
            )}

            <label className="mt-4 flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-paper-200">
              <Users size={18} /> Tag people
            </label>
            <input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Search people to tag"
              className="mt-1.5 w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
            />
            {tagQuery && tagResults.length > 0 && (
              <div className="mt-1.5 space-y-1 rounded-lg border border-paper-200 p-1.5 dark:border-ink-700">
                {tagResults
                  .filter((r) => !taggedUsers.some((t) => t.id === r.id))
                  .map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setTaggedUsers([...taggedUsers, r])
                        setTagQuery('')
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper-50 dark:hover:bg-ink-800"
                    >
                      <Avatar src={r.avatar_url} name={r.full_name || r.username} size="xs" />
                      {r.username}
                    </button>
                  ))}
              </div>
            )}
            {taggedUsers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {taggedUsers.map((t) => (
                  <span key={t.id} className="flex items-center gap-1 rounded-full bg-paper-100 px-2.5 py-1 text-xs font-medium dark:bg-ink-800">
                    {t.username}
                    <button onClick={() => setTaggedUsers(taggedUsers.filter((x) => x.id !== t.id))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <label className="mt-4 flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-paper-200">
              <Music2 size={18} /> Music
            </label>
            {audioFile ? (
              <div className="mt-1.5 flex items-center justify-between rounded-lg border border-paper-200 p-2.5 dark:border-ink-700">
                <input
                  value={audioTitle}
                  onChange={(e) => setAudioTitle(e.target.value)}
                  placeholder="Track title"
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                <button onClick={() => setAudioFile(null)} className="ml-2 shrink-0 text-ink-400 hover:text-ember-500">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => audioInputRef.current?.click()}
                className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-dashed border-paper-200 p-2.5 text-sm text-ink-500 hover:border-signal-400 dark:border-ink-700"
              >
                <Music2 size={16} /> Add a track you own the rights to (MP3, M4A, WAV)
              </button>
            )}
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                handleAudioSelect(e.target.files?.[0])
                e.target.value = ''
              }}
            />

            {isReel && (
              <>
                <label className="mt-4 flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-paper-200">
                  <ImagePlus size={18} /> Cover image
                </label>
                {coverFile ? (
                  <div className="mt-1.5 flex items-center gap-3">
                    <img src={URL.createObjectURL(coverFile)} alt="" className="h-14 w-14 rounded-md object-cover" />
                    <button onClick={() => setCoverFile(null)} className="text-xs font-semibold text-ember-500">
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => coverInputRef.current?.click()}
                    className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-dashed border-paper-200 p-2.5 text-sm text-ink-500 hover:border-signal-400 dark:border-ink-700"
                  >
                    <ImagePlus size={16} /> Choose a cover (or we'll grab one from your video)
                  </button>
                )}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    handleCoverSelect(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <p className="mt-4 rounded-lg bg-signal-50 px-3 py-2 text-xs text-signal-700 dark:bg-ink-800 dark:text-signal-300">
                  This video will be published to Reels.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
