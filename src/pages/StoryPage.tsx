import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getStoryGroupForStory } from '@/services/stories'
import { StoryViewer } from '@/components/StoryViewer'
import { Spinner } from '@/components/Common'
import type { StoryGroup } from '@/types'

export function StoryPage() {
  const { storyId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [group, setGroup] = useState<StoryGroup | null | undefined>(undefined)

  useEffect(() => {
    if (!storyId || !profile) return
    getStoryGroupForStory(storyId, profile.id).then(setGroup)
  }, [storyId, profile])

  if (group === undefined) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size={28} />
      </div>
    )
  }

  if (group === null) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="font-display text-lg font-semibold">Story not available</p>
        <p className="text-sm text-ink-500">It may have expired, been deleted, or you may not have permission to view it.</p>
      </div>
    )
  }

  const startIndex = Math.max(
    0,
    group.stories.findIndex((s) => s.id === storyId)
  )

  return (
    <StoryViewer
      groups={[group]}
      initialIndex={0}
      onClose={() => navigate(-1)}
      onGroupsChange={() => undefined}
      startStoryIndex={startIndex}
    />
  )
}
