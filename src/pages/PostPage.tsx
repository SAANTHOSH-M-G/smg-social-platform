import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getPostById } from '@/services/posts'
import { PostModal } from '@/components/PostModal'
import { Spinner } from '@/components/Common'
import type { Post } from '@/types'

export function PostPage() {
  const { postId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [post, setPost] = useState<Post | null | undefined>(undefined)

  useEffect(() => {
    if (!postId) return
    getPostById(postId, profile?.id).then(setPost)
  }, [postId, profile?.id])

  if (post === undefined) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size={28} />
      </div>
    )
  }

  if (post === null) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="font-display text-lg font-semibold">Post not found</p>
        <p className="text-sm text-ink-500">This post may have been deleted.</p>
      </div>
    )
  }

  // Reels get their own full-screen viewer route so a shared reel link opens
  // the actual reel experience instead of the small post-detail modal.
  if (post.is_reel) {
    return <Navigate to={`/reel/${post.id}`} replace />
  }

  return <PostModal post={post} onClose={() => navigate(-1)} onChange={setPost} onDeleted={() => navigate('/')} />
}
