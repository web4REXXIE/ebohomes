'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users, ShieldCheck, Search, Download, UserPlus, MoreVertical, Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

const PAGE_SIZE = 10

export default function ManageUsersPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [verificationFilter, setVerificationFilter] = useState('all')

  const [stats, setStats] = useState({ total: 0, landlords: 0, tenants: 0, banned: 0 })
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

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
    setLoading(true)
    let query = supabase.from('profiles').select('*', { count: 'exact' })

    if (roleFilter !== 'all') query = query.eq('role', roleFilter)
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (verificationFilter !== 'all') query = query.eq('verification_status', verificationFilter)
    if (search.trim()) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,id.eq.${search}`
      )
    }

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to)

    if (!error) {
      setUsers(data ?? [])
      setTotalCount(count ?? 0)
    }
    setLoading(false)
  }, [page, roleFilter, statusFilter, verificationFilter, search])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleStatusChange(userId: string, newStatus: 'active' | 'suspended' | 'banned') {
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', userId)
    if (!error) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)))
      fetchStats()
    }
    setOpenMenuId(null)
  }

  function exportCsv() {
    const rows = users.map((u) => ({
      name: u.full_name ?? '',
      email: u.email ?? '',
      phone: u.phone ?? '',
      role: u.role ?? '',
      status: u.status ?? 'active',
      verification: u.verification_status ?? '',
      joined: new Date(u.created_at).toLocaleDateString(),
    }))
    const header = Object.keys(rows[0] ?? { name: '', email: '', phone: '', role: '', status: '', verification: '', joined: '' }).join(',')
    const body = rows.map((r) => Object.values(r).map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ebohomes-users-page${page}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const cards = [
    { label: 'Total Users', value: stats.total, icon: Users, tint: 'text-primary bg-primary/10' },
    { label: 'Landlords', value: stats.landlords, icon: Users, tint: 'text-amber-600 bg-amber-50' },
    { label: 'Tenants', value: stats.tenants, icon: Users, tint: 'text-blue-600 bg-blue-50' },
    { label: 'Banned Users', value: stats.banned, icon: ShieldCheck, tint: 'text-purple-600 bg-purple-50' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Manage Users</h1>
          <p className="text-sm text-muted-foreground">View, search and manage all users on the EboHomes platform.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 border border-border rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors"
          >
            <Download size={14} /> Export
          </button>
          <button className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold transition-colors">
            <UserPlus size={14} /> Add User
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.tint}`}>
              <c.icon size={18} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{c.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value) }}
            placeholder="Search by name, email, phone or user ID..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
            <select
              value={roleFilter}
              onChange={(e) => { setPage(1); setRoleFilter(e.target.value) }}
              className="w-full h-9 px-2 rounded-lg border border-border bg-background text-sm"
            >
              <option value="all">All Roles</option>
              <option value="landlord">Landlord</option>
              <option value="tenant">Tenant</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setPage(1); setStatusFilter(e.target.value) }}
              className="w-full h-9 px-2 rounded-lg border border-border bg-background text-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Verification</label>
            <select
              value={verificationFilter}
              onChange={(e) => { setPage(1); setVerificationFilter(e.target.value) }}
              className="w-full h-9 px-2 rounded-lg border border-border bg-background text-sm"
            >
              <option value="all">All Verification</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={24} /></div>
        ) : users.length === 0 ? (
          <p className="text-center py-16 text-sm text-muted-foreground">No users match your filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                    <th className="p-4 font-medium">User</th>
                    <th className="p-4 font-medium">Role</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Verification</th>
                    <th className="p-4 font-medium">Date Joined</th>
                    <th className="p-4 font-medium">Last Active</th>
                    <th className="p-4 font-medium text-right">Actions</th>
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
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                              {u.full_name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{u.full_name ?? 'Unnamed user'}</p>
                              <p className="text-xs text-muted-foreground truncate">{u.email ?? u.phone ?? u.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="capitalize text-xs font-medium px-2 py-1 rounded-full bg-secondary text-foreground">
                            {u.role ?? '—'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`capitalize text-xs font-medium px-2 py-1 rounded-full ${
                            status === 'active' ? 'bg-emerald-50 text-emerald-700'
                            : status === 'suspended' ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                          }`}>
                            {status}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`capitalize text-xs font-medium flex items-center gap-1 ${
                            verification === 'verified' ? 'text-emerald-700'
                            : verification === 'rejected' ? 'text-red-700'
                            : 'text-amber-700'
                          }`}>
                            {verification === 'verified' && <ShieldCheck size={12} />}
                            {verification}
                          </span>
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {u.last_active ? new Date(u.last_active).toLocaleString() : '—'}
                        </td>
                        <td className="p-4 text-right relative">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenuId === u.id && (
                            <div className="absolute right-4 top-full mt-1 z-10 bg-card border border-border rounded-lg shadow-lg w-40 py-1 text-left">
                              {status !== 'active' && (
                                <button onClick={() => handleStatusChange(u.id, 'active')} className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/50">
                                  Reactivate
                                </button>
                              )}
                              {status !== 'suspended' && (
                                <button onClick={() => handleStatusChange(u.id, 'suspended')} className="w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-secondary/50">
                                  Suspend
                                </button>
                              )}
                              {status !== 'banned' && (
                                <button onClick={() => handleStatusChange(u.id, 'banned')} className="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-secondary/50">
                                  Ban
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between p-4 border-t border-border text-sm text-muted-foreground">
              <p>
                Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} users
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-2">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40"
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