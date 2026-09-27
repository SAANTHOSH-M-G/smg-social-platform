import { initialsOf } from '@/utils/format'
import clsx from 'clsx'

const GRADIENTS = [
  'from-signal-400 to-signal-700',
  'from-ember-400 to-signal-500',
  'from-signal-300 to-ember-500',
  'from-signal-500 to-signal-300',
]

function gradientFor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return GRADIENTS[hash % GRADIENTS.length]
}

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-24 w-24 text-2xl',
  '2xl': 'h-32 w-32 text-3xl',
}

export function Avatar({
  src,
  name,
  size = 'md',
  ring = false,
  className,
}: {
  src?: string | null
  name: string
  size?: keyof typeof SIZES
  ring?: boolean
  className?: string
}) {
  return (
    <div
      className={clsx(
        'relative shrink-0 rounded-full',
        ring && 'story-ring p-[2px]',
        SIZES[size],
        className
      )}
    >
      <div className={clsx('h-full w-full overflow-hidden rounded-full', ring && 'border-2 border-paper-50 dark:border-ink-950')}>
        {src ? (
          <img src={src} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div
            className={clsx(
              'flex h-full w-full items-center justify-center bg-gradient-to-br font-display font-semibold text-white',
              gradientFor(name || 'smg')
            )}
          >
            {initialsOf(name || 'U')}
          </div>
        )}
      </div>
    </div>
  )
}
