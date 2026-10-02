import { supabase } from '@/lib/supabase'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // 15MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024 // 100MB
const MAX_AUDIO_BYTES = 20 * 1024 * 1024 // 20MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg']
const ALLOWED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif']
const ALLOWED_VIDEO_EXT = ['mp4', 'webm', 'mov']
const ALLOWED_AUDIO_EXT = ['mp3', 'm4a', 'mp4', 'wav', 'ogg']

export class UploadValidationError extends Error {}

function extensionMatches(file: File, allowed: string[]) {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  return allowed.includes(ext)
}

export function validateMediaFile(file: File) {
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type)

  if (!isImage && !isVideo) {
    throw new UploadValidationError('Unsupported file type. Use JPG, PNG, WEBP, GIF, MP4, WEBM or MOV.')
  }
  // Generated files (canvas blobs, thumbnails) always carry a matching name; for
  // user files the extension must agree with the declared MIME type.
  if ((isImage && !extensionMatches(file, ALLOWED_IMAGE_EXT)) || (isVideo && !extensionMatches(file, ALLOWED_VIDEO_EXT))) {
    throw new UploadValidationError('File extension does not match its type.')
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    throw new UploadValidationError('Image is too large. Max size is 15MB.')
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new UploadValidationError('Video is too large. Max size is 100MB.')
  }
  return { mediaType: isVideo ? ('video' as const) : ('image' as const) }
}

/**
 * For the "bring your own audio" music feature: the person uploads a track
 * they own the rights to (or something royalty-free) rather than us
 * pretending a text field is a real music catalog, and rather than us
 * downloading/bundling any copyrighted music ourselves.
 */
export function validateAudioFile(file: File) {
  if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
    throw new UploadValidationError('Unsupported audio type. Use MP3, M4A, WAV, or OGG.')
  }
  if (!extensionMatches(file, ALLOWED_AUDIO_EXT)) {
    throw new UploadValidationError('Audio file extension must be .mp3, .m4a, .wav or .ogg.')
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new UploadValidationError('Audio file is too large. Max size is 20MB.')
  }
}

function extensionOf(file: File) {
  const parts = file.name.split('.')
  return (parts.length > 1 ? parts.pop() : file.type.split('/').pop()) ?? 'bin'
}

export async function uploadToBucket(
  bucket: string,
  userId: string,
  file: File,
  validate: (file: File) => void = validateMediaFile
) {
  validate(file)
  const path = `${userId}/${crypto.randomUUID()}.${extensionOf(file).toLowerCase()}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/** Uploads into a PRIVATE bucket and returns the storage path (there is no public URL for these). */
export async function uploadPrivateImage(bucket: string, userId: string, file: File) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type) || !extensionMatches(file, ALLOWED_IMAGE_EXT)) {
    throw new UploadValidationError('View-once only supports JPG, PNG, WEBP or GIF photos.')
  }
  if (file.size > MAX_IMAGE_BYTES) throw new UploadValidationError('Image is too large. Max size is 15MB.')
  const path = `${userId}/${crypto.randomUUID()}.${extensionOf(file).toLowerCase()}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '0', upsert: false, contentType: file.type })
  if (error) throw error
  return path
}

/**
 * Grabs a frame partway into a video file and returns it as a JPEG File,
 * so reels get a real thumbnail instead of a black box. Falls back to
 * throwing if the browser can't decode the video (caller should catch and
 * proceed without a cover rather than fail the whole upload).
 */
export function generateVideoThumbnail(file: File, atSeconds = 0.3): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(file)
    video.src = url

    const cleanup = () => URL.revokeObjectURL(url)

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(atSeconds, Math.max(video.duration - 0.1, 0))
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 720
        canvas.height = video.videoHeight || 1280
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas not supported')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (blob) => {
            cleanup()
            if (!blob) {
              reject(new Error('Could not generate thumbnail'))
              return
            }
            resolve(new File([blob], `${crypto.randomUUID()}-cover.jpg`, { type: 'image/jpeg' }))
          },
          'image/jpeg',
          0.85
        )
      } catch (err) {
        cleanup()
        reject(err)
      }
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('Could not read video for thumbnail'))
    }
  })
}

/**
 * Deletes the underlying Storage object behind a public URL we generated
 * ourselves (via uploadToBucket, which always puts files under
 * `${bucket}/{userId}/{uuid}.{ext}`). Used when a post/story/message is
 * deleted so files don't pile up orphaned in Storage forever. Safe to call
 * with URLs that aren't ours (e.g. nothing to delete) — it just no-ops.
 */
export async function deleteFromPublicUrl(bucket: string, publicUrl: string | null | undefined) {
  if (!publicUrl) return
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return
  const path = publicUrl.slice(idx + marker.length)
  if (!path) return
  try {
    await supabase.storage.from(bucket).remove([path])
  } catch {
    // Non-fatal: the DB row is already gone (or about to be), which is what
    // actually matters for correctness/privacy. A leftover orphaned file is
    // a cleanup nicety, not something worth failing the user's action over.
  }
}

export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      resolve({ width: 0, height: 0 })
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}
