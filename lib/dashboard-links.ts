// The tools inside each person's dashboard. Used by the menu "Dashboard" drop-down and the bottom bar.
export type DashboardLink = { label: string; href: string }

export const TENANT_LINKS: DashboardLink[] = [
  { label: 'Dashboard overview', href: '/home' },
  { label: 'My application', href: '/journey' },
  { label: 'My home', href: '/tenancies' },
  { label: 'Inbox', href: '/messages' },
]

export const LANDLORD_LINKS: DashboardLink[] = [
  { label: 'Dashboard overview', href: '/dashboard' },
  { label: 'Properties', href: '/dashboard/listings' },
  { label: 'Rentals', href: '/dashboard/applications' },
  { label: 'Money', href: '/dashboard/payments' },
  { label: 'Messages', href: '/dashboard/messages' },
]

export function dashboardLinks(role: string | null | undefined): DashboardLink[] {
  return role === 'landlord' ? LANDLORD_LINKS : TENANT_LINKS
}

// True when the page belongs to the dashboard, so the Dashboard tab can be highlighted.
export function isDashboardPath(pathname: string): boolean {
  return ['/home', '/dashboard', '/applications', '/tenancies', '/viewings', '/inspections', '/journey', '/messages', '/notifications']
    .some((p) => pathname === p || pathname.startsWith(p + '/'))
}
