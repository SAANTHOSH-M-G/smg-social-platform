import { supabase, BUCKETS } from '@/lib/supabase'
import type { Conversation, Message, Profile } from '@/types'
import { uploadToBucket } from './storage'

/**
 * supabase.channel(name) returns the SAME channel object for a repeated name, and adding
 * listeners to an already-subscribed channel throws. Several components subscribe to the
 * same logical stream (and React StrictMode mounts twice), so every subscription gets its own topic.
 */
const topic = (base: string) => `${base}:${crypto.randomUUID()}`

const MESSAGE_PAGE_SIZE = 40
export const MAX_MESSAGE_LENGTH = 4000
/** A presence row older than this is treated as offline even if is_online is still true (tab crashed, laptop closed). */
export const PRESENCE_STALE_MS = 2 * 60 * 1000

interface MemberRow {
  conversation_id: string
  user_id: string
  last_read_at: string
  profile: Profile
}

/**
 * Conversation list for the inbox. Uses three round-trips total regardless of
 * how many conversations exist (members, last messages, unread counts) -
 * previously this ran one count query per conversation.
 */
export async function getConversations(userId: string): Promise<Conversation[]> {
  const { data: mine, error } = await supabase
    .from('conversation_members')
    .select('conversation_id, conversation:conversations!conversation_members_conversation_id_fkey(*)')
    .eq('user_id', userId)
  if (error) throw error

  const rows = (mine ?? []) as unknown as { conversation_id: string; conversation: Omit<Conversation, 'members'> }[]
  if (!rows.length) return []
  const ids = rows.map((r) => r.conversation_id)

  const [membersRes, lastRes, unreadRes] = await Promise.all([
    supabase
      .from('conversation_members')
      .select('conversation_id, user_id, last_read_at, profile:profiles!conversation_members_user_id_fkey(*)')
      .in('conversation_id', ids),
    supabase.rpc('get_last_messages'),
    supabase.rpc('get_unread_counts'),
  ])
  if (membersRes.error) throw membersRes.error

  const membersByConv = new Map<string, MemberRow[]>()
  ;((membersRes.data ?? []) as unknown as MemberRow[]).forEach((m) => {
    const list = membersByConv.get(m.conversation_id) ?? []
    list.push(m)
    membersByConv.set(m.conversation_id, list)
  })
  const lastByConv = new Map<string, Message>()
  ;((lastRes.data ?? []) as Message[]).forEach((m) => lastByConv.set(m.conversation_id, m))
  const unreadByConv = new Map<string, number>()
  ;((unreadRes.data ?? []) as { conversation_id: string; unread_count: number }[]).forEach((u) =>
    unreadByConv.set(u.conversation_id, Number(u.unread_count))
  )

  return rows
    .map((r) => {
      const others = (membersByConv.get(r.conversation_id) ?? []).filter((m) => m.user_id !== userId)
      return {
        ...r.conversation,
        members: others.map((m) => m.profile).filter(Boolean),
        other_last_read_at: others.length === 1 ? others[0].last_read_at : null,
        last_message: lastByConv.get(r.conversation_id) ?? null,
        unread_count: unreadByConv.get(r.conversation_id) ?? 0,
      }
    })
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
}

export async function getUnreadMessageCount(): Promise<number> {
  const { data } = await supabase.rpc('get_unread_counts')
  return ((data ?? []) as { unread_count: number }[]).reduce((sum, r) => sum + Number(r.unread_count), 0)
}

/**
 * Finds or creates the 1:1 conversation with `otherUserId` via a SECURITY
 * DEFINER RPC (migration 004). The first argument is kept for call-site
 * compatibility; the server always uses the authenticated user, so a client
 * can't open conversations on behalf of someone else.
 */
export async function getOrCreateDirectConversation(_userId: string, otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { other_user: otherUserId })
  if (error) throw new Error(error.message || 'Could not start conversation')
  return data as string
}

/** Newest-first page, returned oldest-first for rendering. Pass `before` (ISO timestamp) to load older history. */
export async function getMessages(conversationId: string, before?: string): Promise<{ messages: Message[]; hasMore: boolean }> {
  let query = supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(*)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MESSAGE_PAGE_SIZE + 1)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as unknown as Message[]
  const hasMore = rows.length > MESSAGE_PAGE_SIZE
  return { messages: rows.slice(0, MESSAGE_PAGE_SIZE).reverse(), hasMore }
}

