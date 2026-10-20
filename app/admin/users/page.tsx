'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Users, ShieldCheck, Search, Download, MoreVertical, Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate, fmtDateTime } from '@/lib/case-status'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: string | null
  status: string | null
  verification_status: string | null
  verified: boolean | null
  created_at: string
  last_active: string | null
}

type Status = 'active' | 'suspended' | 'banned'

const PAGE_SIZE = 10
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STATUS_TONE: Record<string, string> = {
  active: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  suspended: 'border-amber-300 bg-amber-50 text-amber-900',
  banned: 'border-red-300 bg-red-50 text-red-900',
}

const VERIFY_TONE: Record<string, string> = {
  verified: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  rejected: 'border-red-300 bg-red-50 text-red-900',
  pending: 'border-amber-300 bg-amber-50 text-amber-900',
}

const selectCls = 'h-11 w-full rounded-lg border border-border bg-background px-2 text-sm'

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${tone}`}
    >
      {children}
    </span>
  )
}

export default function ManageUsersPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [verificationFilter, setVerificationFilter] = useState('all')

  const [stats, setStats] = useState({ total: 0, landlords: 0, tenants: 0, banned: 0 })
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const requestId = useRef(0)

  // Wait until the person stops typing before searching.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Escape closes the actions menu.
  useEffect(() => {
    if (!openMenuId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openMenuId])

  const fetchStats = useCallback(async () => {
    const [{ count: total }, { count: landlords }, { count: tenants }, { count: banned }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'landlord'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'tenant'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'banned'),
    ])
    setStats({ total: total ?? 0, landlords: landlords ?? 0, tenants: tenants ?? 0, banned: banned ?? 0 })
  }, [])

  const fetchUsers = useCallback(async () => {
    const mine = ++requestId.current
    setLoading(true)
    setLoadError('')
    let query = supabase.from('profiles').select('*', { count: 'exact' })

    if (roleFilter !== 'all') query = query.eq('role', roleFilter)
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (verificationFilter !== 'all') query = query.eq('verification_status', verificationFilter)

    // Remove characters that would break the filter. Only search by ID when it looks like an ID.
    const term = debounced.trim().replace(/[,()%*\\]/g, ' ').trim()
    if (term) {
      const parts = [`full_name.ilike.%${term}%`, `email.ilike.%${term}%`, `phone.ilike.%${term}%`]
      if (UUID.test(term)) parts.push(`id.eq.${term}`)
      query = query.or(parts.join(','))
    }

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to)

    if (mine !== requestId.current) return // a newer search has started
    if (error) {
      setLoadError('Could not load users. Please try again.')
      console.error('users load failed:', error.message)
    } else {
      setUsers(data ?? [])
      setTotalCount(count ?? 0)
    }
    setLoading(false)
  }, [page, roleFilter, statusFilter, verificationFilter, debounced])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleStatusChange(user: Profile, newStatus: Status) {
    setOpenMenuId(null)
    if (busyId) return
    const name = user.full_name ?? 'this user'
    if (newStatus !== 'active') {
      const verb = newStatus === 'banned' ? 'Ban' : 'Suspend'
      if (!window.confirm(`${verb} ${name}? You can reactivate them later.`)) return
    }
    setBusyId(user.id)
    setNotice(null)
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', user.id)
    if (error) {
      setNotice({ ok: false, text: `Could not update ${name}: ${error.message}` })
    } else {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u)))
      setNotice({
        ok: true,
        text: newStatus === 'active' ? `${name} is active again.` : `${name} is now ${newStatus}.`,
      })
      fetchStats()
    }
    setBusyId(null)
  }

  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const header = ['name', 'email', 'phone', 'role', 'status', 'verification', 'joined']
    const lines = users.map((u) =>
      [
        u.full_name ?? '',
        u.email ?? '',
        u.phone ?? '',
        u.role ?? '',
        u.status ?? 'active',
        u.verification_status ?? '',
        new Date(u.created_at).toLocaleDateString('en-NG'),
      ].map(esc).join(',')
    )
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ebohomes-users-page${page}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const cards = [
    { label: 'Total users', value: stats.total, icon: Users, tint: 'text-primary bg-primary/10' },
    { label: 'Landlords', value: stats.landlords, icon: Users, tint: 'text-amber-700 bg-amber-50' },
    { label: 'Tenants', value: stats.tenants, icon: Users, tint: 'text-blue-700 bg-blue-50' },
    { label: 'Banned users', value: stats.banned, icon: ShieldCheck, tint: 'text-purple-700 bg-purple-50' },
  ]

  const ActionsMenu = ({ u, status }: { u: Profile; status: string }) => (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
        aria-label={`Actions for ${u.full_name ?? 'user'}`}
        aria-haspopup="menu"
        aria-expanded={openMenuId === u.id}
        disabled={busyId === u.id}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-50"
      >
        {busyId === u.id ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <MoreVertical size={16} aria-hidden />}
      </button>
      {openMenuId === u.id && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpenMenuId(null)}
          />
          <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-card py-1 shadow-lg">
            {status !== 'active' && (
              <button role="menuitem" onClick={() => handleStatusChange(u, 'active')} className="flex min-h-11 w-full items-center px-3 text-sm hover:bg-secondary/50">
                Reactivate
              </button>
            )}
            {status !== 'suspended' && (
              <button role="menuitem" onClick={() => handleStatusChange(u, 'suspended')} className="flex min-h-11 w-full items-center px-3 text-sm text-amber-800 hover:bg-secondary/50">
                Suspend
              </button>
            )}
            {status !== 'banned' && (
              <button role="menuitem" onClick={() => handleStatusChange(u, 'banned')} className="flex min-h-11 w-full items-center px-3 text-sm text-red-800 hover:bg-secondary/50">
                Ban
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-foreground">Manage Users</h1>
          <p className="text-sm text-muted-foreground">View, search and manage all users on the EboHomes platform.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={users.length === 0}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-secondary/50 disabled:opacity-50"
        >
          <Download size={14} aria-hidden /> Export this page
        </button>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.tint}`}>
              <c.icon size={18} aria-hidden />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{c.value.toLocaleString('en-NG')}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="mb-4 space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            aria-label="Search users"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value) }}
            placeholder="Search by name, email, phone or user ID"
            className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs font-semibold text-muted-foreground">
            Role
            <select
              value={roleFilter}
              onChange={(e) => { setPage(1); setRoleFilter(e.target.value) }}
              className={`${selectCls} mt-1 font-normal text-foreground`}
            >
              <option value="all">All roles</option>
              <option value="landlord">Landlord</option>
              <option value="tenant">Tenant</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">
            Status
            <select
              value={statusFilter}
              onChange={(e) => { setPage(1); setStatusFilter(e.target.value) }}
              className={`${selectCls} mt-1 font-normal text-foreground`}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">
            Verification
            <select
              value={verificationFilter}
              onChange={(e) => { setPage(1); setVerificationFilter(e.target.value) }}
              className={`${selectCls} mt-1 font-normal text-foreground`}
            >
              <option value="all">All verification</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>
      </div>

      {notice && (
        <p
          role={notice.ok ? 'status' : 'alert'}
          className={`mb-4 rounded-md border p-3 text-sm font-medium ${
            notice.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          {notice.text}
        </p>
      )}

      {loadError && (
        <p role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
          {loadError}{' '}
          <button onClick={fetchUsers} className="min-h-11 font-semibold underline">Try again</button>
        </p>
      )}

      <div className="rounded-xl border border-border bg-card">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={24} aria-label="Loading users" /></div>
        ) : users.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {loadError ? 'No users to show.' : 'No users match your filters.'}
          </p>
        ) : (
          <>
            {/* Phones: one card per user */}
            <ul className="divide-y divide-border md:hidden">
              {users.map((u) => {
                const status = u.status ?? 'active'
                const verification = u.verification_status ?? (u.verified ? 'verified' : 'pending')
                return (
                  <li key={u.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden>
                          {u.full_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{u.full_name ?? 'Unnamed user'}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.email ?? u.phone ?? u.id.slice(0, 8)}</p>
                        </div>
                      </div>
                      <ActionsMenu u={u} status={status} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Pill tone="border-slate-300 bg-slate-100 text-slate-800">{u.role ?? '—'}</Pill>
                      <Pill tone={STATUS_TONE[status] ?? STATUS_TONE.active}>{status}</Pill>
                      <Pill tone={VERIFY_TONE[verification] ?? VERIFY_TONE.pending}>
                        {verification === 'verified' && <ShieldCheck size={12} aria-hidden />}
                        {verification}
                      </Pill>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/60 p-3 text-sm">
                      <div>
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Joined</dt>
                        <dd className="font-medium text-foreground">{fmtDate(u.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Last active</dt>
                        <dd className="font-medium text-foreground">{u.last_active ? fmtDateTime(u.last_active) : '—'}</dd>
                      </div>
                    </dl>
                  </li>
                )
              })}
            </ul>

            {/* Larger screens: the table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">All users</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th scope="col" className="p-4 font-medium">User</th>
                    <th scope="col" className="p-4 font-medium">Role</th>
                    <th scope="col" className="p-4 font-medium">Status</th>
                    <th scope="col" className="p-4 font-medium">Verification</th>
                    <th scope="col" className="p-4 font-medium">Date joined</th>
                    <th scope="col" className="p-4 font-medium">Last active</th>
                    <th scope="col" className="p-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => {
                    const status = u.status ?? 'active'
                    const verification = u.verification_status ?? (u.verified ? 'verified' : 'pending')
                    return (
                      <tr key={u.id} className="hover:bg-secondary/30">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden>
                              {u.full_name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{u.full_name ?? 'Unnamed user'}</p>
                              <p className="truncate text-xs text-muted-foreground">{u.email ?? u.phone ?? u.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4"><Pill tone="border-slate-300 bg-slate-100 text-slate-800">{u.role ?? '—'}</Pill></td>
                        <td className="p-4"><Pill tone={STATUS_TONE[status] ?? STATUS_TONE.active}>{status}</Pill></td>
                        <td className="p-4">
                          <Pill tone={VERIFY_TONE[verification] ?? VERIFY_TONE.pending}>
                            {verification === 'verified' && <ShieldCheck size={12} aria-hidden />}
                            {verification}
                          </Pill>
                        </td>
                        <td className="p-4 text-muted-foreground">{fmtDate(u.created_at)}</td>
                        <td className="p-4 text-muted-foreground">{u.last_active ? fmtDateTime(u.last_active) : '—'}</td>
                        <td className="p-4 text-right">
                          <ActionsMenu u={u} status={status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm text-muted-foreground">
              <p>
                Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} users
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="min-h-11 rounded-lg border border-border px-4 font-semibold disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-2">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="min-h-11 rounded-lg border border-border px-4 font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}