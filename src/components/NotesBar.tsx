import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { Avatar } from './Avatar'
import { Modal } from './Common'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { getNotesFeed, upsertNote, deleteNote } from '@/services/notes'
import { getOrCreateDirectConversation, sendTextMessage } from '@/services/messages'
import type { Note } from '@/types'

export function NotesBar() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!profile) return
    getNotesFeed(profile.id)
      .then(setNotes)
      .finally(() => setLoading(false))
  }

  useEffect(load, [profile])

  if (!profile) return null

  const myNote = notes.find((n) => n.user_id === profile.id)

  const handlePost = async () => {
    setSaving(true)
    try {
      await upsertNote(profile.id, draft)
      setDraft('')
      setComposerOpen(false)
      load()
      showToast('Your note is live for 24 hours', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not post note', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    await deleteNote(profile.id)
    setActiveNote(null)
    load()
    showToast('Note deleted', 'success')
  }

  const handleReply = async (note: Note, text: string) => {
    if (!text.trim()) return
    const conversationId = await getOrCreateDirectConversation(profile.id, note.user_id)
    await sendTextMessage(conversationId, profile.id, `Replying to your note "${note.content}": ${text.trim()}`)
    setActiveNote(null)
    showToast('Reply sent', 'success')
    navigate(`/messages/${conversationId}`)
  }

  return (
    <div className="border-b border-paper-200 px-4 pb-3 pt-1 dark:border-ink-700">
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1 pt-6">
        <button onClick={() => setComposerOpen(true)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <div className="relative">
            <Avatar src={profile.avatar_url} name={profile.full_name || profile.username} size="md" />
            {myNote ? (
              <span className="absolute -top-5 left-1/2 w-[76px] -translate-x-1/2 truncate rounded-full border border-paper-200 bg-white px-2 py-0.5 text-center text-[10px] font-medium shadow-sm dark:border-ink-700 dark:bg-ink-800">
                {myNote.content}
              </span>
            ) : (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-signal-500 text-white ring-2 ring-white dark:ring-ink-950">
                <Plus size={12} strokeWidth={3} />
              </span>
            )}
          </div>
          <span className="mt-1 truncate text-[11px] text-ink-500 dark:text-paper-200/60">{myNote ? 'Your note' : 'Add a note'}</span>
        </button>

        {!loading &&
          notes
            .filter((n) => n.user_id !== profile.id)
            .map((note) => (
              <button key={note.user_id} onClick={() => setActiveNote(note)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <div className="relative">
                  <Avatar src={note.author.avatar_url} name={note.author.full_name || note.author.username} size="md" />
                  <span className="absolute -top-5 left-1/2 w-[76px] -translate-x-1/2 truncate rounded-full border border-paper-200 bg-white px-2 py-0.5 text-center text-[10px] font-medium shadow-sm dark:border-ink-700 dark:bg-ink-800">
                    {note.content}
                  </span>
                </div>
                <span className="mt-1 truncate text-[11px] text-ink-500 dark:text-paper-200/60">{note.author.username}</span>
              </button>
            ))}
      </div>

      <Modal open={composerOpen} onClose={() => setComposerOpen(false)} title={myNote ? 'Update your note' : 'Share a note'}>
        <div className="p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 60))}
            placeholder="What's on your mind?"
            rows={3}
            autoFocus
            className="w-full resize-none rounded-lg border border-paper-200 bg-transparent p-2.5 text-sm outline-none focus:border-signal-400 dark:border-ink-700"
          />
          <p className="mt-1 text-right text-xs text-ink-400">{draft.length}/60 · visible for 24 hours</p>
          <div className="mt-3 flex justify-end gap-2">
            {myNote && (
              <button onClick={handleDelete} className="rounded-lg px-4 py-2 text-sm font-semibold text-ember-500 hover:bg-paper-50 dark:hover:bg-ink-800">
                Delete note
              </button>
            )}
            <button
              onClick={handlePost}
              disabled={saving || !draft.trim()}
              className="rounded-lg bg-signal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-signal-600 disabled:opacity-60"
            >
              Share
            </button>
          </div>
        </div>
      </Modal>

      {activeNote && <NoteViewer note={activeNote} onClose={() => setActiveNote(null)} onReply={handleReply} />}
    </div>
  )
}

function NoteViewer({ note, onClose, onReply }: { note: Note; onClose: () => void; onReply: (note: Note, text: string) => void }) {
  const [reply, setReply] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <Modal open onClose={onClose} className="w-full max-w-sm overflow-hidden rounded-2xl bg-white dark:bg-ink-900">
      <div className="flex items-center justify-between border-b border-paper-200 p-4 dark:border-ink-700">
        <div className="flex items-center gap-2">
          <Avatar src={note.author.avatar_url} name={note.author.full_name || note.author.username} size="sm" />
          <span className="text-sm font-semibold">{note.author.username}</span>
        </div>
        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p className="px-4 py-6 text-center text-lg">{note.content}</p>
      <div className="flex items-center gap-2 border-t border-paper-200 p-3 dark:border-ink-700">
        <input
          ref={inputRef}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && reply.trim()) {
              onReply(note, reply)
              setReply('')
            }
          }}
          placeholder="Reply via message..."
          className="flex-1 rounded-full bg-paper-100 px-4 py-2 text-sm outline-none dark:bg-ink-800"
        />
        <button
          onClick={() => {
            onReply(note, reply)
            setReply('')
          }}
          disabled={!reply.trim()}
          className="text-sm font-semibold text-signal-500 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </Modal>
  )
}
