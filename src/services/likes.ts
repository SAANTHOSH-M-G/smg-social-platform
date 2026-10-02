import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

/** People who liked a post or reel, newest first. RLS limits this to posts the viewer is allowed to see. */
export async function getPostLikers(postId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('post_likes')
    .select('created_at, user:profiles!post_likes_user_id_fkey(*)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return ((data ?? []) as unknown as { user: Profile }[]).map((r) => r.user).filter(Boolean)
}

export async function getNoteLikers(noteUserId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('note_likes')
    .select('created_at, user:profiles!note_likes_user_id_fkey(*)')
    .eq('note_user_id', noteUserId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as { user: Profile }[]).map((r) => r.user).filter(Boolean)
}

export async function hasLikedNote(noteUserId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from('note_likes').select('user_id').eq('note_user_id', noteUserId).eq('user_id', userId).maybeSingle()
  return Boolean(data)
}

export async function toggleNoteLike(noteUserId: string, userId: string, currentlyLiked: boolean) {
  const q = currentlyLiked
    ? supabase.from('note_likes').delete().eq('note_user_id', noteUserId).eq('user_id', userId)
    : supabase.from('note_likes').insert({ note_user_id: noteUserId, user_id: userId })
  const { error } = await q
  if (error) throw error
}
