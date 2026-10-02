import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import { FollowButton } from './FollowButton'
import type { Profile } from '@/types'

export function UserCard({
  profile,
  onNavigate,
  subtitle,
  trailing,
}: {
  profile: Profile
  onNavigate?: () => void
  subtitle?: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <Link to={`/${profile.username}`} onClick={onNavigate}>
        <Avatar src={profile.avatar_url} name={profile.full_name || profile.username} size="md" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/${profile.username}`} onClick={onNavigate} className="block truncate text-sm font-semibold hover:underline">
          {profile.username}
        </Link>
        <p className="truncate text-xs text-ink-500 dark:text-paper-200/60">{subtitle ?? profile.full_name}</p>
      </div>
      {trailing ?? <FollowButton target={profile} size="sm" />}
    </div>
  )
}
