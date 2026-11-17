// The admin menu has six places: Overview, Properties, Rentals, Money, Trust & Issues and Records.
// Inside five of them the pages that used to have their own menu entry are shown as a row of tabs at the top.
// This file only lists those tabs. It has no runtime imports, so it can be tested directly.
// Nothing here decides who may see a page: the admin layout and each admin API keep their own access checks.

import type { Section } from './landlord-sections'

export const ADMIN_SECTIONS: Section[] = [
  {
    key: 'properties',
    label: 'Properties',
    tabs: [
      { label: 'Listings', href: '/admin/property-review' },
      { label: 'Authority', href: '/admin/listing-authority' },
      { label: 'Holds & freezes', href: '/admin/holds' },
      { label: 'Landlord ID', href: '/admin/verify-landlords' },
      { label: 'Inspections', href: '/admin/inspections' },
      { label: 'Remote requests', href: '/admin/remote-inspections' },
      { label: 'Remote reviews', href: '/admin/remote-inspection-reviews' },
      { label: 'Surroundings', href: '/admin/surroundings' },
    ],
  },
  {
    key: 'rentals',
    label: 'Rentals',
    tabs: [
      { label: 'Applications', href: '/admin/applications' },
      { label: 'Tenant ID', href: '/admin/verify-tenants' },
      { label: 'Viewings', href: '/admin/viewings' },
      { label: 'Offers', href: '/admin/offers' },
      { label: 'Reservations', href: '/admin/reservations' },
      { label: 'Finalization', href: '/admin/finalization' },
      { label: 'Handovers', href: '/admin/handovers' },
      { label: 'Tenancy issues', href: '/admin/cases' },
    ],
  },
  {
    key: 'money',
    label: 'Money',
    tabs: [
      { label: 'Payment evidence', href: '/admin/payment-submissions' },
      { label: 'Payments', href: '/admin/payments' },
      { label: 'Payouts', href: '/admin/payouts' },
      { label: 'Payout accounts', href: '/admin/payout-accounts' },
      { label: 'Rent payees', href: '/admin/payee-requests' },
      { label: 'Inspector pay', href: '/admin/inspection-payouts' },
    ],
  },
  {
    key: 'trust',
    label: 'Trust & Issues',
    tabs: [
      { label: 'Trust operations', href: '/admin/operations' },
      { label: 'Risk alerts', href: '/admin/risk' },
      { label: 'Reports', href: '/admin/reports' },
      { label: 'Remote disputes', href: '/admin/remote-inspection-disputes' },
      { label: 'Landlord trust', href: '/admin/trust' },
      { label: 'Support', href: '/admin/support' },
      { label: 'Contact messages', href: '/admin/contact-messages' },
    ],
  },
  {
    key: 'records',
    label: 'Records',
    tabs: [
      { label: 'Audit log', href: '/admin/audit-log' },
      { label: 'Users', href: '/admin/users' },
      { label: 'Professionals', href: '/admin/professionals' },
      { label: 'Companies', href: '/admin/organizations' },
      { label: 'Staff roles', href: '/admin/staff-roles' },
    ],
  },
]
