import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Toast } from '@/types'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

interface ToastContextValue {
  showToast: (message: string, variant?: Toast['variant']) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, variant: Toast['variant'] = 'default') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-pop-in flex items-center gap-2 rounded-xl border border-paper-200 bg-white px-4 py-3 text-sm font-medium text-ink-900 shadow-soft dark:border-ink-700 dark:bg-ink-800 dark:text-paper-50"
          >
            {t.variant === 'success' && <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />}
            {t.variant === 'error' && <AlertCircle size={18} className="shrink-0 text-ember-500" />}
            {(!t.variant || t.variant === 'default') && <Info size={18} className="shrink-0 text-signal-500" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-500 hover:text-ink-900 dark:hover:text-paper-50">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
