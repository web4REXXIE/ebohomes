'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useUnreadNotifications } from '@/lib/use-unread-notifications'

export function NotificationBell() {
  const { count } = useUnreadNotifications()
  const label = count > 0 ? `Notifications, ${count} unread` : 'Notifications'

  return (
    <Link
      href="/notifications"
      className="relative flex h-11 w-11 items-center justify-center rounded-xl hover:bg-muted transition-colors text-foreground/70"
      aria-label={label}
    >
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}