import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Full-screen photo/video viewer. Esc or a click on the dark area closes it. */
export function MediaLightbox({
  url,
  type,
  note,
  onClose,
}: {
  url: string
  type: 'image' | 'video'
  note?: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-black/95 p-4" role="dialog" aria-modal="true" aria-label="Media viewer" onClick={onClose}>
      <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
        <X size={24} />
      </button>
      {note && <p className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">{note}</p>}
      {type === 'video' ? (
        <video src={url} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
      ) : (
        <img src={url} alt="" draggable={false} className="max-h-full max-w-full select-none rounded-lg object-contain" onClick={(e) => e.stopPropagation()} onContextMenu={note ? (e) => e.preventDefault() : undefined} />
      )}
    </div>,
    document.body
  )
}
