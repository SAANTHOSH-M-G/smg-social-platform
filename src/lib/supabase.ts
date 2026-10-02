import { createClient } from '@supabase/supabase-js'

// NOTE: We intentionally use the untyped `createClient` here rather than
// `createClient<Database>`. Supabase's generated-types generic requires each
// table to also carry a `Relationships` array for its foreign-key join
// typing; our hand-authored `src/types/database.ts` documents the schema
// shape for humans, but wiring it through the generic causes the client to
// collapse every query to `never` (see `supabase gen types typescript` docs).
// Once you generate real types from your live project
// (`supabase gen types typescript --project-id <ref>`), you can safely swap
// this back to `createClient<Database>(...)`. Runtime behavior is unaffected
// either way — this only changes compile-time autocomplete/safety.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[SMG] Missing Supabase environment variables. Copy .env.example to .env and fill in your project credentials.'
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})

export const BUCKETS = {
  avatars: 'avatars',
  posts: 'posts',
  stories: 'stories',
  messages: 'messages',
} as const
