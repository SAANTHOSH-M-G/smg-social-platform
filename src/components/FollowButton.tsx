import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { followOrRequest, getFollowState, unfollow } from '@/services/follows'
import type { Profile } from '@/types'

export function FollowButton({
  target,
  className,
  size = 'md',
  onChange,
}: {
  target: Profile
  className?: string
  size?: 'sm' | 'md'
  onChange?: (isFollowing: boolean) => void
}) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [state, setState] = useState<'idle' | 'following' | 'requested'>('idle')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!profile || profile.id === target.id) return
    getFollowState(profile.id, target.id).then(({ isFollowing, hasPendingRequest }) => {
      setState(isFollowing ? 'following' : hasPendingRequest ? 'requested' : 'idle')
    })
  }, [profile, target.id])

  if (!profile || profile.id === target.id) return null

  const handleClick = async () => {
    if (!profile) return
    setLoading(true)
    try {
      if (state === 'following') {
        await unfollow(profile.id, target.id)
        setState('idle')
        onChange?.(false)
      } else if (state === 'requested') {
        await unfollow(profile.id, target.id)
        setState('idle')
      } else {
        const { requested } = await followOrRequest(profile.id, target)
        setState(requested ? 'requested' : 'following')
        onChange?.(!requested)
        showToast(requested ? `Follow request sent to @${target.username}` : `You're now following @${target.username}`, 'success')
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong', 'error')
    } finally {
      setLoading(false)
    }
  }

  const label = state === 'following' ? 'Following' : state === 'requested' ? 'Requested' : 'Follow'

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={clsx(
        'rounded-lg font-semibold transition-colors disabled:opacity-60',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        state === 'idle'
          ? 'bg-signal-500 text-white hover:bg-signal-600'
          : 'bg-paper-100 text-ink-900 hover:bg-paper-200 dark:bg-ink-700 dark:text-paper-50 dark:hover:bg-ink-600',
        className
      )}
    >
      {label}
    </button>
  )
}
