import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Compass, Clapperboard, PlusSquare, Heart } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { Logo } from './Logo'
import { useAuth } from '@/contexts/AuthContext'
import { CreatePostModal } from './CreatePostModal'

export function MobileHeader({ unreadNotifications }: { unreadNotifications: number }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-paper-200 bg-white/90 px-4 backdrop-blur dark:border-ink-700 dark:bg-ink-950/90 md:hidden">
      <NavLink to="/">
        <Logo size="sm" />
      </NavLink>
      <NavLink to="/notifications" className="relative rounded-full p-2 hover:bg-paper-100 dark:hover:bg-ink-800">
        <Heart size={24} />
        {unreadNotifications > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ember-500 px-1 text-[10px] font-bold text-white">
            {unreadNotifications > 9 ? '9+' : unreadNotifications}
          </span>
        )}
      </NavLink>
    </header>
  )
}

export function MobileBottomNav() {
  const { profile } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  if (!profile) return null

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    clsx('flex flex-1 items-center justify-center py-2.5', isActive ? 'text-ink-950 dark:text-paper-50' : 'text-ink-500 dark:text-paper-200/60')

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-paper-200 bg-white/95 backdrop-blur dark:border-ink-700 dark:bg-ink-950/95 md:hidden">
        <NavLink to="/" end className={itemClass}>
          <Home size={26} />
        </NavLink>
        <NavLink to="/explore" className={itemClass}>
          <Compass size={26} />
        </NavLink>
        <button onClick={() => setCreateOpen(true)} className="flex flex-1 items-center justify-center py-2.5 text-ink-500 dark:text-paper-200/60">
          <PlusSquare size={26} />
        </button>
        <NavLink to="/reels" className={itemClass}>
          <Clapperboard size={26} />
        </NavLink>
        <NavLink to={`/${profile.username}`} className={itemClass}>
          <Avatar src={profile.avatar_url} name={profile.full_name || profile.username} size="xs" />
        </NavLink>
      </nav>
      <CreatePostModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  )
}
