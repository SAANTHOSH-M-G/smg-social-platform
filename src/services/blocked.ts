import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export async function getBlockedUsers(userId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked:profiles!blocked_users_blocked_id_fkey(*)')
    .eq('blocker_id', userId)
  if (error) throw error
  return ((data ?? []) as unknown as { blocked: Profile }[]).map((r) => r.blocked)
}

export async function blockUser(userId: string, targetId: string) {
  const { error } = await supabase.from('blocked_users').insert({ blocker_id: userId, blocked_id: targetId })
  if (error) throw error
  await supabase.from('follows').delete().eq('follower_id', targetId).eq('following_id', userId)
  await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId)
}

export async function unblockUser(userId: string, targetId: string) {
  const { error } = await supabase.from('blocked_users').delete().eq('blocker_id', userId).eq('blocked_id', targetId)
  if (error) throw error
}
