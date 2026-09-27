import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User,
  Lock,
  Bell,
  ShieldBan,
  ShieldCheck,
  Palette,
  LogOut,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  KeyRound,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useToast } from '@/contexts/ToastContext'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './Common'
import { getBlockedUsers, unblockUser } from '@/services/blocked'
import type { Profile } from '@/types'
import { supabase } from '@/lib/supabase'

type Section = 'menu' | 'account' | 'password' | 'privacy' | 'notifications' | 'blocked' | 'appearance'

export function SettingsPanel() {
  const { profile, signOut, updateProfile } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [section, setSection] = useState<Section>('menu')
  const [confirmLogout, setConfirmLogout] = useState(false)

  const items: { key: Section; label: string; icon: JSX.Element }[] = [
    { key: 'account', label: 'Edit profile', icon: <User size={20} /> },
    { key: 'password', label: 'Password', icon: <KeyRound size={20} /> },
    { key: 'privacy', label: 'Privacy', icon: <Lock size={20} /> },
    { key: 'notifications', label: 'Notifications', icon: <Bell size={20} /> },
    { key: 'blocked', label: 'Blocked accounts', icon: <ShieldBan size={20} /> },
    { key: 'appearance', label: 'Appearance', icon: <Palette size={20} /> },
  ]

  if (section === 'menu') {
    return (
      <div className="divide-y divide-paper-100 dark:divide-ink-800">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => (item.key === 'account' ? navigate('/accounts/edit') : setSection(item.key))}
            className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-paper-50 dark:hover:bg-ink-800"
          >
            {item.icon}
            <span className="flex-1 text-sm font-medium">{item.label}</span>
            <ChevronRight size={18} className="text-ink-400" />
          </button>
        ))}
        <button
          onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center gap-3 px-4 py-4 text-left text-ember-500 hover:bg-paper-50 dark:hover:bg-ink-800"
        >
          <LogOut size={20} />
          <span className="flex-1 text-sm font-medium">Log out</span>
        </button>
        <ConfirmDialog
          open={confirmLogout}
          title="Log out of SMG?"
          confirmLabel="Log out"
          onConfirm={() => {
            signOut()
            navigate('/login')
          }}
          onCancel={() => setConfirmLogout(false)}
        />
      </div>
    )
  }

  return (
    <div className="p-4">
      <button onClick={() => setSection('menu')} className="mb-4 text-sm font-semibold text-signal-500">
        ← Back to settings
      </button>
      {section === 'password' && <PasswordSection />}
      {section === 'privacy' && profile && <PrivacySection profile={profile} onUpdate={updateProfile} />}
      {section === 'notifications' && <NotificationsSection />}
      {section === 'blocked' && <BlockedSection />}
      {section === 'appearance' && <AppearanceSection />}
    </div>
  )
}

function PasswordSection() {
  const { showToast } = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (password.length < 6) return showToast('Password must be at least 6 characters', 'error')
    if (password !== confirm) return showToast('Passwords do not match', 'error')
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) return showToast(error.message, 'error')
    setPassword('')
    setConfirm('')
    showToast('Password updated', 'success')
  }

  return (
    <div className="max-w-sm space-y-3">
      <h2 className="font-display text-lg font-semibold">Change password</h2>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        className="w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm new password"
        className="w-full rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-signal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-signal-600 disabled:opacity-60"
      >
        Update password
      </button>
    </div>
  )
}

