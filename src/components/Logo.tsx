import clsx from 'clsx'

export function Logo({ size = 'md', mark = false }: { size?: 'sm' | 'md' | 'lg'; mark?: boolean }) {
  if (mark) {
    return (
      <div
        className={clsx(
          'flex items-center justify-center rounded-xl bg-ink-950 font-display font-bold text-white dark:bg-paper-50 dark:text-ink-950',
          size === 'sm' && 'h-8 w-8 text-xs',
          size === 'md' && 'h-9 w-9 text-sm',
          size === 'lg' && 'h-11 w-11 text-base'
        )}
      >
        S
      </div>
    )
  }
  return (
    <span
      className={clsx(
        'brand-wordmark select-none',
        size === 'sm' && 'text-lg',
        size === 'md' && 'text-2xl',
        size === 'lg' && 'text-3xl'
      )}
    >
      SMG
    </span>
  )
}
