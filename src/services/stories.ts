import { supabase } from '@/lib/supabase'
import { BUCKETS } from '@/lib/supabase'
import type { Profile, StoryGroup, StoryItem } from '@/types'
import { uploadToBucket } from './storage'

export async function getStoryFeed(viewerId: string): Promise<StoryGroup[]> {
  const { data: following } = await supabase.from('follows').select('following_id').eq('follower_id', viewerId)
  const authorIds = Array.from(new Set([viewerId, ...(following ?? []).map((f) => f.following_id)]))

  const { data: stories, error } = await supabase
    .from('stories')
    .select('*, author:profiles!stories_user_id_fkey(*)')
    .in('user_id', authorIds)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
  if (error) throw error

  const raw = (stories ?? []) as unknown as (StoryItem & { author: Profile })[]
  const { data: views } = await supabase.from('story_views').select('story_id').eq('user_id', viewerId)
  const seenSet = new Set((views ?? []).map((v) => v.story_id))

  const groupMap = new Map<string, StoryGroup>()
  raw.forEach((s) => {
    const existing = groupMap.get(s.user_id)
    const group = existing ?? { author: s.author, stories: [], hasUnseen: false }
    group.stories.push(s)
    if (!seenSet.has(s.id)) group.hasUnseen = true
    groupMap.set(s.user_id, group)
  })

  // current user's own story bubble first, then unseen, then seen, ordered by recency
  const groups = Array.from(groupMap.values())
  groups.sort((a, b) => {
    if (a.author.id === viewerId) return -1
    if (b.author.id === viewerId) return 1
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1
    return 0
  })
  return groups
}

export async function createStory(userId: string, file: File, caption = ''): Promise<StoryItem> {
  const url = await uploadToBucket(BUCKETS.stories, userId, file)
  const mediaType = file.type.startsWith('video/') ? ('video' as const) : ('image' as const)
  const { data, error } = await supabase
    .from('stories')
    .insert({ user_id: userId, media_url: url, media_type: mediaType, caption })
    .select('*')
    .single()
  if (error) throw error
  return data as unknown as StoryItem
}

export async function markStoryViewed(storyId: string, userId: string) {
  await supabase.from('story_views').upsert({ story_id: storyId, user_id: userId }, { onConflict: 'story_id,user_id' })
}

export async function getStoryViewers(storyId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('story_views')
    .select('viewer:profiles!story_views_user_id_fkey(*)')
    .eq('story_id', storyId)
  if (error) throw error
  return ((data ?? []) as unknown as { viewer: Profile }[]).map((r) => r.viewer)
}

export async function deleteStory(storyId: string, userId: string) {
  await supabase.from('stories').delete().eq('id', storyId).eq('user_id', userId)
}