export async function getConversationById(conversationId: string, userId: string): Promise<Conversation | null> {
  const all = await getConversations(userId)
  return all.find((c) => c.id === conversationId) ?? null
}

export async function sendTextMessage(conversationId: string, senderId: string, content: string): Promise<Message> {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('Message is empty')
  if (trimmed.length > MAX_MESSAGE_LENGTH) throw new Error(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`)
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content: trimmed })
    .select('*, sender:profiles!messages_sender_id_fkey(*)')
    .single()
  if (error) throw error
  return data as unknown as Message
}

export async function sendMediaMessage(conversationId: string, senderId: string, file: File): Promise<Message> {
  const url = await uploadToBucket(BUCKETS.messages, senderId, file)
  const mediaType = file.type.startsWith('video/') ? ('video' as const) : ('image' as const)
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, media_url: url, media_type: mediaType })
    .select('*, sender:profiles!messages_sender_id_fkey(*)')
    .single()
  if (error) throw error
  return data as unknown as Message
}

export async function deleteMessage(messageId: string, senderId: string) {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), content: '' })
    .eq('id', messageId)
    .eq('sender_id', senderId)
  if (error) throw error
}

/** Server-side `now()` so read receipts can't be skewed by a wrong client clock. */
export async function markConversationRead(conversationId: string, _userId?: string) {
  await supabase.rpc('mark_conversation_read', { conv: conversationId })
}

export function subscribeToConversation(
  conversationId: string,
  handlers: { onInsert: (message: Message) => void; onUpdate?: (message: Message) => void }
) {
  const channel = supabase
    .channel(topic(`messages:${conversationId}`))
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => handlers.onInsert(payload.new as Message)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => handlers.onUpdate?.(payload.new as Message)
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

/**
 * Fires whenever any message visible to the user changes (RLS limits the
 * realtime stream to conversations they belong to) or someone reads one of
 * their conversations. Used to keep the inbox list and the unread badge live.
 */
export function subscribeToInbox(userId: string, onChange: () => void) {
  const channel = supabase
    .channel(topic(`inbox:${userId}`))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' }, onChange)
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

/** Live read receipts for one conversation. */
export function subscribeToReadReceipts(conversationId: string, userId: string, onOtherRead: (lastReadAt: string) => void) {
  const channel = supabase
    .channel(topic(`reads:${conversationId}`))
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        const row = payload.new as { user_id: string; last_read_at: string }
        if (row.user_id !== userId) onOtherRead(row.last_read_at)
      }
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

export function subscribeToTyping(conversationId: string, userId: string, onTyping: (typingUserId: string) => void) {
  const channel = supabase
    .channel(topic(`typing:${conversationId}`))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'typing_status', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as { user_id: string }
        if (row.user_id !== userId) onTyping(row.user_id)
      }
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

export async function setTyping(conversationId: string, userId: string) {
  await supabase
    .from('typing_status')
    .upsert({ conversation_id: conversationId, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'conversation_id,user_id' })
}

export async function setPresence(userId: string, isOnline: boolean) {
  await supabase
    .from('presence')
    .upsert({ user_id: userId, is_online: isOnline, last_seen: new Date().toISOString() }, { onConflict: 'user_id' })
}

export interface PresenceRow {
  user_id: string
  is_online: boolean
  last_seen: string
}

export async function getPresence(userIds: string[]): Promise<PresenceRow[]> {
  if (!userIds.length) return []
  const { data } = await supabase.from('presence').select('*').in('user_id', userIds)
  return (data ?? []) as PresenceRow[]
}

export function isPresenceLive(row?: PresenceRow | null) {
  return Boolean(row?.is_online && Date.now() - new Date(row.last_seen).getTime() < PRESENCE_STALE_MS)
}

export function subscribeToPresence(userId: string, onChange: (row: PresenceRow) => void) {
  const channel = supabase
    .channel(topic(`presence:${userId}`))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'presence', filter: `user_id=eq.${userId}` },
      (payload) => payload.new && onChange(payload.new as PresenceRow)
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
