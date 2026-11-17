// The landlord dashboard has six places in its menu. Inside four of them (Properties, Rentals, Money, Account)
// the pages that used to have their own menu entry are shown as a row of tabs at the top of the page.
// This file only lists those tabs. It has no imports, so it can be tested directly.
// Nothing here decides who may see a page: each page and the dashboard layout keep their own access checks.

export type SectionTab = { label: string; href: string }
export type Section = { key: string; label: string; tabs: SectionTab[] }

export const LANDLORD_SECTIONS: Section[] = [
  {
    key: 'properties',
    label: 'Properties',
    tabs: [
      { label: 'My properties', href: '/dashboard/listings' },
      { label: 'List a property', href: '/dashboard/estates' },
      { label: 'Inspection requests', href: '/dashboard/inspection-requests' },
      { label: 'Analytics', href: '/dashboard/analytics' },
    ],
  },
  {
    key: 'rentals',
    label: 'Rentals',
    tabs: [
      { label: 'Applications', href: '/dashboard/applications' },
      { label: 'Viewings', href: '/dashboard/viewings' },
      { label: 'Tenancies', href: '/dashboard/tenancies' },
    ],
  },
  {
    key: 'money',
    label: 'Money',
    tabs: [
      { label: 'Payments', href: '/dashboard/payments' },
      { label: 'Payouts', href: '/dashboard/payouts' },
      { label: 'Payout account', href: '/dashboard/payout-account' },
    ],
  },
  {
    key: 'account',
    label: 'Account',
    tabs: [
      { label: 'Profile', href: '/dashboard/profile' },
      { label: 'Verification', href: '/dashboard/verify' },
      { label: 'Professional profile', href: '/dashboard/professional' },
      { label: 'My company', href: '/dashboard/company' },
      // This page is outside the dashboard, so it is never highlighted. It is here so Help is still one tap away.
      { label: 'Help & support', href: '/contact' },
    ],
  },
]

// A tab is active on its own page and on pages inside it (for example one tenancy under Tenancies).
export function tabIsActive(pathname: string, tab: SectionTab): boolean {
  return pathname === tab.href || pathname.startsWith(tab.href + '/')
}

// The section whose tabs belong on this page, or null when the page has no tabs (the dashboard home, Messages,
// and the listing forms such as edit and authority).
export function sectionForPath(pathname: string): Section | null {
  return LANDLORD_SECTIONS.find((s) => s.tabs.some((t) => tabIsActive(pathname, t))) ?? null
}
