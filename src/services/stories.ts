import { supabase } from '@/lib/supabase'
import { BUCKETS } from '@/lib/supabase'
import type { Profile, StoryGroup, StoryItem } from '@/types'
import { uploadToBucket, deleteFromPublicUrl } from './storage'
import { getOrCreateDirectConversation, sendTextMessage } from './messages'

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

  const nowMs = Date.now()
  const raw = ((stories ?? []) as unknown as (StoryItem & { author: Profile })[]).filter((s) => new Date(s.expires_at).getTime() > nowMs)
  const storyIds = raw.map((s) => s.id)
  const [{ data: views }, { data: likes }] = await Promise.all([
    supabase.from('story_views').select('story_id').eq('user_id', viewerId),
    storyIds.length
      ? supabase.from('story_likes').select('story_id').eq('user_id', viewerId).in('story_id', storyIds)
      : Promise.resolve({ data: [] as { story_id: string }[] }),
  ])
  const seenSet = new Set((views ?? []).map((v) => v.story_id))
  const likedSet = new Set((likes ?? []).map((l) => l.story_id))
  raw.forEach((s) => {
    s.liked_by_me = likedSet.has(s.id)
    // your own stories never show as "unseen" for yourself
    s.seen_by_me = s.user_id === viewerId || seenSet.has(s.id)
  })

  const groupMap = new Map<string, StoryGroup>()
  raw.forEach((s) => {
    const existing = groupMap.get(s.user_id)
    const group = existing ?? { author: s.author, stories: [], hasUnseen: false }
    group.stories.push(s)
    if (!s.seen_by_me) group.hasUnseen = true
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

/**
 * Always INSERTs a new row - there is no per-user uniqueness on `stories`, so
 * adding a story never replaces or hides the ones that are still active.
 */
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

/** Used by shared /story/:id links. RLS naturally returns nothing if the viewer isn't allowed to see it (expired, private account not followed, etc). */
export async function getStoryGroupForStory(storyId: string, viewerId: string): Promise<StoryGroup | null> {
  const { data: story, error } = await supabase
    .from('stories')
    .select('*, author:profiles!stories_user_id_fkey(*)')
    .eq('id', storyId)
    .maybeSingle()
  if (error) throw error
  if (!story) return null
  const allGroups = await getStoryFeed(viewerId)
  return allGroups.find((g) => g.author.id === (story as unknown as { user_id: string }).user_id) ?? null
}

export async function deleteStory(storyId: string, userId: string) {
  const { data: story } = await supabase.from('stories').select('media_url').eq('id', storyId).eq('user_id', userId).maybeSingle()
  const { error } = await supabase.from('stories').delete().eq('id', storyId).eq('user_id', userId)
  if (error) throw error
  await deleteFromPublicUrl(BUCKETS.stories, story?.media_url)
}

export async function toggleStoryLike(storyId: string, userId: string, currentlyLiked: boolean) {
  if (currentlyLiked) {
    const { error } = await supabase.from('story_likes').delete().eq('story_id', storyId).eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('story_likes').insert({ story_id: storyId, user_id: userId })
    if (error) throw error
  }
}

/**
 * "Replying" to a story is, deliberately, a private DM — exactly how
 * Instagram's own story replies work — rather than a public comment thread.
 * Reuses the existing conversations/messages tables instead of adding a
 * parallel comment system for stories.
 */
export async function replyToStory(storyId: string, fromUserId: string, toUserId: string, text: string) {
  const conversationId = await getOrCreateDirectConversation(fromUserId, toUserId)
  const url = `${window.location.origin}/story/${storyId}`
  await sendTextMessage(conversationId, fromUserId, `Replied to your story: ${text.trim()}\n${url}`)
  return conversationId
}
