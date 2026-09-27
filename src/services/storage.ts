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
