import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { Edit } from 'lucide-react'
import { ChatList } from '@/components/ChatList'
import { ChatWindow } from '@/components/ChatWindow'
import { SearchModal } from '@/components/SearchModal'
import { EmptyState } from '@/components/Common'
import { useAuth } from '@/contexts/AuthContext'
import { getConversations } from '@/services/messages'
import type { Conversation } from '@/types'
import { Send } from 'lucide-react'

export function MessagesPage() {
  const { profile } = useAuth()
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    if (!profile) return
    getConversations(profile.id)
      .then(setConversations)
      .finally(() => setLoading(false))
  }, [profile, conversationId])

  const active = conversations.find((c) => c.id === conversationId)

  return (
    <div className="flex h-[calc(100vh-56px)] md:h-screen">
      <div className={clsx('w-full border-r border-paper-200 dark:border-ink-700 md:w-[380px]', conversationId && 'hidden md:block')}>
        <div className="flex items-center justify-between border-b border-paper-200 px-4 py-4 dark:border-ink-700">
          <h1 className="font-display text-lg font-semibold">{profile?.username}</h1>
          <button onClick={() => setSearchOpen(true)} className="rounded-full p-1.5 hover:bg-paper-100 dark:hover:bg-ink-800">
            <Edit size={20} />
          </button>
        </div>
        <ChatList conversations={conversations} loading={loading} />
      </div>

      <div className={clsx('flex-1', !conversationId && 'hidden md:flex md:items-center md:justify-center')}>
        {active ? (
          <ChatWindow conversation={active} onBack={() => navigate('/messages')} />
        ) : (
          <EmptyState icon={<Send size={28} />} title="Your messages" description="Select a conversation or start a new one." />
        )}
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
