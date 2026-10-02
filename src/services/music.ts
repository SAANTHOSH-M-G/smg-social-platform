import { supabase, BUCKETS } from '@/lib/supabase'
import type { AudioTrack } from '@/types'
import { uploadToBucket, deleteFromPublicUrl, validateAudioFile, UploadValidationError } from './storage'

/**
 * Music catalogue abstraction. Today the only provider is our own `audio_tracks`
 * table (curated royalty-free rows + the signed-in user's uploads, filtered by
 * RLS). A licensed third-party catalogue can be added later by implementing
 * `MusicProvider` and adding it to `providers` - the picker, posts and the reel
 * player only ever see `AudioTrack`.
 */
export interface MusicProvider {
  search(query: string): Promise<AudioTrack[]>
}

const TRACK_COLUMNS = 'id, owner_id, title, artist, audio_url, duration_seconds, license, source, is_public, created_at'

const supabaseCatalog: MusicProvider = {
  async search(query) {
    // PostgREST filter syntax uses , ( ) and LIKE uses % * - strip them from user input
    const term = query.replace(/[,()%*\\]/g, ' ').trim()
    let q = supabase.from('audio_tracks').select(TRACK_COLUMNS).order('created_at', { ascending: false }).limit(60)
    if (term) q = q.or(`title.ilike.%${term}%,artist.ilike.%${term}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as AudioTrack[]
  },
}

const providers: MusicProvider[] = [supabaseCatalog]

export async function searchMusic(query: string): Promise<{ library: AudioTrack[]; mine: AudioTrack[] }> {
  const results = (await Promise.all(providers.map((p) => p.search(query)))).flat()
  return {
    library: results.filter((t) => t.source === 'library').sort((a, b) => a.title.localeCompare(b.title)),
    mine: results.filter((t) => t.source === 'upload'),
  }
}

export function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const done = (value: number | null) => {
      URL.revokeObjectURL(url)
      audio.removeAttribute('src')
      resolve(value)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => done(isFinite(audio.duration) ? Math.max(1, Math.round(audio.duration)) : null)
    audio.onerror = () => done(null)
    audio.src = url
  })
}

export async function uploadTrack(userId: string, file: File, meta: { title: string; artist: string }): Promise<AudioTrack> {
  validateAudioFile(file)
  const title = meta.title.trim().slice(0, 100)
  if (!title) throw new UploadValidationError('Give your track a title.')
  const duration = await readAudioDuration(file)
  if (duration === null) throw new UploadValidationError("This audio file couldn't be read. Try another file.")

  const url = await uploadToBucket(BUCKETS.audio, userId, file, validateAudioFile)
  const { data, error } = await supabase
    .from('audio_tracks')
    .insert({
      owner_id: userId,
      title,
      artist: meta.artist.trim().slice(0, 100),
      audio_url: url,
      duration_seconds: duration,
      mime_type: file.type,
      size_bytes: file.size,
      license: 'user-owned',
      source: 'upload',
      is_public: false,
    })
    .select(TRACK_COLUMNS)
    .single()
  if (error) {
    await deleteFromPublicUrl(BUCKETS.audio, url) // don't leave an orphaned file behind
    throw error
  }
  return data as AudioTrack
}

export async function deleteTrack(track: AudioTrack) {
  const { error } = await supabase.from('audio_tracks').delete().eq('id', track.id)
  if (error) throw error
  // Only remove the file when no post still plays it; otherwise those posts would go silent.
  const { count } = await supabase.from('posts').select('id', { count: 'exact', head: true }).eq('audio_url', track.audio_url)
  if (!count) await deleteFromPublicUrl(BUCKETS.audio, track.audio_url)
}
