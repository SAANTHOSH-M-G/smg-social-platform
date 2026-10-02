import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Modal({
  open,
  onClose,
  children,
  className,
  title,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  title?: string
}) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-0 sm:p-6" onClick={onClose}>
      <div
        className={
          className ??
          'relative max-h-full w-full max-w-lg overflow-y-auto rounded-none bg-white shadow-soft dark:bg-ink-900 sm:max-h-[90vh] sm:rounded-2xl'
        }
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-paper-200 bg-white px-4 py-3 dark:border-ink-700 dark:bg-ink-900">
            <h2 className="text-base font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-paper-100 dark:hover:bg-ink-800">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white text-center shadow-soft dark:bg-ink-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-6">
          <h3 className="text-base font-semibold">{title}</h3>
          {description && <p className="mt-1.5 text-sm text-ink-500 dark:text-paper-200/70">{description}</p>}
        </div>
        <div className="grid grid-cols-2 divide-x divide-paper-200 border-t border-paper-200 dark:divide-ink-700 dark:border-ink-700">
          <button onClick={onCancel} className="py-3 text-sm font-medium hover:bg-paper-50 dark:hover:bg-ink-700">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`py-3 text-sm font-semibold hover:bg-paper-50 dark:hover:bg-ink-700 ${danger ? 'text-ember-500' : 'text-signal-500'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink-900 dark:border-paper-100">{icon}</div>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {description && <p className="max-w-xs text-sm text-ink-500 dark:text-paper-200/70">{description}</p>}
    </div>
  )
}

export function PostCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-none border-b border-paper-200 bg-white pb-4 dark:border-ink-700 dark:bg-ink-900 sm:rounded-2xl sm:border">
      <div className="flex items-center gap-3 p-3">
        <div className="skeleton h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <div className="skeleton h-3 w-28 rounded" />
          <div className="skeleton h-2.5 w-16 rounded" />
        </div>
      </div>
      <div className="skeleton aspect-square w-full" />
      <div className="space-y-2 px-3 pt-3">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-3 w-48 rounded" />
      </div>
    </div>
  )
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton aspect-square w-full" />
      ))}
    </div>
  )
}
