import { supabase } from '@/lib/supabase'
import type { Note, Profile } from '@/types'

const NOTE_SELECT = 'user_id, content, created_at, expires_at, author:profiles!notes_user_id_fkey(*)'

/** Notes from the current user + everyone they follow, newest first, unexpired only (also enforced by RLS). */
export async function getNotesFeed(viewerId: string): Promise<Note[]> {
  const { data: following } = await supabase.from('follows').select('following_id').eq('follower_id', viewerId)
  const authorIds = Array.from(new Set([viewerId, ...(following ?? []).map((f) => f.following_id)]))

  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_SELECT)
    .in('user_id', authorIds)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error

  const notes = (data ?? []) as unknown as Note[]
  // Own note first, like Instagram's "Your note" slot.
  notes.sort((a, b) => (a.user_id === viewerId ? -1 : b.user_id === viewerId ? 1 : 0))
  return notes
}

export async function upsertNote(userId: string, content: string): Promise<Note> {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('Write something for your note.')
  if (trimmed.length > 60) throw new Error('Notes are limited to 60 characters.')

  const { data, error } = await supabase
    .from('notes')
    .upsert(
      { user_id: userId, content: trimmed, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      { onConflict: 'user_id' }
    )
    .select(NOTE_SELECT)
    .single()
  if (error) throw error
  return data as unknown as Note
}

export async function deleteNote(userId: string) {
  const { error } = await supabase.from('notes').delete().eq('user_id', userId)
  if (error) throw error
}
