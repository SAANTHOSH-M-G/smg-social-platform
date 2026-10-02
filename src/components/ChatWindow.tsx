import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Image as ImageIcon, Send, Trash2, MoreHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './Common'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { Conversation, Message } from '@/types'
import {
  getMessages,
  sendTextMessage,
  sendMediaMessage,
  deleteMessage,
  markConversationRead,
  subscribeToConversation,
  subscribeToTyping,
  setTyping,
  getPresence,
} from '@/services/messages'
import { validateMediaFile, UploadValidationError } from '@/services/storage'
import { timeAgo } from '@/utils/format'

export function ChatWindow({ conversation, onBack }: { conversation: Conversation; onBack?: () => void }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [otherTyping, setOtherTyping] = useState(false)
  const [otherOnline, setOtherOnline] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>()
  const other = conversation.members[0]

  useEffect(() => {
    setLoading(true)
    getMessages(conversation.id)
      .then(setMessages)
      .finally(() => setLoading(false))
    if (profile) void markConversationRead(conversation.id, profile.id)
    if (other) getPresence([other.id]).then((p) => setOtherOnline(p[0]?.is_online ?? false))
  }, [conversation.id, profile, other?.id])

  useEffect(() => {
    const unsubscribe = subscribeToConversation(conversation.id, (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      if (profile) void markConversationRead(conversation.id, profile.id)
    })
    return unsubscribe
  }, [conversation.id, profile])

  useEffect(() => {
    if (!profile) return
    const unsubscribe = subscribeToTyping(conversation.id, profile.id, () => {
      setOtherTyping(true)
      clearTimeout(typingTimeout.current)
      typingTimeout.current = setTimeout(() => setOtherTyping(false), 2500)
    })
    return unsubscribe
  }, [conversation.id, profile])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, otherTyping])

  const handleTextChange = (value: string) => {
    setText(value)
    if (profile) void setTyping(conversation.id, profile.id)
  }

  const handleSend = async () => {
    if (!profile || !text.trim()) return
    const content = text.trim()
    setText('')
    try {
      const sent = await sendTextMessage(conversation.id, profile.id, content)
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]))
    } catch {
      showToast('Message failed to send', 'error')
    }
  }

  const handleFile = async (file: File) => {
    if (!profile) return
    try {
      validateMediaFile(file)
      const sent = await sendMediaMessage(conversation.id, profile.id, file)
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]))
    } catch (e) {
      showToast(e instanceof UploadValidationError ? e.message : 'Could not send attachment', 'error')
    }
  }

  const handleDelete = async () => {
    if (!profile || !confirmDeleteId) return
    await deleteMessage(confirmDeleteId, profile.id)
    setMessages((prev) => prev.map((m) => (m.id === confirmDeleteId ? { ...m, deleted_at: new Date().toISOString(), content: '' } : m)))
    setConfirmDeleteId(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-paper-200 px-4 py-3 dark:border-ink-700">
        {onBack && (
          <button onClick={onBack} className="rounded-full p-1.5 hover:bg-paper-100 dark:hover:bg-ink-800 md:hidden">
            <ArrowLeft size={20} />
          </button>
        )}
        <Link to={`/${other?.username}`} className="flex items-center gap-3">
          <div className="relative">
            <Avatar src={other?.avatar_url} name={other?.full_name || other?.username || ''} size="sm" />
            {otherOnline && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-ink-900" />}
          </div>
          <div>
            <p className="text-sm font-semibold">{other?.username}</p>
            <p className="text-xs text-ink-500 dark:text-paper-200/60">{otherTyping ? 'Typing...' : otherOnline ? 'Active now' : 'Offline'}</p>
          </div>
        </Link>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={clsx('flex', i % 2 ? 'justify-end' : 'justify-start')}>
              <div className="skeleton h-9 w-40 rounded-2xl" />
            </div>
          ))}
        {!loading &&
          messages.map((m) => {
            const isMine = m.sender_id === profile?.id
            return (
              <div key={m.id} className={clsx('group flex items-end gap-2', isMine ? 'justify-end' : 'justify-start')}>
                {isMine && !m.deleted_at && (
                  <button
                    onClick={() => setConfirmDeleteId(m.id)}
                    className="hidden rounded-full p-1 text-ink-400 hover:bg-paper-100 group-hover:block dark:hover:bg-ink-800"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <div
                  className={clsx(
                    'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
                    isMine ? 'bg-signal-500 text-white' : 'bg-paper-100 dark:bg-ink-800'
                  )}
                >
                  {m.deleted_at ? (
                    <span className="italic opacity-70">Message removed</span>
                  ) : m.media_url ? (
                    m.media_type === 'video' ? (
                      <video src={m.media_url} controls className="max-w-[220px] rounded-lg" />
                    ) : (
                      <img src={m.media_url} alt="" className="max-w-[220px] rounded-lg" />
                    )
                  ) : (
                    m.content
                  )}
                </div>
                <span className="text-[10px] text-ink-400 opacity-0 group-hover:opacity-100">{timeAgo(m.created_at)}</span>
              </div>
            )
          })}
        {otherTyping && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl bg-paper-100 px-3.5 py-2.5 dark:bg-ink-800">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-paper-200 p-3 dark:border-ink-700">
        <button onClick={() => fileInputRef.current?.click()} className="rounded-full p-2 hover:bg-paper-100 dark:hover:bg-ink-800">
          <ImageIcon size={22} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
        <input
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Message..."
          className="flex-1 rounded-full bg-paper-100 px-4 py-2.5 text-sm outline-none dark:bg-ink-800"
        />
        <button onClick={handleSend} disabled={!text.trim()} className="font-semibold text-signal-500 disabled:opacity-40">
          <Send size={20} />
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        title="Delete message?"
        description="This message will be removed for you and the recipient."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <span className="sr-only">
        <MoreHorizontal />
      </span>
    </div>
  )
}
