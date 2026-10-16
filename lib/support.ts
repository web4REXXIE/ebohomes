import { supabase } from '@/lib/supabase'

export type SupportCategory =
  | 'general' | 'property' | 'viewing' | 'application' | 'payment'
  | 'tenancy' | 'maintenance' | 'complaint' | 'renewal'

export type SupportStatus = 'open' | 'pending' | 'closed'

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  general: 'General',
  property: 'Property',
  viewing: 'Viewing',
  application: 'Application',
  payment: 'Payment',
  tenancy: 'Tenancy',
  maintenance: 'Maintenance',
  complaint: 'Complaint',
  renewal: 'Renewal',
}

export const TENANT_CATEGORIES: SupportCategory[] = [
  'general', 'property', 'viewing', 'application', 'payment', 'tenancy', 'maintenance', 'complaint', 'renewal',
]
export const LANDLORD_CATEGORIES: SupportCategory[] = [
  'general', 'property', 'viewing', 'application', 'payment', 'tenancy', 'maintenance', 'complaint', 'renewal',
]

export type SupportThread = {
  id: string
  customer_id: string
  customer_role: 'tenant' | 'landlord'
  category: SupportCategory
  subject: string
  listing_id: string | null
  application_id: string | null
  tenancy_id: string | null
  status: SupportStatus
  assigned_to: string | null
  created_at: string
  updated_at: string
  last_message_at: string
}

export type SupportMessage = {
  id: string
  thread_id: string
  sender_id: string
  sender_kind: 'customer' | 'staff'
  message: string
  flagged: boolean
  relayed_from_thread_id: string | null
  created_at: string
  read_at: string | null
}

export const THREAD_COLUMNS =
  'id, customer_id, customer_role, category, subject, listing_id, application_id, tenancy_id, status, assigned_to, created_at, updated_at, last_message_at'

export const MESSAGE_COLUMNS =
  'id, thread_id, sender_id, sender_kind, message, flagged, relayed_from_thread_id, created_at, read_at'

// Total unread: old inbox history + new support inbox (one database function).
export async function getUnreadMessageCount(): Promise<number> {
  const { data, error } = await supabase.rpc('my_unread_message_count')
  if (error) {
    console.error('Unread count failed:', error.message)
    return 0
  }
  return typeof data === 'number' ? data : 0
}

export function formatTime(iso: string) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}