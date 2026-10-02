import { supabase } from '@/lib/supabase'
import type { FollowRequest, Profile } from '@/types'

export async function getFollowState(currentUserId: string, targetId: string) {
  const [{ data: follow }, { data: request }] = await Promise.all([
    supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', currentUserId)
      .eq('following_id', targetId)
      .maybeSingle(),
    supabase
      .from('follow_requests')
      .select('id, status')
      .eq('requester_id', currentUserId)
      .eq('target_id', targetId)
      .eq('status', 'pending')
      .maybeSingle(),
  ])
  return {
    isFollowing: Boolean(follow),
    hasPendingRequest: Boolean(request),
  }
}

export async function followOrRequest(currentUserId: string, target: Profile) {
  if (target.is_private) {
    const { error } = await supabase
      .from('follow_requests')
      .upsert({ requester_id: currentUserId, target_id: target.id, status: 'pending' }, { onConflict: 'requester_id,target_id' })
    if (error) throw error
    return { requested: true }
  }
  const { error } = await supabase.from('follows').insert({ follower_id: currentUserId, following_id: target.id })
  if (error) throw error
  return { requested: false }
}

export async function unfollow(currentUserId: string, targetId: string) {
  await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetId)
  await supabase.from('follow_requests').delete().eq('requester_id', currentUserId).eq('target_id', targetId)
}

export async function removeFollower(currentUserId: string, followerId: string) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', currentUserId)
  if (error) throw error
}

export async function getFollowers(userId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('profiles!follows_follower_id_fkey(*)')
    .eq('following_id', userId)
  if (error) throw error
  return ((data ?? []) as unknown as { profiles: Profile }[]).map((r) => r.profiles)
}

export async function getFollowing(userId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('profiles!follows_following_id_fkey(*)')
    .eq('follower_id', userId)
  if (error) throw error
  return ((data ?? []) as unknown as { profiles: Profile }[]).map((r) => r.profiles)
}

export async function getPendingFollowRequests(userId: string): Promise<FollowRequest[]> {
  const { data, error } = await supabase
    .from('follow_requests')
    .select('*, requester:profiles!follow_requests_requester_id_fkey(*)')
    .eq('target_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as FollowRequest[]
}

export async function respondToFollowRequest(requestId: string, accept: boolean) {
  const { error } = await supabase
    .from('follow_requests')
    .update({ status: accept ? 'accepted' : 'rejected' })
    .eq('id', requestId)
  if (error) throw error
}
