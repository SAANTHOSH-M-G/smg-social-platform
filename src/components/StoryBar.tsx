import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { getStoryFeed, createStory } from '@/services/stories'
import type { StoryGroup } from '@/types'
import { StoryViewer } from './StoryViewer'
import { validateMediaFile, UploadValidationError } from '@/services/storage'

export function StoryBar() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [groups, setGroups] = useState<StoryGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!profile) return
    getStoryFeed(profile.id)
      .then(setGroups)
      .finally(() => setLoading(false))
  }, [profile])

  if (!profile) return null

  const myGroup = groups.find((g) => g.author.id === profile.id)

  const handleUpload = async (file: File) => {
    try {
      validateMediaFile(file)
      setUploading(true)
      await createStory(profile.id, file)
      const fresh = await getStoryFeed(profile.id)
      setGroups(fresh)
      showToast('Your story was posted', 'success')
    } catch (e) {
      showToast(e instanceof UploadValidationError ? e.message : 'Could not upload story', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border-b border-paper-200 bg-white px-3 py-4 dark:border-ink-700 dark:bg-ink-900 sm:rounded-2xl sm:border sm:px-4">
      <div className="no-scrollbar flex gap-4 overflow-x-auto">
        <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <button
            onClick={() => (myGroup ? setViewerIndex(groups.findIndex((g) => g.author.id === profile.id)) : fileInputRef.current?.click())}
            disabled={uploading}
            className="relative"
          >
            <Avatar src={profile.avatar_url} name={profile.full_name || profile.username} size="lg" ring={Boolean(myGroup)} />
            {!myGroup && (
              <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-signal-500 text-white ring-2 ring-white dark:ring-ink-900">
                <Plus size={13} strokeWidth={3} />
              </span>
            )}
          </button>
          <span className="w-full truncate text-center text-xs text-ink-700 dark:text-paper-200/80">Your story</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
              e.target.value = ''
            }}
          />
        </div>

        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <div className="skeleton h-14 w-14 rounded-full" />
              <div className="skeleton h-2.5 w-10 rounded" />
            </div>
          ))}

        {groups
          .filter((g) => g.author.id !== profile.id)
          .map((group) => (
            <button
              key={group.author.id}
              onClick={() => setViewerIndex(groups.findIndex((g) => g.author.id === group.author.id))}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
            >
              <Avatar
                src={group.author.avatar_url}
                name={group.author.full_name || group.author.username}
                size="lg"
                ring
                className={clsx(!group.hasUnseen && '[&>div]:story-ring-seen')}
              />
              <span className="w-full truncate text-center text-xs text-ink-700 dark:text-paper-200/80">{group.author.username}</span>
            </button>
          ))}
      </div>

      {viewerIndex !== null && (
        <StoryViewer
          groups={groups}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onGroupsChange={setGroups}
        />
      )}
    </div>
  )
}
