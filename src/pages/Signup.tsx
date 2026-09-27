import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { Spinner } from '@/components/Common'

export function SignupPage() {
  const { signUp } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const cleanUsername = username.trim().toLowerCase()
    if (!/^[a-z0-9_.]{3,30}$/.test(cleanUsername)) {
      setError('Username must be 3-30 characters: letters, numbers, dots or underscores.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    try {
      await signUp(email, password, cleanUsername, fullName)
      showToast('Check your email to confirm your account, then log in.', 'success')
      navigate('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign up')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-paper-200 bg-white p-8 shadow-soft dark:border-ink-700 dark:bg-ink-900">
      <h1 className="mb-1 text-center font-display text-lg font-semibold text-ink-500 dark:text-paper-200">
        Sign up to see photos and videos from your friends.
      </h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-lg border border-paper-200 bg-paper-50 p-3 text-sm outline-none focus:border-signal-400 dark:border-ink-700 dark:bg-ink-800"
        />
        <input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="w-full rounded-lg border border-paper-200 bg-paper-50 p-3 text-sm outline-none focus:border-signal-400 dark:border-ink-700 dark:bg-ink-800"
        />
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full rounded-lg border border-paper-200 bg-paper-50 p-3 text-sm outline-none focus:border-signal-400 dark:border-ink-700 dark:bg-ink-800"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-paper-200 bg-paper-50 p-3 text-sm outline-none focus:border-signal-400 dark:border-ink-700 dark:bg-ink-800"
        />
        {error && <p className="text-xs font-medium text-ember-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal-500 py-2.5 text-sm font-semibold text-white hover:bg-signal-600 disabled:opacity-60"
        >
          {loading && <Spinner size={16} />} Sign up
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        Have an account?{' '}
        <Link to="/login" className="font-semibold text-signal-500">
          Log in
        </Link>
      </p>
    </div>
  )
}
