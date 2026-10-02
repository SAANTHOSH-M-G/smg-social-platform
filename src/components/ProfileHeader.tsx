import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Grid3x3, Lock } from 'lucide-react'
import { Avatar } from './Avatar'
import { FollowButton } from './FollowButton'
import { Modal } from './Common'
import { UserCard } from './UserCard'
import { useAuth } from '@/contexts/AuthContext'
import { getOrCreateDirectConversation } from '@/services/messages'
import { getFollowers, getFollowing } from '@/services/follows'
import type { Profile } from '@/types'
import { formatCount } from '@/utils/format'

export function ProfileHeader({
  profile,
  postCount,
  canViewContent,
}: {
  profile: Profile
  postCount: number
  canViewContent: boolean
}) {
  const { profile: me } = useAuth()
  const navigate = useNavigate()
  const isOwn = me?.id === profile.id
  const [listModal, setListModal] = useState<'followers' | 'following' | null>(null)
  const [listUsers, setListUsers] = useState<Profile[]>([])
  const [listLoading, setListLoading] = useState(false)

  const openList = async (kind: 'followers' | 'following') => {
    setListModal(kind)
    setListLoading(true)
    try {
      const users = kind === 'followers' ? await getFollowers(profile.id) : await getFollowing(profile.id)
      setListUsers(users)
    } finally {
      setListLoading(false)
    }
  }

  const handleMessage = async () => {
    if (!me) return
    const conversationId = await getOrCreateDirectConversation(me.id, profile.id)
    navigate(`/messages/${conversationId}`)
  }

  return (
    <div className="border-b border-paper-200 px-4 py-6 dark:border-ink-700 sm:px-0">
      <div className="flex items-start gap-6 sm:gap-12">
        <Avatar src={profile.avatar_url} name={profile.full_name || profile.username} size="2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-xl font-medium">{profile.username}</h1>
            {isOwn ? (
              <>
                <button
                  onClick={() => navigate('/accounts/edit')}
                  className="rounded-lg bg-paper-100 px-4 py-1.5 text-sm font-semibold hover:bg-paper-200 dark:bg-ink-700 dark:hover:bg-ink-600"
                >
                  Edit profile
                </button>
                <button onClick={() => navigate('/settings')} className="rounded-full p-2 hover:bg-paper-100 dark:hover:bg-ink-800">
                  <Settings size={20} />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <FollowButton target={profile} />
                <button
                  onClick={handleMessage}
                  className="rounded-lg bg-paper-100 px-4 py-1.5 text-sm font-semibold hover:bg-paper-200 dark:bg-ink-700 dark:hover:bg-ink-600"
                >
                  Message
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 hidden gap-8 text-sm sm:flex">
            <span>
              <strong>{formatCount(postCount)}</strong> posts
            </span>
            <button onClick={() => openList('followers')}>
              <strong>{formatCount(profile.followers_count)}</strong> followers
            </button>
            <button onClick={() => openList('following')}>
              <strong>{formatCount(profile.following_count)}</strong> following
            </button>
          </div>

          <div className="mt-3 hidden sm:block">
            {profile.full_name && <p className="text-sm font-semibold">{profile.full_name}</p>}
            {profile.bio && <p className="whitespace-pre-line text-sm">{profile.bio}</p>}
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noreferrer" className="text-sm font-medium text-signal-500 hover:underline">
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 sm:hidden">
        {profile.full_name && <p className="text-sm font-semibold">{profile.full_name}</p>}
        {profile.bio && <p className="whitespace-pre-line text-sm">{profile.bio}</p>}
        {profile.website && (
          <a href={profile.website} target="_blank" rel="noreferrer" className="text-sm font-medium text-signal-500 hover:underline">
            {profile.website.replace(/^https?:\/\//, '')}
          </a>
        )}
        <div className="mt-4 flex justify-around border-y border-paper-200 py-3 text-center text-sm dark:border-ink-700">
          <div>
            <p className="font-semibold">{formatCount(postCount)}</p>
            <p className="text-xs text-ink-500">posts</p>
          </div>
          <button onClick={() => openList('followers')}>
            <p className="font-semibold">{formatCount(profile.followers_count)}</p>
            <p className="text-xs text-ink-500">followers</p>
          </button>
          <button onClick={() => openList('following')}>
            <p className="font-semibold">{formatCount(profile.following_count)}</p>
            <p className="text-xs text-ink-500">following</p>
          </button>
        </div>
      </div>

      {!canViewContent && (
        <div className="mt-10 flex flex-col items-center gap-2 py-16 text-center">
          <Lock size={40} strokeWidth={1.5} />
          <p className="font-display text-lg font-semibold">This account is private</p>
          <p className="text-sm text-ink-500 dark:text-paper-200/60">Follow this account to see their photos and videos.</p>
        </div>
      )}

      <Modal open={listModal !== null} onClose={() => setListModal(null)} title={listModal === 'followers' ? 'Followers' : 'Following'}>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {listLoading && (
            <div className="space-y-3 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-10 w-10 rounded-full" />
                  <div className="skeleton h-3 w-32 rounded" />
                </div>
              ))}
            </div>
          )}
          {!listLoading && listUsers.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-ink-500">
              <Grid3x3 size={28} />
              <p className="text-sm">Nobody here yet.</p>
            </div>
          )}
          {!listLoading &&
            listUsers.map((u) => <UserCard key={u.id} profile={u} onNavigate={() => setListModal(null)} />)}
        </div>
      </Modal>
    </div>
  )
}
