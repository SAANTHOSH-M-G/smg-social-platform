import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export interface HashtagResult {
  tag: string
  post_count: number
}

export async function searchAll(query: string) {
  const trimmed = query.trim()
  if (!trimmed) return { users: [] as Profile[], hashtags: [] as HashtagResult[] }

  const isHashtag = trimmed.startsWith('#')
  const term = isHashtag ? trimmed.slice(1) : trimmed

  const [{ data: users }, { data: tags }] = await Promise.all([
    isHashtag
      ? Promise.resolve({ data: [] as Profile[] })
      : supabase.from('profiles').select('*').or(`username.ilike.%${term}%,full_name.ilike.%${term}%`).limit(15),
    supabase.from('hashtags').select('id, tag, post_hashtags(count)').ilike('tag', `%${term}%`).limit(10),
  ])

  const hashtags: HashtagResult[] = (
    (tags ?? []) as unknown as { tag: string; post_hashtags: { count: number }[] }[]
  ).map((t) => ({ tag: t.tag, post_count: t.post_hashtags?.[0]?.count ?? 0 }))

  return { users: (users ?? []) as Profile[], hashtags }
}

const RECENT_KEY = 'smg.recent_searches'

export function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function pushRecentSearch(term: string) {
  const current = getRecentSearches().filter((t) => t !== term)
  const next = [term, ...current].slice(0, 8)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY)
}

export function removeRecentSearch(term: string) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(getRecentSearches().filter((t) => t !== term)))
}
