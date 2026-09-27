import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { isUsernameTaken } from '@/services/profiles'
import { uploadToBucket, validateMediaFile, UploadValidationError } from '@/services/storage'
import { BUCKETS } from '@/lib/supabase'
import { Spinner } from '@/components/Common'

export function EditProfilePage() {
  const { profile, updateProfile } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [website, setWebsite] = useState(profile?.website ?? '')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError] = useState('')

  if (!profile) return null

  const handleAvatarChange = async (file: File) => {
    try {
      validateMediaFile(file)
      setUploadingAvatar(true)
      const url = await uploadToBucket(BUCKETS.avatars, profile.id, file)
      setAvatarUrl(url)
    } catch (e) {
      showToast(e instanceof UploadValidationError ? e.message : 'Could not upload photo', 'error')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSave = async () => {
    setError('')
    const cleanUsername = username.trim().toLowerCase()
    if (!/^[a-z0-9_.]{3,30}$/.test(cleanUsername)) {
      setError('Username must be 3-30 characters: letters, numbers, dots or underscores.')
      return
    }
    setSaving(true)
    try {
      if (cleanUsername !== profile.username) {
        const taken = await isUsernameTaken(cleanUsername, profile.id)
        if (taken) {
          setError('That username is already taken.')
          setSaving(false)
          return
        }
      }
      await updateProfile({
        username: cleanUsername,
        full_name: fullName.trim(),
        bio: bio.trim(),
        website: website.trim(),
        avatar_url: avatarUrl,
      })
      showToast('Profile updated', 'success')
      navigate(`/${cleanUsername}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="font-display text-xl font-semibold">Edit profile</h1>

      <div className="mt-6 flex items-center gap-4">
        <Avatar src={avatarUrl} name={fullName || username} size="xl" />
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="flex items-center gap-2 rounded-lg bg-paper-100 px-4 py-2 text-sm font-semibold hover:bg-paper-200 dark:bg-ink-700 dark:hover:bg-ink-600"
          >
            {uploadingAvatar && <Spinner size={14} />} Change photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleAvatarChange(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <Field label="Full name" value={fullName} onChange={setFullName} />
        <Field label="Username" value={username} onChange={setUsername} />
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-paper-200">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={150}
            className="w-full resize-none rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
          />
          <p className="mt-1 text-right text-xs text-ink-400">{bio.length}/150</p>
        </div>
        <Field label="Website" value={website} onChange={setWebsite} placeholder="https://" />
        {error && <p className="text-sm font-medium text-ember-500">{error}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-signal-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-signal-600 disabled:opacity-60"
        >
          {saving && <Spinner size={16} />} Save changes
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-paper-200">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
      />
    </div>
  )
}
