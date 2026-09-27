import { supabase } from '@/lib/supabase'
import type { Post, PostMedia } from '@/types'
import { uploadToBucket, getImageDimensions } from './storage'
import { BUCKETS } from '@/lib/supabase'

const POST_SELECT = `
  id, user_id, caption, location, is_reel, audio_title, like_count, comment_count, created_at,
  author:profiles!posts_user_id_fkey(*),
  media:post_media(*)
`

type RawPost = Omit<Post, 'liked_by_me' | 'saved_by_me' | 'media'> & { media: PostMedia[] }

async function attachViewerState(posts: RawPost[], viewerId?: string): Promise<Post[]> {
  if (!viewerId || posts.length === 0) {
    return posts.map((p) => ({ ...p, media: sortMedia(p.media), liked_by_me: false, saved_by_me: false }))
  }
  const postIds = posts.map((p) => p.id)
  const [{ data: likes }, { data: saves }] = await Promise.all([
    supabase.from('post_likes').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
    supabase.from('saved_posts').select('post_id').eq('user_id', viewerId).in('post_id', postIds),
  ])
  const likedSet = new Set((likes ?? []).map((l) => l.post_id))
  const savedSet = new Set((saves ?? []).map((s) => s.post_id))
  return posts.map((p) => ({
    ...p,
    media: sortMedia(p.media),
    liked_by_me: likedSet.has(p.id),
    saved_by_me: savedSet.has(p.id),
  }))
}

function sortMedia(media: PostMedia[]) {
  return [...(media ?? [])].sort((a, b) => a.position - b.position)
}

export async function getFeed(viewerId: string, page = 0, pageSize = 6): Promise<Post[]> {
  const { data: following } = await supabase.from('follows').select('following_id').eq('follower_id', viewerId)
  const followingIds = (following ?? []).map((f) => f.following_id)
  const authorIds = [...followingIds, viewerId]

  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('is_reel', false)
    .in('user_id', authorIds.length ? authorIds : [viewerId])
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  let posts = (data ?? []) as unknown as RawPost[]

  // Backfill with suggested/public posts if the followed feed is thin (new users).
  if (posts.length < pageSize && page === 0) {
    const { data: extra } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('is_reel', false)
      .not('user_id', 'in', `(${authorIds.join(',') || viewerId})`)
      .order('like_count', { ascending: false })
      .limit(pageSize - posts.length)
    posts = [...posts, ...(((extra ?? []) as unknown) as RawPost[])]
  }

  return attachViewerState(posts, viewerId)
}

export async function getExploreGrid(viewerId: string, page = 0, pageSize = 24): Promise<Post[]> {
  const from = page * pageSize
  const to = from + pageSize - 1
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .order('like_count', { ascending: false })
    .range(from, to)
  if (error) throw error
  return attachViewerState((data ?? []) as unknown as RawPost[], viewerId)
}

export async function getReelsFeed(viewerId: string, page = 0, pageSize = 10): Promise<Post[]> {
  const from = page * pageSize
  const to = from + pageSize - 1
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('is_reel', true)
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) throw error
  return attachViewerState((data ?? []) as unknown as RawPost[], viewerId)
}

export async function getUserPosts(userId: string, viewerId: string | undefined, isReel = false): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('user_id', userId)
    .eq('is_reel', isReel)
    .order('created_at', { ascending: false })
  if (error) throw error
  return attachViewerState((data ?? []) as unknown as RawPost[], viewerId)
}

export async function getSavedPosts(userId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('saved_posts')
    .select(`post:posts!saved_posts_post_id_fkey(${POST_SELECT})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const posts = ((data ?? []) as unknown as { post: RawPost }[]).map((r) => r.post)
  return attachViewerState(posts, userId)
}

export async function getPostById(postId: string, viewerId?: string): Promise<Post | null> {
  const { data, error } = await supabase.from('posts').select(POST_SELECT).eq('id', postId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const [withState] = await attachViewerState([data as unknown as RawPost], viewerId)
  return withState
}

export interface CreatePostInput {
  userId: string
  caption: string
  location: string
  isReel: boolean
  audioTitle?: string
  files: File[]
  taggedUserIds?: string[]
}

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[a-z0-9_]+/gi) ?? []
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())))
}

function extractMentionUsernames(caption: string): string[] {
  const matches = caption.match(/@[a-z0-9_.]+/gi) ?? []
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())))
}

export async function createPost(input: CreatePostInput): Promise<Post> {
  const { userId, caption, location, isReel, audioTitle, files, taggedUserIds } = input
  if (files.length === 0) throw new Error('At least one photo or video is required.')

  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert({ user_id: userId, caption, location, is_reel: isReel, audio_title: audioTitle ?? '' })
    .select('*')
    .single()
  if (postError) throw postError

  const uploaded = await Promise.all(
    files.map(async (file, index) => {
      const bucket = isReel || file.type.startsWith('video/') ? BUCKETS.posts : BUCKETS.posts
      const url = await uploadToBucket(bucket, userId, file)
      const dims = await getImageDimensions(file)
      return {
        post_id: post.id,
        media_url: url,
        media_type: file.type.startsWith('video/') ? ('video' as const) : ('image' as const),
        position: index,
        width: dims.width || null,
        height: dims.height || null,
      }
    })
  )
  const { error: mediaError } = await supabase.from('post_media').insert(uploaded)
  if (mediaError) throw mediaError

  if (taggedUserIds?.length) {
    await supabase.from('post_tagged_users').insert(taggedUserIds.map((uid) => ({ post_id: post.id, user_id: uid })))
  }

  const tags = extractHashtags(caption)
  if (tags.length) {
    for (const tag of tags) {
      const { data: existing } = await supabase.from('hashtags').select('id').eq('tag', tag).maybeSingle()
      const hashtagId =
        existing?.id ??
        (await supabase.from('hashtags').insert({ tag }).select('id').single()).data?.id
      if (hashtagId) {
        await supabase.from('post_hashtags').insert({ post_id: post.id, hashtag_id: hashtagId })
      }
    }
  }

  const mentions = extractMentionUsernames(caption)
  if (mentions.length) {
    const { data: mentionedProfiles } = await supabase.from('profiles').select('id, username').in('username', mentions)
    if (mentionedProfiles?.length) {
      await supabase.from('mentions').insert(
        mentionedProfiles.map((p) => ({ post_id: post.id, mentioned_by: userId, mentioned_user: p.id }))
      )
    }
  }

  const full = await getPostById(post.id, userId)
  if (!full) throw new Error('Post created but could not be reloaded.')
  return full
}

export async function toggleLike(postId: string, userId: string, currentlyLiked: boolean) {
  if (currentlyLiked) {
    const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId })
    if (error) throw error
  }
}

export async function toggleSave(postId: string, userId: string, currentlySaved: boolean) {
  if (currentlySaved) {
    const { error } = await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('saved_posts').insert({ post_id: postId, user_id: userId })
    if (error) throw error
  }
}

export async function deletePost(postId: string, userId: string) {
  const { error } = await supabase.from('posts').delete().eq('id', postId).eq('user_id', userId)
  if (error) throw error
}

export async function reportPost(reporterId: string, postId: string, reason: string) {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: reporterId, target_type: 'post', target_id: postId, reason })
  if (error) throw error
}
