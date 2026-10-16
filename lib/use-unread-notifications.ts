'use client'

import { useNotifications } from '@/components/notification-provider'

// Kept so existing imports keep working. The number now comes from the one
// shared NotificationProvider, so the bell, sidebars and inbox always agree.
export { NOTIFICATIONS_CHANGED_EVENT, notifyNotificationsChanged } from '@/components/notification-provider'

export function useUnreadNotifications() {
  const { unreadCount, refresh } = useNotifications()
  return { count: unreadCount, refresh }
}