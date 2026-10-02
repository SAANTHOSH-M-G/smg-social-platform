import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'
import { getProfileById, isUsernameTaken, updateProfile as updateProfileRequest } from '@/services/profiles'
import { setPresence } from '@/services/messages'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signUp: (email: string, password: string, username: string, fullName: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (input: Parameters<typeof updateProfileRequest>[1]) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    let cancelled = false
    getProfileById(session.user.id).then((p) => {
      if (!cancelled) setProfile(p)
    })
    const userId = session.user.id
    setPresence(userId, true).catch(() => undefined)

    // Heartbeat so "Active now" stays accurate even when the tab is closed
    // abruptly (readers also treat a stale last_seen as offline).
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') void setPresence(userId, true).catch(() => undefined)
    }, 60_000)
    const handleVisibility = () => {
      void setPresence(userId, document.visibilityState === 'visible').catch(() => undefined)
    }
    const handleUnload = () => {
      void setPresence(userId, false)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      cancelled = true
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [session?.user])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      async signUp(email, password, username, fullName) {
        const taken = await isUsernameTaken(username)
        if (taken) throw new Error('That username is already taken.')
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username, full_name: fullName } },
        })
        if (error) throw error
      },
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      async signOut() {
        if (session?.user) await setPresence(session.user.id, false)
        await supabase.auth.signOut()
      },
      async refreshProfile() {
        if (!session?.user) return
        const p = await getProfileById(session.user.id)
        setProfile(p)
      },
      async updateProfile(input) {
        if (!session?.user) return
        const updated = await updateProfileRequest(session.user.id, input)
        setProfile(updated)
      },
    }),
    [session, profile, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
