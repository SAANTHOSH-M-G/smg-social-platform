import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, CheckCheck, Image as ImageIcon, Send, Trash2, ArrowDown, AlertCircle, SmilePlus } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from './Avatar'
import { ConfirmDialog, Spinner } from './Common'
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
  subscribeToReadReceipts,
  subscribeToTyping,
  subscribeToPresence,
  getReactions,
  setReaction,
  subscribeToReactions,
  REACTION_EMOJIS,
  type MessageReaction,
  setTyping,
  getPresence,
  isPresenceLive,
  MAX_MESSAGE_LENGTH,
} from '@/services/messages'
import { validateMediaFile, UploadValidationError } from '@/services/storage'
import { formatClock, formatDayLabel, isSameDay } from '@/utils/format'

/** A message that has been shown optimistically but not yet confirmed by the server. */
type LocalMessage = Message & { pending?: boolean; failed?: boolean }

const BOTTOM_THRESHOLD_PX = 120

export function ChatWindow({
  conversation,
  onBack,
  onActivity,
}: {
  conversation: Conversation
  onBack?: () => void
  /** Called after we send/read so the inbox list can refresh its preview and unread counts. */
  onActivity?: () => void
}) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [otherTyping, setOtherTyping] = useState(false)
  const [otherOnline, setOtherOnline] = useState(false)
  const [otherReadAt, setOtherReadAt] = useState<string | null>(conversation.other_last_read_at ?? null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showJump, setShowJump] = useState(false)
  const [sendingMedia, setSendingMedia] = useState(false)
  const [reactions, setReactions] = useState<MessageReaction[]>([])
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const fetchedReactionIds = useRef(new Set<string>())
  const messageIdsRef = useRef(new Set<string>())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const preservedScroll = useRef<{ height: number; top: number } | null>(null)
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>()
  const lastTypingPing = useRef(0)
  const other = conversation.members[0]
  const meId = profile?.id

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  const markRead = useCallback(() => {
    if (!meId || document.visibilityState !== 'visible') return
    void markConversationRead(conversation.id, meId).then(() => onActivity?.())
  }, [conversation.id, meId, onActivity])

  // initial history
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    stickToBottom.current = true
    getMessages(conversation.id)
      .then(({ messages: page, hasMore: more }) => {
        if (cancelled) return
        setMessages(page)
        setHasMore(more)
        markRead()
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [conversation.id])

  // realtime: new / updated messages and the other person's read marker
  useEffect(() => {
    const unsubMessages = subscribeToConversation(conversation.id, {
      onInsert: (incoming) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev
          // replace the optimistic copy of our own message if it's still in flight
          const pendingIdx = incoming.sender_id === meId ? prev.findIndex((m) => m.pending && m.content === incoming.content && !m.media_url) : -1
          if (pendingIdx !== -1) return prev.map((m, i) => (i === pendingIdx ? incoming : m))
          return [...prev, incoming]
        })
        if (incoming.sender_id !== meId) markRead()
      },
      onUpdate: (updated) => setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))),
    })
    const unsubReads = meId ? subscribeToReadReceipts(conversation.id, meId, setOtherReadAt) : () => undefined
    const onVisible = () => document.visibilityState === 'visible' && markRead()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      unsubMessages()
      unsubReads()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [conversation.id, meId, markRead])

  useEffect(() => {
    if (!meId) return
    return subscribeToTyping(conversation.id, meId, () => {
      setOtherTyping(true)
      clearTimeout(typingTimeout.current)
      typingTimeout.current = setTimeout(() => setOtherTyping(false), 2500)
    })
  }, [conversation.id, meId])

  useEffect(() => () => clearTimeout(typingTimeout.current), [])

  useEffect(() => {
    if (!other) return
    let live = true
    getPresence([other.id]).then((p) => live && setOtherOnline(isPresenceLive(p[0])))
    const unsub = subscribeToPresence(other.id, (row) => setOtherOnline(isPresenceLive(row)))
    return () => {
      live = false
      unsub()
    }
  }, [other?.id])

  // reactions: load for any messages we haven't fetched yet, then keep them live
  useEffect(() => {
    messageIdsRef.current = new Set(messages.filter((m) => !m.pending).map((m) => m.id))
    const missing = [...messageIdsRef.current].filter((id) => !fetchedReactionIds.current.has(id))
    if (!missing.length) return
    missing.forEach((id) => fetchedReactionIds.current.add(id))
    getReactions(missing)
      .then((rows) =>
        setReactions((prev) => [...prev.filter((r) => !rows.some((n) => n.message_id === r.message_id && n.user_id === r.user_id)), ...rows])
      )
      .catch(() => missing.forEach((id) => fetchedReactionIds.current.delete(id)))
  }, [messages])

  useEffect(() => {
    return subscribeToReactions((event, row) => {
      if (!messageIdsRef.current.has(row.message_id)) return
      setReactions((prev) => {
        const rest = prev.filter((r) => !(r.message_id === row.message_id && r.user_id === row.user_id))
        return event === 'set' ? [...rest, row] : rest
      })
    })
  }, [])

  // close the emoji bar when clicking anywhere else
  useEffect(() => {
    if (!pickerFor) return
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-reaction-ui]')) setPickerFor(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [pickerFor])

  // keep pinned to the bottom for new messages; preserve position when older history is prepended
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (preservedScroll.current) {
      el.scrollTop = el.scrollHeight - preservedScroll.current.height + preservedScroll.current.top
      preservedScroll.current = null
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, otherTyping, loading])

  const loadOlder = async () => {
    if (loadingOlder || !hasMore || !messages.length) return
    const oldest = messages.find((m) => !m.pending)
    if (!oldest) return
    setLoadingOlder(true)
    try {
      const el = scrollRef.current
      const { messages: older, hasMore: more } = await getMessages(conversation.id, oldest.created_at)
      if (el) preservedScroll.current = { height: el.scrollHeight, top: el.scrollTop }
      setMessages((prev) => [...older.filter((o) => !prev.some((m) => m.id === o.id)), ...prev])
      setHasMore(more)
    } catch {
      showToast('Could not load earlier messages', 'error')
    } finally {
      setLoadingOlder(false)
    }
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottom.current = distance < BOTTOM_THRESHOLD_PX
    setShowJump(distance > 400)
    if (el.scrollTop < 80) void loadOlder()
  }

  const handleTextChange = (value: string) => {
    setText(value.slice(0, MAX_MESSAGE_LENGTH))
    if (meId && Date.now() - lastTypingPing.current > 1500) {
      lastTypingPing.current = Date.now()
      void setTyping(conversation.id, meId).catch(() => undefined)
    }
  }

  const sendContent = async (content: string, tempId: string) => {
    if (!meId) return
    try {
      const sent = await sendTextMessage(conversation.id, meId, content)
      setMessages((prev) => {
        // realtime may already have swapped the optimistic row for the real one
        if (prev.some((m) => m.id === sent.id)) return prev.filter((m) => m.id !== tempId)
        return prev.map((m) => (m.id === tempId ? sent : m))
      })
      onActivity?.()
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)))
    }
  }

  const handleSend = () => {
    const content = text.trim()
    if (!meId || !content) return
    const tempId = `temp-${crypto.randomUUID()}`
    const optimistic: LocalMessage = {
      id: tempId,
      conversation_id: conversation.id,
      sender_id: meId,
      content,
      media_url: null,
      media_type: null,
      created_at: new Date().toISOString(),
      deleted_at: null,
      pending: true,
    }
    stickToBottom.current = true
    setMessages((prev) => [...prev, optimistic])
    setText('')
    void sendContent(content, tempId)
  }

  const retry = (m: LocalMessage) => {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pending: true, failed: false } : x)))
    void sendContent(m.content, m.id)
  }

  const handleFile = async (file: File) => {
    if (!meId) return
    try {
      validateMediaFile(file)
      setSendingMedia(true)
      const sent = await sendMediaMessage(conversation.id, meId, file)
      stickToBottom.current = true
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]))
      onActivity?.()
    } catch (e) {
      showToast(e instanceof UploadValidationError ? e.message : 'Could not send attachment', 'error')
    } finally {
      setSendingMedia(false)
    }
  }

  const handleReact = async (messageId: string, emoji: string) => {
    if (!meId) return
    const mine = reactions.find((r) => r.message_id === messageId && r.user_id === meId)
    const next = mine?.emoji === emoji ? null : emoji // same emoji again = remove
    setPickerFor(null)
    const snapshot = reactions
    setReactions((prev) => {
      const rest = prev.filter((r) => !(r.message_id === messageId && r.user_id === meId))
      return next ? [...rest, { message_id: messageId, user_id: meId, emoji: next }] : rest
    })
    try {
      await setReaction(messageId, meId, next)
    } catch (e) {
      setReactions(snapshot)
      showToast(e instanceof Error ? `Could not react: ${e.message}` : 'Could not react to message', 'error')
    }
  }

  const nameOf = (userId: string) => (userId === meId ? 'You' : conversation.members.find((m) => m.id === userId)?.username ?? 'Someone')

  const handleDelete = async () => {
    if (!meId || !confirmDeleteId) return
    const id = confirmDeleteId
    setConfirmDeleteId(null)
    try {
      await deleteMessage(id, meId)
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted_at: new Date().toISOString(), content: '' } : m)))
      onActivity?.()
    } catch {
      showToast('Could not delete message', 'error')
    }
  }

  // "Seen" goes under the newest message of mine that the other person has read
  const lastSeenId = (() => {
    if (!otherReadAt) return null
    const mine = messages.filter((m) => m.sender_id === meId && !m.pending && !m.failed && !m.deleted_at)
    const last = mine[mine.length - 1]
    return last && new Date(last.created_at) <= new Date(otherReadAt) ? last.id : null
  })()
  const lastMineId = [...messages].reverse().find((m) => m.sender_id === meId)?.id

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-paper-200 px-3 py-3 dark:border-ink-700 sm:px-4">
        {onBack && (
          <button onClick={onBack} aria-label="Back to messages" className="rounded-full p-1.5 hover:bg-paper-100 dark:hover:bg-ink-800 md:hidden">
            <ArrowLeft size={20} />
          </button>
        )}
        <Link to={`/${other?.username}`} className="flex min-w-0 items-center gap-3">
          <div className="relative">
            <Avatar src={other?.avatar_url} name={other?.full_name || other?.username || ''} size="sm" />
            {otherOnline && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-ink-900" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{other?.username}</p>
            <p className="text-xs text-ink-500 dark:text-paper-200/60">{otherTyping ? 'Typing…' : otherOnline ? 'Active now' : 'Offline'}</p>
          </div>
        </Link>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full space-y-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
          {loadingOlder && (
            <div className="flex justify-center py-2">
              <Spinner size={16} />
            </div>
          )}
          {!loading && hasMore && !loadingOlder && (
            <button onClick={loadOlder} className="mx-auto block pb-2 text-xs font-semibold text-signal-500">
              Load earlier messages
            </button>
          )}
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={clsx('flex pb-2', i % 2 ? 'justify-end' : 'justify-start')}>
                <div className="skeleton h-9 w-44 rounded-2xl" />
              </div>
            ))}
          {loadError && (
            <div className="flex flex-col items-center gap-2 py-16 text-sm text-ink-500">
              <AlertCircle size={22} /> Couldn't load this conversation.
            </div>
          )}
          {!loading && !loadError && messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Avatar src={other?.avatar_url} name={other?.full_name || other?.username || ''} size="xl" />
              <p className="font-display text-lg font-semibold">{other?.username}</p>
              <p className="text-sm text-ink-500">No messages yet. Say hello 👋</p>
            </div>
          )}

          {!loading &&
            messages.map((m, i) => {
              const isMine = m.sender_id === meId
              const prev = messages[i - 1]
              const next = messages[i + 1]
              const newDay = !prev || !isSameDay(prev.created_at, m.created_at)
              const endOfRun = !next || next.sender_id !== m.sender_id || !isSameDay(next.created_at, m.created_at)
              const msgReactions = reactions.filter((r) => r.message_id === m.id)
              const myReaction = msgReactions.find((r) => r.user_id === meId)
              const myReactions = msgReactions
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="py-3 text-center text-[11px] font-medium uppercase tracking-wide text-ink-400">{formatDayLabel(m.created_at)}</div>
                  )}
                  <div className={clsx('group flex items-end gap-2', isMine ? 'justify-end' : 'justify-start', endOfRun && 'pb-1.5')}>
                    {isMine && !m.deleted_at && !m.pending && !m.failed && (
                      <button
                        onClick={() => setConfirmDeleteId(m.id)}
                        aria-label="Delete message"
                        className="rounded-full p-1 text-ink-400 opacity-0 hover:bg-paper-100 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-ink-800"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    {!m.deleted_at && !m.pending && !m.failed && (
                      <button
                        onClick={() => setPickerFor((cur) => (cur === m.id ? null : m.id))}
                        aria-label="React to message"
                        data-reaction-ui
                        className={clsx(
                          'order-last rounded-full p-1 text-ink-400 opacity-0 hover:bg-paper-100 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-ink-800',
                          isMine && 'order-first'
                        )}
                      >
                        <SmilePlus size={15} />
                      </button>
                    )}
                    <div className={clsx('relative max-w-[78%]', myReactions.length > 0 && 'mb-3')} data-reaction-ui>
                      {pickerFor === m.id && (
                        <div
                          className={clsx(
                            'absolute -top-11 z-10 flex gap-0.5 rounded-full bg-white px-1.5 py-1 shadow-soft ring-1 ring-paper-200 dark:bg-ink-800 dark:ring-ink-700',
                            isMine ? 'right-0' : 'left-0'
                          )}
                          role="menu"
                        >
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              role="menuitem"
                              onClick={() => handleReact(m.id, emoji)}
                              aria-label={`React ${emoji}`}
                              className={clsx(
                                'rounded-full px-1.5 py-0.5 text-xl transition-transform hover:scale-125',
                                myReaction?.emoji === emoji && 'bg-signal-50 dark:bg-ink-700'
                              )}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                      <div
                        title={new Date(m.created_at).toLocaleString()}
                        onClick={() => !m.deleted_at && !m.pending && !m.failed && setPickerFor((cur) => (cur === m.id ? null : m.id))}
                        onDoubleClick={() => !m.deleted_at && !m.pending && !m.failed && handleReact(m.id, '❤️')}
                        className={clsx(
                          'cursor-pointer break-words rounded-2xl px-3.5 py-2 text-sm [overflow-wrap:anywhere]',
                          isMine ? 'bg-signal-500 text-white' : 'bg-paper-100 dark:bg-ink-800',
                          m.pending && 'opacity-60',
                          m.failed && 'bg-ember-500/90'
                        )}
                      >
                        {m.deleted_at ? (
                          <span className="italic opacity-70">Message removed</span>
                        ) : m.media_url ? (
                          m.media_type === 'video' ? (
                            <video src={m.media_url} controls playsInline preload="metadata" className="max-h-72 max-w-[220px] rounded-lg" onClick={(e) => e.stopPropagation()} />
                          ) : (
                            <img src={m.media_url} alt="Attachment" loading="lazy" className="max-h-72 max-w-[220px] rounded-lg object-cover" />
                          )
                        ) : (
                          <span className="whitespace-pre-wrap">{m.content}</span>
                        )}
                      </div>
                      {msgReactions.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (myReaction) void handleReact(m.id, myReaction.emoji)
                          }}
                          title={msgReactions.map((r) => `${nameOf(r.user_id)}: ${r.emoji}`).join('\n')}
                          aria-label={`Reactions: ${msgReactions.map((r) => `${nameOf(r.user_id)} ${r.emoji}`).join(', ')}`}
                          className={clsx(
                            'absolute -bottom-3 flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-xs shadow ring-1 ring-paper-200 dark:bg-ink-800 dark:ring-ink-700',
                            isMine ? 'right-2' : 'left-2'
                          )}
                        >
                          {[...new Set(msgReactions.map((r) => r.emoji))].map((e) => (
                            <span key={e}>{e}</span>
                          ))}
                          {msgReactions.length > 1 && <span className="ml-0.5 font-semibold text-ink-600 dark:text-paper-200">{msgReactions.length}</span>}
                        </button>
                      )}
                    </div>
                  </div>
                  {(endOfRun || m.failed) && (
                    <div className={clsx('flex items-center gap-1 px-1 pb-1 text-[10px] text-ink-400', isMine ? 'justify-end' : 'justify-start')}>
                      {m.failed ? (
                        <button onClick={() => retry(m)} className="font-semibold text-ember-500">
                          Not sent · Tap to retry
                        </button>
                      ) : (
                        <>
                          <span>{m.pending ? 'Sending…' : formatClock(m.created_at)}</span>
                          {isMine && !m.pending && m.id === lastMineId && (
                            m.id === lastSeenId ? (
                              <span className="flex items-center gap-0.5 font-semibold text-signal-500">
                                <CheckCheck size={12} /> Seen
                              </span>
                            ) : (
                              <Check size={12} aria-label="Sent" />
                            )
                          )}
                        </>
                      )}
                    </div>
                  )}
                </Fragment>
              )
            })}

          {otherTyping && (
            <div className="flex justify-start pt-1">
              <div className="flex gap-1 rounded-2xl bg-paper-100 px-3.5 py-3 dark:bg-ink-800" aria-label="Typing">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {showJump && (
          <button
            onClick={() => scrollToBottom(true)}
            aria-label="Jump to latest"
            className="absolute bottom-3 right-4 rounded-full bg-white p-2 shadow-soft ring-1 ring-paper-200 dark:bg-ink-800 dark:ring-ink-700"
          >
            <ArrowDown size={18} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-paper-200 p-3 dark:border-ink-700">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={sendingMedia}
          aria-label="Attach photo or video"
          className="rounded-full p-2 hover:bg-paper-100 disabled:opacity-50 dark:hover:bg-ink-800"
        >
          {sendingMedia ? <Spinner size={20} /> : <ImageIcon size={22} />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Message…"
          aria-label="Message"
          maxLength={MAX_MESSAGE_LENGTH}
          className="min-w-0 flex-1 rounded-full bg-paper-100 px-4 py-2.5 text-sm outline-none dark:bg-ink-800"
        />
        <button onClick={handleSend} disabled={!text.trim()} aria-label="Send message" className="p-2 font-semibold text-signal-500 disabled:opacity-40">
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
    </div>
  )
}