function PrivacySection({ profile, onUpdate }: { profile: Profile; onUpdate: (input: { is_private: boolean }) => Promise<void> }) {
  const { showToast } = useToast()
  const [isPrivate, setIsPrivate] = useState(profile.is_private)
  const [saving, setSaving] = useState(false)

  const handleToggle = async () => {
    setSaving(true)
    try {
      await onUpdate({ is_private: !isPrivate })
      setIsPrivate(!isPrivate)
      showToast(!isPrivate ? 'Your account is now private' : 'Your account is now public', 'success')
    } catch {
      showToast('Could not update privacy setting', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-sm space-y-4">
      <h2 className="font-display text-lg font-semibold">Privacy</h2>
      <div className="flex items-center justify-between rounded-xl border border-paper-200 p-4 dark:border-ink-700">
        <div className="flex items-center gap-3">
          {isPrivate ? <ShieldBan size={22} /> : <ShieldCheck size={22} />}
          <div>
            <p className="text-sm font-semibold">Private account</p>
            <p className="text-xs text-ink-500 dark:text-paper-200/60">Only approved followers can see your posts.</p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          className={clsx('relative h-6 w-11 rounded-full transition-colors', isPrivate ? 'bg-signal-500' : 'bg-paper-200 dark:bg-ink-700')}
        >
          <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', isPrivate ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
      </div>
    </div>
  )
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState({ likes: true, comments: true, follows: true, messages: true })
  return (
    <div className="max-w-sm space-y-4">
      <h2 className="font-display text-lg font-semibold">Notifications</h2>
      {(Object.keys(prefs) as (keyof typeof prefs)[]).map((key) => (
        <div key={key} className="flex items-center justify-between rounded-xl border border-paper-200 p-4 dark:border-ink-700">
          <span className="text-sm font-medium capitalize">{key}</span>
          <button
            onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
            className={clsx('relative h-6 w-11 rounded-full transition-colors', prefs[key] ? 'bg-signal-500' : 'bg-paper-200 dark:bg-ink-700')}
          >
            <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', prefs[key] ? 'translate-x-5' : 'translate-x-0.5')} />
          </button>
        </div>
      ))}
      <p className="text-xs text-ink-500 dark:text-paper-200/60">
        These preferences control in-app notification grouping and are stored locally in this demo.
      </p>
    </div>
  )
}

function BlockedSection() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [blocked, setBlocked] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    getBlockedUsers(profile.id)
      .then(setBlocked)
      .finally(() => setLoading(false))
  }, [profile])

  const handleUnblock = async (id: string) => {
    if (!profile) return
    await unblockUser(profile.id, id)
    setBlocked((prev) => prev.filter((b) => b.id !== id))
    showToast('Account unblocked', 'success')
  }

  return (
    <div className="max-w-sm space-y-4">
      <h2 className="font-display text-lg font-semibold">Blocked accounts</h2>
      {loading && <p className="text-sm text-ink-500">Loading...</p>}
      {!loading && blocked.length === 0 && <p className="text-sm text-ink-500">You haven't blocked anyone.</p>}
      {blocked.map((b) => (
        <div key={b.id} className="flex items-center gap-3">
          <Avatar src={b.avatar_url} name={b.full_name || b.username} size="sm" />
          <span className="flex-1 text-sm font-medium">{b.username}</span>
          <button onClick={() => handleUnblock(b.id)} className="rounded-lg bg-paper-100 px-3 py-1.5 text-xs font-semibold hover:bg-paper-200 dark:bg-ink-700">
            Unblock
          </button>
        </div>
      ))}
    </div>
  )
}

function AppearanceSection() {
  const { preference, setPreference } = useTheme()
  return (
    <div className="max-w-sm space-y-3">
      <h2 className="font-display text-lg font-semibold">Appearance</h2>
      {(['light', 'dark', 'system'] as const).map((opt) => (
        <button
          key={opt}
          onClick={() => setPreference(opt)}
          className={clsx(
            'flex w-full items-center gap-3 rounded-xl border p-4 text-left',
            preference === opt ? 'border-signal-500 bg-signal-50 dark:bg-ink-800' : 'border-paper-200 dark:border-ink-700'
          )}
        >
          {opt === 'light' && <Sun size={20} />}
          {opt === 'dark' && <Moon size={20} />}
          {opt === 'system' && <Monitor size={20} />}
          <span className="text-sm font-medium capitalize">{opt}</span>
        </button>
      ))}
    </div>
  )
}
