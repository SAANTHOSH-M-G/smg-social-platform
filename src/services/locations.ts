import { supabase } from '@/lib/supabase'

/**
 * Lightweight "search/select" location field backed by locations other
 * people have already typed into posts, rather than a third-party geocoding
 * API (which would need its own API key/billing) or silently reading the
 * browser's GPS position. The person always types and explicitly picks —
 * nothing is collected automatically.
 */
export async function searchLocations(query: string, limit = 6): Promise<string[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const { data, error } = await supabase
    .from('posts')
    .select('location')
    .ilike('location', `%${trimmed}%`)
    .not('location', 'eq', '')
    .limit(50)
  if (error) throw error
  const unique = Array.from(new Set((data ?? []).map((r) => r.location).filter(Boolean)))
  return unique.slice(0, limit)
}
