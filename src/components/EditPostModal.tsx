import { useEffect, useRef, useState } from 'react'
import { MapPin, Music2, Users, X } from 'lucide-react'
import { Modal, Spinner } from './Common'
import { Avatar } from './Avatar'
import { AudioTrackPlayer } from './AudioTrackPlayer'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useDebounce } from '@/hooks/useDebounce'
import { updatePost } from '@/services/posts'
import { searchProfiles } from '@/services/profiles'
import { searchLocations } from '@/services/locations'
import { UploadValidationError, validateAudioFile } from '@/services/storage'
import type { Post, Profile } from '@/types'

export function EditPostModal({ post, open, onClose, onSaved }: { post: Post; open: boolean; onClose: () => void; onSaved: (post: Post) => void }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [caption, setCaption] = useState(post.caption)
  const [location, setLocation] = useState(post.location)
  const [audioTitle, setAudioTitle] = useState(post.audio_title)
  const [taggedUsers, setTaggedUsers] = useState<Profile[]>(post.tagged_users ?? [])
  const [tagQuery, setTagQuery] = useState('')
  const [tagResults, setTagResults] = useState<Profile[]>([])
  const [locationResults, setLocationResults] = useState<string[]>([])
  const [audioUrl, setAudioUrl] = useState<string | null>(post.audio_url)
  const [newAudioFile, setNewAudioFile] = useState<File | null>(null)
  const [audioRemoved, setAudioRemoved] = useState(false)
  const [saving, setSaving] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const debouncedTagQuery = useDebounce(tagQuery, 250)
  const debouncedLocation = useDebounce(location, 250)

  useEffect(() => {
    if (!open) return
    setCaption(post.caption)
    setLocation(post.location)
    setAudioTitle(post.audio_title)
    setTaggedUsers(post.tagged_users ?? [])
    setAudioUrl(post.audio_url)
    setNewAudioFile(null)
    setAudioRemoved(false)
  }, [open, post])

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

  const handleAudioSelect = (file?: File) => {
    if (!file) return
    try {
      validateAudioFile(file)
      setNewAudioFile(file)
      setAudioRemoved(false)
    } catch (e) {
      showToast(e instanceof UploadValidationError ? e.message : 'Invalid audio file', 'error')
    }
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const updated = await updatePost(
        post.id,
        profile.id,
        {
          caption,
          location,
          audioTitle,
          taggedUserIds: taggedUsers.map((u) => u.id),
          audioFile: newAudioFile ?? (audioRemoved ? null : undefined),
        },
        profile.id
      )
      onSaved(updated)
      showToast('Post updated', 'success')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update post', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit post" className="w-full max-w-md overflow-hidden rounded-none bg-white dark:bg-ink-900 sm:rounded-2xl">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          placeholder="Write a caption..."
          className="w-full resize-none rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
        />

        <div>
          <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-paper-200">
            <MapPin size={16} /> Location
          </label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Search for a location"
            className="w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
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
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-paper-200">
            <Music2 size={16} /> Music
          </label>
          {newAudioFile || (audioUrl && !audioRemoved) ? (
            <div className="space-y-2">
              {newAudioFile ? (
                <p className="text-xs text-ink-500">New track selected: {newAudioFile.name}</p>
              ) : (
                audioUrl && <AudioTrackPlayer url={audioUrl} title={audioTitle} compact />
              )}
              <input
                value={audioTitle}
                onChange={(e) => setAudioTitle(e.target.value)}
                placeholder="Track title"
                className="w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
              />
              <button
                onClick={() => {
                  setNewAudioFile(null)
                  setAudioRemoved(true)
                }}
                className="text-xs font-semibold text-ember-500"
              >
                Remove track
              </button>
            </div>
          ) : (
            <button
              onClick={() => audioInputRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-paper-200 p-2.5 text-sm text-ink-500 hover:border-signal-400 dark:border-ink-700"
            >
              <Music2 size={16} /> Add a track you own the rights to
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
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-paper-200">
            <Users size={16} /> Tagged people
          </label>
          <input
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            placeholder="Search people to tag"
            className="w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
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
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-paper-200 p-3 dark:border-ink-700">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-paper-100 dark:hover:bg-ink-800">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-signal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-signal-600 disabled:opacity-60"
        >
          {saving && <Spinner size={14} />} Save
        </button>
      </div>
    </Modal>
  )
}
