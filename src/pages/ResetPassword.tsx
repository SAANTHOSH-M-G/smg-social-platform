import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/Common'

/**
 * Reached only via the link in a Supabase password-reset email, which
 * contains a one-time recovery token in the URL. supabase-js (with
 * detectSessionInUrl, the default) turns that into a temporary session
 * automatically, so by the time this component mounts the person is
 * "logged in" just long enough to set a new password — never anything
 * we build or verify ourselves. This route is intentionally outside both
 * ProtectedRoute and GuestOnlyRoute: it must work whether or not a normal
 * session already exists.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)))
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setSaving(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setDone(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password. The reset link may have expired.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-paper-200 bg-white p-8 shadow-soft dark:border-ink-700 dark:bg-ink-900">
      <h1 className="mb-1 text-center font-display text-lg font-semibold text-ink-500 dark:text-paper-200">Choose a new password</h1>
      {!ready && !done && (
        <p className="mt-6 text-center text-sm text-ink-500">
          Waiting for your reset link to verify... if this doesn't update in a few seconds, the link may have expired — request
          a new one.
        </p>
      )}
      {done && <p className="mt-6 text-center text-sm text-emerald-600">Password updated! Redirecting you to log in...</p>}
      {ready && !done && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full rounded-lg border border-paper-200 bg-paper-50 p-3 text-sm outline-none focus:border-signal-400 dark:border-ink-700 dark:bg-ink-800"
          />
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="w-full rounded-lg border border-paper-200 bg-paper-50 p-3 text-sm outline-none focus:border-signal-400 dark:border-ink-700 dark:bg-ink-800"
          />
          {error && <p className="text-xs font-medium text-ember-500">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal-500 py-2.5 text-sm font-semibold text-white hover:bg-signal-600 disabled:opacity-60"
          >
            {saving && <Spinner size={16} />} Update password
          </button>
        </form>
      )}
    </div>
  )
}
