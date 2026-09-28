import { supabase } from '@/lib/supabase'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // 15MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024 // 100MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

export class UploadValidationError extends Error {}

export function validateMediaFile(file: File) {
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type)

  if (!isImage && !isVideo) {
    throw new UploadValidationError('Unsupported file type. Use JPG, PNG, WEBP, GIF, MP4, WEBM or MOV.')
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    throw new UploadValidationError('Image is too large. Max size is 15MB.')
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new UploadValidationError('Video is too large. Max size is 100MB.')
  }
  return { mediaType: isVideo ? ('video' as const) : ('image' as const) }
}

function extensionOf(file: File) {
  const parts = file.name.split('.')
  return parts.length > 1 ? parts.pop() : file.type.split('/').pop() ?? 'bin'
}

export async function uploadToBucket(bucket: string, userId: string, file: File) {
  validateMediaFile(file)
  const path = `${userId}/${crypto.randomUUID()}.${extensionOf(file)}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
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
