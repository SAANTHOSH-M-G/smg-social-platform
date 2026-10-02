import { supabase } from '@/lib/supabase'
import type { AppNotification } from '@/types'

const NOTIFICATION_SELECT = `
  id, recipient_id, actor_id, type, post_id, comment_id, story_id, is_read, created_at,
  actor:profiles!notifications_actor_id_fkey(*),
  post:posts!notifications_post_id_fkey(id, is_reel, cover_url, media:post_media(*)),
  story:stories!notifications_story_id_fkey(id, media_url, media_type)
`

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as unknown as AppNotification[]
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false)
  if (error) throw error
  return count ?? 0
}

export async function markAllRead(userId: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', userId).eq('is_read', false)
}

export async function markOneRead(id: string) {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}

export function subscribeToNotifications(userId: string, onInsert: () => void) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
      () => onInsert()
    )
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}
