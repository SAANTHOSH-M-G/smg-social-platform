import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('username', username).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function isUsernameTaken(username: string, excludeId?: string) {
  let query = supabase.from('profiles').select('id').eq('username', username)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export interface UpdateProfileInput {
  full_name?: string
  username?: string
  bio?: string
  website?: string
  avatar_url?: string
  is_private?: boolean
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const { data, error } = await supabase.from('profiles').update(input).eq('id', userId).select('*').single()
  if (error) throw error
  return data as Profile
}

export async function searchProfiles(query: string, limit = 20): Promise<Profile[]> {
  if (!query.trim()) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function getSuggestedProfiles(currentUserId: string, limit = 6): Promise<Profile[]> {
  const { data: alreadyFollowing } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', currentUserId)
  const excludeIds = new Set([currentUserId, ...(alreadyFollowing ?? []).map((f) => f.following_id)])

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('followers_count', { ascending: false })
    .limit(limit + excludeIds.size)
  if (error) throw error
  return ((data ?? []) as Profile[]).filter((p) => !excludeIds.has(p.id)).slice(0, limit)
}
