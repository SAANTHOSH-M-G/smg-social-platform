import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home,
  Search,
  Compass,
  Clapperboard,
  MessageCircle,
  Heart,
  PlusSquare,
  Menu,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Settings as SettingsIcon,
} from 'lucide-react'
import clsx from 'clsx'
import { Logo } from './Logo'
import { Avatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useOnClickOutside } from '@/hooks/useOnClickOutside'
import { useRef } from 'react'
import { SearchModal } from './SearchModal'
import { CreatePostModal } from './CreatePostModal'

export function Sidebar({ unreadNotifications, unreadMessages }: { unreadNotifications: number; unreadMessages: number }) {
  const { profile, signOut } = useAuth()
  const { resolvedTheme, preference, setPreference } = useTheme()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  useOnClickOutside(moreRef, () => setMoreOpen(false))

  if (!profile) return null

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex items-center gap-4 rounded-xl px-3 py-3 text-[15px] transition-colors hover:bg-paper-100 dark:hover:bg-ink-800',
      isActive ? 'font-bold' : 'font-medium text-ink-800 dark:text-paper-100'
    )

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-paper-200 bg-white px-2 py-6 dark:border-ink-700 dark:bg-ink-950 lg:w-64 lg:px-3 xl:flex md:flex">
      <div className="mb-6 px-2">
        <NavLink to="/">
          <span className="hidden lg:inline">
            <Logo size="md" />
          </span>
          <span className="inline lg:hidden">
            <Logo mark />
          </span>
        </NavLink>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        <NavLink to="/" end className={linkClass} title="Home">
          <Home size={24} strokeWidth={2} />
          <span className="hidden lg:inline">Home</span>
        </NavLink>

        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-4 rounded-xl px-3 py-3 text-[15px] font-medium text-ink-800 transition-colors hover:bg-paper-100 dark:text-paper-100 dark:hover:bg-ink-800"
        >
          <Search size={24} />
          <span className="hidden lg:inline">Search</span>
        </button>

        <NavLink to="/explore" className={linkClass} title="Explore">
          <Compass size={24} />
          <span className="hidden lg:inline">Explore</span>
        </NavLink>

        <NavLink to="/reels" className={linkClass} title="Reels">
          <Clapperboard size={24} />
          <span className="hidden lg:inline">Reels</span>
        </NavLink>

        <NavLink to="/messages" className={linkClass} title="Messages">
          <span className="relative">
            <MessageCircle size={24} />
            {unreadMessages > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ember-500 px-1 text-[10px] font-bold text-white">
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </span>
          <span className="hidden lg:inline">Messages</span>
        </NavLink>

        <NavLink to="/notifications" className={linkClass} title="Notifications">
          <span className="relative">
            <Heart size={24} />
            {unreadNotifications > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ember-500 px-1 text-[10px] font-bold text-white">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </span>
          <span className="hidden lg:inline">Notifications</span>
        </NavLink>

        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-4 rounded-xl px-3 py-3 text-[15px] font-medium text-ink-800 transition-colors hover:bg-paper-100 dark:text-paper-100 dark:hover:bg-ink-800"
        >
          <PlusSquare size={24} />
          <span className="hidden lg:inline">Create</span>
        </button>

        <NavLink to={`/${profile.username}`} className={linkClass} title="Profile">
          <Avatar src={profile.avatar_url} name={profile.full_name || profile.username} size="xs" />
          <span className="hidden lg:inline">Profile</span>
        </NavLink>
      </nav>

      <div className="relative mt-auto" ref={moreRef}>
        {moreOpen && (
          <div className="absolute bottom-14 left-0 w-60 overflow-hidden rounded-2xl border border-paper-200 bg-white py-2 shadow-soft dark:border-ink-700 dark:bg-ink-800">
            <button
              onClick={() => {
                navigate('/settings')
                setMoreOpen(false)
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-paper-50 dark:hover:bg-ink-700"
            >
              <SettingsIcon size={18} /> Settings
            </button>
            <div className="border-t border-paper-100 px-4 py-2 text-xs font-semibold text-ink-500 dark:border-ink-700">Theme</div>
            {(['light', 'dark', 'system'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setPreference(opt)}
                className={clsx(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-paper-50 dark:hover:bg-ink-700',
                  preference === opt && 'font-semibold text-signal-500'
                )}
              >
                {opt === 'light' && <Sun size={16} />}
                {opt === 'dark' && <Moon size={16} />}
                {opt === 'system' && <Monitor size={16} />}
                {opt[0].toUpperCase() + opt.slice(1)}
              </button>
            ))}
            <div className="mt-1 border-t border-paper-100 dark:border-ink-700" />
            <button
              onClick={() => signOut()}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-ember-500 hover:bg-paper-50 dark:hover:bg-ink-700"
            >
              <LogOut size={18} /> Log out
            </button>
          </div>
        )}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-[15px] font-medium text-ink-800 hover:bg-paper-100 dark:text-paper-100 dark:hover:bg-ink-800"
        >
          <Menu size={24} />
          <span className="hidden lg:inline">More</span>
        </button>
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CreatePostModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <span className="sr-only">{resolvedTheme}</span>
    </aside>
  )
}
