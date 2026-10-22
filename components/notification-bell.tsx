'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useNotifications } from '@/components/notification-provider'

export function NotificationBell() {
  const { unreadCount } = useNotifications()
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
    >
      <Bell size={20} aria-hidden />
      {unreadCount > 0 && (
        <span
          className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
          aria-hidden
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  )
}