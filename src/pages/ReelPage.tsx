import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getPostById } from '@/services/posts'
import { ReelViewer } from '@/components/ReelViewer'
import { Spinner } from '@/components/Common'
import type { Post } from '@/types'

export function ReelPage() {
  const { postId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [post, setPost] = useState<Post | null | undefined>(undefined)

  useEffect(() => {
    if (!postId) return
    getPostById(postId, profile?.id)
      .then(setPost)
      .catch(() => setPost(null))
  }, [postId, profile?.id])

  if (post === undefined) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size={28} />
      </div>
    )
  }

  if (post === null || !post.is_reel) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="font-display text-lg font-semibold">Reel not found</p>
        <p className="text-sm text-ink-500">This reel may have been deleted, or the link is incorrect.</p>
      </div>
    )
  }

  return <ReelViewer reels={[post]} onChange={setPost} onClose={() => (window.history.length > 1 ? navigate(-1) : navigate('/reels'))} />
}
