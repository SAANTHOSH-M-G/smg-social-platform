import { supabase } from '@/lib/supabase'
import type { Comment } from '@/types'

const COMMENT_SELECT = 'id, post_id, user_id, parent_comment_id, content, like_count, created_at, author:profiles!comments_user_id_fkey(*)'

export async function getComments(postId: string, viewerId?: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const flat = (data ?? []) as unknown as Comment[]

  let likedSet = new Set<string>()
  if (viewerId && flat.length) {
    const { data: likes } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', viewerId)
      .in('comment_id', flat.map((c) => c.id))
    likedSet = new Set((likes ?? []).map((l) => l.comment_id))
  }

  const byId = new Map<string, Comment>()
  flat.forEach((c) => byId.set(c.id, { ...c, liked_by_me: likedSet.has(c.id), replies: [] }))

  const roots: Comment[] = []
  byId.forEach((c) => {
    if (c.parent_comment_id) {
      const parent = byId.get(c.parent_comment_id)
      parent?.replies?.push(c)
    } else {
      roots.push(c)
    }
  })
  return roots
}

export async function addComment(
  postId: string,
  userId: string,
  content: string,
  parentCommentId?: string
): Promise<Comment> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, user_id: userId, content, parent_comment_id: parentCommentId ?? null })
    .select(COMMENT_SELECT)
    .single()
  if (error) throw error

  const mentions = Array.from(new Set((content.match(/@[a-z0-9_.]+/gi) ?? []).map((m) => m.slice(1).toLowerCase())))
  if (mentions.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, username').in('username', mentions)
    if (profiles?.length) {
      await supabase.from('mentions').insert(
        profiles.map((p) => ({ comment_id: data.id, mentioned_by: userId, mentioned_user: p.id }))
      )
    }
  }
  return { ...(data as unknown as Comment), replies: [] }
}

export async function deleteComment(commentId: string, userId: string) {
  const { error } = await supabase.from('comments').delete().eq('id', commentId).eq('user_id', userId)
  if (error) throw error
}

export async function toggleCommentLike(commentId: string, userId: string, currentlyLiked: boolean) {
  if (currentlyLiked) {
    await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId)
  } else {
    await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId })
  }
}
