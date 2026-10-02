import { Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'

export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper-100 px-4 dark:bg-ink-950">
      <div className="mb-2">
        <Logo size="lg" />
      </div>
      <Outlet />
      <p className="mt-4 max-w-xs text-center text-xs text-ink-400">
        SMG is an original social platform. Not affiliated with or endorsed by Instagram or Meta.
      </p>
    </div>
  )
}
