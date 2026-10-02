import { supabase, BUCKETS } from '@/lib/supabase'
import type { Conversation, Message, Profile } from '@/types'
import { uploadToBucket } from './storage'

export async function getConversations(userId: string): Promise<Conversation[]> {
  const { data: memberships, error } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at, conversation:conversations!conversation_members_conversation_id_fkey(*)')
    .eq('user_id', userId)
  if (error) throw error

  const rows = (memberships ?? []) as unknown as {
    conversation_id: string
    last_read_at: string
    conversation: Conversation
  }[]
  if (!rows.length) return []

  const conversationIds = rows.map((r) => r.conversation_id)

  const { data: members } = await supabase
    .from('conversation_members')
    .select('conversation_id, profile:profiles!conversation_members_user_id_fkey(*)')
    .in('conversation_id', conversationIds)

  const membersByConv = new Map<string, Profile[]>()
  ;((members ?? []) as unknown as { conversation_id: string; profile: Profile }[]).forEach((m) => {
    const list = membersByConv.get(m.conversation_id) ?? []
    list.push(m.profile)
    membersByConv.set(m.conversation_id, list)
  })

  const { data: lastMessages } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })

  const lastMsgByConv = new Map<string, Message>()
  ;((lastMessages ?? []) as unknown as Message[]).forEach((m) => {
    if (!lastMsgByConv.has(m.conversation_id)) lastMsgByConv.set(m.conversation_id, m)
  })

  const unreadCounts = new Map<string, number>()
  for (const row of rows) {
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', row.conversation_id)
      .gt('created_at', row.last_read_at)
    unreadCounts.set(row.conversation_id, count ?? 0)
  }

  return rows
    .map((r) => ({
      ...r.conversation,
      members: (membersByConv.get(r.conversation_id) ?? []).filter((m) => m.id !== userId),
      last_message: lastMsgByConv.get(r.conversation_id) ?? null,
      unread_count: unreadCounts.get(r.conversation_id) ?? 0,
    }))
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
}

export async function getOrCreateDirectConversation(userId: string, otherUserId: string): Promise<string> {
  const { data: mine } = await supabase.from('conversation_members').select('conversation_id').eq('user_id', userId)
  const myConvIds = (mine ?? []).map((m) => m.conversation_id)
  if (myConvIds.length) {
    const { data: theirs } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', otherUserId)
      .in('conversation_id', myConvIds)
    if (theirs && theirs.length) {
      // ensure it's a 1:1 (exactly 2 members) not a group
      for (const t of theirs) {
        const { count } = await supabase
          .from('conversation_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('conversation_id', t.conversation_id)
        if (count === 2) return t.conversation_id
      }
    }
  }

  const { data: conv, error } = await supabase.from('conversations').insert({ is_group: false }).select('id').single()
  if (error) throw error
  await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: userId },
    { conversation_id: conv.id, user_id: otherUserId },
  ])
  return conv.id
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(*)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as Message[]
}

export async function sendTextMessage(conversationId: string, senderId: string, content: string): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content })
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
  await supabase.from('messages').update({ deleted_at: new Date().toISOString(), content: '' }).eq('id', messageId).eq('sender_id', senderId)
}

export async function markConversationRead(conversationId: string, userId: string) {
  await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
}

export function subscribeToConversation(conversationId: string, onMessage: (message: Message) => void) {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(payload.new as Message)
    )
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export function subscribeToTyping(conversationId: string, userId: string, onTyping: (typingUserId: string) => void) {
  const channel = supabase
    .channel(`typing:${conversationId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'typing_status', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as { user_id: string }
        if (row.user_id !== userId) onTyping(row.user_id)
      }
    )
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
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

export async function getPresence(userIds: string[]) {
  const { data } = await supabase.from('presence').select('*').in('user_id', userIds)
  return data ?? []
}
