'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const ROLES = ['support', 'verifier', 'reviewer', 'finance', 'payout_approver', 'super_admin']

export default function StaffRolesPage() {
  const [admins, setAdmins] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [pick, setPick] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = async () => {
    const { data: a } = await supabase.from('profiles').select('id, full_name').eq('role', 'admin')
    const { data: r } = await supabase.from('staff_roles').select('user_id, role')
    setAdmins(a ?? [])
    setRoles(r ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const grant = async (userId: string) => {
    setMsg('')
    const role = pick[userId] ? pick[userId] : ROLES[0]
    const { error } = await supabase.rpc('grant_staff_role', { p_user: userId, p_role: role })
    if (error) setMsg(error.message)
    load()
  }

  const revoke = async (userId: string, role: string) => {
    setMsg('')
    const { error } = await supabase.rpc('revoke_staff_role', { p_user: userId, p_role: role })
    if (error) setMsg(error.message)
    load()
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">Staff Roles</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Only a super admin can grant or remove roles. Roles are recorded now and will be enforced once payouts exist.
      </p>
      {msg && <p className="text-sm text-destructive mb-3">{msg}</p>}
      {loading ? (
        <Loader2 className="animate-spin text-primary" size={24} />
      ) : (
        <div className="space-y-3">
          {admins.map((a) => (
            <div key={a.id} className="bg-card border border-border rounded-lg p-4">
              <p className="font-medium text-foreground">{a.full_name ? a.full_name : a.id}</p>
              <div className="flex flex-wrap gap-2 my-2">
                {roles.filter((r) => r.user_id === a.id).map((r) => (
                  <button key={r.role} onClick={() => revoke(a.id, r.role)} className="text-xs border border-border rounded-full px-2 py-1" title="Tap to remove">
                    {r.role} ✕
                  </button>
                ))}
                {roles.filter((r) => r.user_id === a.id).length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
              </div>
              <div className="flex gap-2">
                <select value={pick[a.id] ? pick[a.id] : ROLES[0]} onChange={(e) => setPick((p) => ({ ...p, [a.id]: e.target.value }))} className="bg-input border border-border rounded-md px-2 py-1.5 text-sm">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button onClick={() => grant(a.id)} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm">Grant</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}