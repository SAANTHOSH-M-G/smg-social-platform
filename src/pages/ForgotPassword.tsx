import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/Common'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetError) throw resetError
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-paper-200 bg-white p-8 shadow-soft dark:border-ink-700 dark:bg-ink-900">
      <h1 className="mb-1 text-center font-display text-lg font-semibold text-ink-500 dark:text-paper-200">
        Reset your password
      </h1>
      {sent ? (
        <p className="mt-6 text-center text-sm text-ink-700 dark:text-paper-200">
          If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your inbox (and spam
          folder) and follow the link to choose a new password.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-lg border border-paper-200 bg-paper-50 p-3 text-sm outline-none focus:border-signal-400 dark:border-ink-700 dark:bg-ink-800"
          />
          {error && <p className="text-xs font-medium text-ember-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal-500 py-2.5 text-sm font-semibold text-white hover:bg-signal-600 disabled:opacity-60"
          >
            {loading && <Spinner size={16} />} Send reset link
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-semibold text-signal-500">
          Back to log in
        </Link>
      </p>
    </div>
  )
}
