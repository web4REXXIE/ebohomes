// The tools inside each person's dashboard. Used by the menu "Dashboard" drop-down and the bottom bar.
export type DashboardLink = { label: string; href: string }

export const TENANT_LINKS: DashboardLink[] = [
  { label: 'Dashboard overview', href: '/home' },
  { label: 'My Rental Journey', href: '/journey' },
  { label: 'My Applications', href: '/applications' },
  { label: 'Tenancy & Payments', href: '/tenancies' },
  { label: 'My Viewings', href: '/viewings' },
  { label: 'Messages', href: '/messages' },
  { label: 'Notifications', href: '/notifications' },
]

export const LANDLORD_LINKS: DashboardLink[] = [
  { label: 'Dashboard overview', href: '/dashboard' },
  { label: 'My Properties', href: '/dashboard/listings' },
  { label: 'Viewings', href: '/dashboard/viewings' },
  { label: 'Applications', href: '/dashboard/applications' },
  { label: 'Tenancies', href: '/dashboard/tenancies' },
  { label: 'Payments', href: '/dashboard/payments' },
  { label: 'Messages', href: '/dashboard/messages' },
]

export function dashboardLinks(role: string | null | undefined): DashboardLink[] {
  return role === 'landlord' ? LANDLORD_LINKS : TENANT_LINKS
}

// True when the page belongs to the dashboard, so the Dashboard tab can be highlighted.
export function isDashboardPath(pathname: string): boolean {
  return ['/home', '/dashboard', '/applications', '/tenancies', '/viewings', '/journey', '/messages', '/notifications']
    .some((p) => pathname === p || pathname.startsWith(p + '/'))
}