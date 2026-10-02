import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { getStoryFeed } from '@/services/stories'
import type { StoryGroup } from '@/types'
import { StoryViewer } from './StoryViewer'
import { StoryComposer } from './StoryComposer'

/** Drops stories whose expiry has passed (and groups left empty) without a refetch. */
function pruneExpired(groups: StoryGroup[]): StoryGroup[] {
  const now = Date.now()
  let changed = false
  const next = groups
    .map((g) => {
      const stories = g.stories.filter((s) => new Date(s.expires_at).getTime() > now)
      if (stories.length !== g.stories.length) changed = true
      return stories.length === g.stories.length ? g : { ...g, stories }
    })
    .filter((g) => g.stories.length > 0)
  return changed ? next : groups
}

export function StoryBar() {
  const { profile } = useAuth()
  const [groups, setGroups] = useState<StoryGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [viewer, setViewer] = useState<{ groupIndex: number; storyIndex: number } | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!profile) return
    try {
      setGroups(await getStoryFeed(profile.id))
    } catch {
      /* keep whatever we had; the bar is non-critical */
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // stories expire on the clock: hide them as they do, and re-sync every few minutes
  useEffect(() => {
    const prune = window.setInterval(() => setGroups((g) => pruneExpired(g)), 30_000)
    const sync = window.setInterval(() => void refresh(), 5 * 60_000)
    return () => {
      window.clearInterval(prune)
      window.clearInterval(sync)
    }
  }, [refresh])

  if (!profile) return null

  const myGroup = groups.find((g) => g.author.id === profile.id)

  const openGroup = (authorId: string) => {
    const groupIndex = groups.findIndex((g) => g.author.id === authorId)
    if (groupIndex === -1) return
    // resume at the first story you haven't seen, like a real story tray
    const firstUnseen = groups[groupIndex].stories.findIndex((s) => !s.seen_by_me)
    setViewer({ groupIndex, storyIndex: firstUnseen === -1 ? 0 : firstUnseen })
  }

  return (
    <div className="border-b border-paper-200 bg-white px-3 py-4 dark:border-ink-700 dark:bg-ink-900 sm:rounded-2xl sm:border sm:px-4">
      <div className="no-scrollbar flex gap-4 overflow-x-auto">
        <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <div className="relative">
            <button
              onClick={() => (myGroup ? openGroup(profile.id) : setComposerOpen(true))}
              aria-label={myGroup ? 'View your story' : 'Add to your story'}
              className="block"
            >
              <Avatar src={profile.avatar_url} name={profile.full_name || profile.username} size="lg" ring={Boolean(myGroup)} />
            </button>
            {/* always available, even while you already have active stories */}
            <button
              onClick={() => setComposerOpen(true)}
              aria-label="Add another story"
              title="Add to your story"
              className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-signal-500 text-white ring-2 ring-white hover:bg-signal-600 dark:ring-ink-900"
            >
              <Plus size={13} strokeWidth={3} />
            </button>
          </div>
          <span className="w-full truncate text-center text-xs text-ink-700 dark:text-paper-200/80">Your story</span>
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
            <button key={group.author.id} onClick={() => openGroup(group.author.id)} className="flex w-16 shrink-0 flex-col items-center gap-1.5" aria-label={`${group.author.username}'s story`}>
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

      {viewer && (
        <StoryViewer
          groups={groups}
          initialIndex={viewer.groupIndex}
          startStoryIndex={viewer.storyIndex}
          onClose={() => {
            setViewer(null)
            void refresh() // updates seen rings
          }}
          onGroupsChange={setGroups}
          onAddStory={() => {
            setViewer(null)
            setComposerOpen(true)
          }}
        />
      )}

      <StoryComposer open={composerOpen} onClose={() => setComposerOpen(false)} onPosted={() => void refresh()} />
    </div>
  )
}
