import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { MobileHeader, MobileBottomNav } from '@/components/MobileNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { getUnreadCount, subscribeToNotifications } from '@/services/notifications'
import { getConversations } from '@/services/messages'

export function MainLayout() {
  const { profile } = useAuth()
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    if (!profile) return
    getUnreadCount(profile.id).then(setUnreadNotifications)
    getConversations(profile.id).then((convs) => setUnreadMessages(convs.reduce((sum, c) => sum + (c.unread_count ?? 0), 0)))
    const unsubscribe = subscribeToNotifications(profile.id, () => {
      setUnreadNotifications((c) => c + 1)
    })
    return unsubscribe
  }, [profile])

  return (
    <div className="min-h-screen bg-paper-50 dark:bg-ink-950">
      <Sidebar unreadNotifications={unreadNotifications} unreadMessages={unreadMessages} />
      <MobileHeader unreadNotifications={unreadNotifications} />
      <main className="mx-auto max-w-[1050px] pb-16 md:ml-[72px] md:pb-0 xl:ml-64">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  )
}
