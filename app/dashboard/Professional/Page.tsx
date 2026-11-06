'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowLeft, BadgeCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const field = 'w-full min-h-12 rounded-lg border border-border bg-input px-3 py-2.5 text-base'
const lbl = 'mb-1 block text-sm font-semibold text-foreground'
const when = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-NG') : '')

const TONE: Record<string, string> = {
  neutral: 'border-slate-300 bg-slate-50 text-slate-900',
  good: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  bad: 'border-red-300 bg-red-50 text-red-900',
}

const STATUS: Record<string, { tone: string; title: string; text: string }> = {
  pending: { tone: 'warn', title: 'Under review',
    text: 'EboHomes is reviewing your application. You can still update your details below. You can keep drafting property authority claims, but they can only be sent after approval.' },
  approved: { tone: 'good', title: 'Approved',
    text: 'You are an approved professional. This does not approve any property. Each property is still reviewed separately.' },
  rejected: { tone: 'bad', title: 'Not approved',
    text: 'Your application was not approved. Read the reason, update your details and send it again.' },
  suspended: { tone: 'bad', title: 'Suspended',
    text: 'Your professional profile is suspended. Existing tenancies and applications are not affected. Please contact EboHomes.' },
}

type Pro = {
  found: boolean; kind?: string; status?: string; licence_body?: string | null; licence_number?: string | null
  licence_checked?: boolean; submitted_at?: string; reviewed_at?: string | null; decision_note?: string | null
}

export default function ProfessionalPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [pro, setPro] = useState<Pro | null>(null)
  const [idVerified, setIdVerified] = useState<boolean | null>(null)
  const [kind, setKind] = useState('')
  const [body, setBody] = useState('')
  const [num, setNum] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const [{ data, error }, { data: prof }] = await Promise.all([
      supabase.rpc('professional_my'),
      supabase.from('profiles').select('verified, verification_status').eq('id', user.id).maybeSingle(),
    ])
    if (error) { setErr(error.message); setLoading(false); return }
    const p = (data ?? { found: false }) as Pro
    setPro(p)
    setIdVerified(!!(prof?.verified === true || prof?.verification_status === 'verified'))
    if (p.found) { setKind(p.kind ?? ''); setBody(p.licence_body ?? ''); setNum(p.licence_number ?? '') }
    setLoading(false)
  }, [router])
  useEffect(() => { load() }, [load])

  const status = pro?.found ? pro.status : undefined
  const locked = status === 'approved' || status === 'suspended'
  const info = status ? STATUS[status] : null

  async function submit() {
    if (!kind) { setErr('Choose agent or property manager.'); return }
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('professional_apply', {
      p_kind: kind, p_licence_body: body.trim() || null, p_licence_number: num.trim() || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg(status === 'rejected' ? 'Sent again for review.' : status === 'pending' ? 'Details updated.' : 'Application sent. EboHomes will review it.')
    await load()
  }

  if (loading) return <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-24">
      <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold"><ArrowLeft size={16} aria-hidden /> Dashboard</Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><BadgeCheck size={20} aria-hidden /> Professional profile</h1>
        <p className="text-sm text-muted-foreground">For agents and property managers who list properties they do not own.</p>
      </div>

      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        Approval confirms you as a professional. It never approves a property. Each property needs its own authority review.
        Licence or registration details are optional and are never shown publicly.
      </p>

      {idVerified === false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Identity verification comes first</p>
          <p>Your professional profile can only be approved after your identity is verified.</p>
          <Link href="/dashboard/verify" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">Get verified</Link>
        </div>)}

      {info && (
        <div className={`rounded-lg border p-3 text-sm ${TONE[info.tone]}`}>
          <p className="font-semibold">{info.title}{pro?.reviewed_at ? ` · ${when(pro.reviewed_at)}` : ''}</p>
          <p>{info.text}</p>
          {pro?.decision_note && <p className="mt-2 border-t border-current/20 pt-2">Reason: {pro.decision_note}</p>}
          {pro?.licence_checked && <p className="mt-2 border-t border-current/20 pt-2">EboHomes has checked your licence details.</p>}
        </div>)}

      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {msg && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>}

      <section className="space-y-3">
        <div>
          <label className={lbl} htmlFor="kind">I work as</label>
          <select id="kind" className={field} value={kind} disabled={locked || busy} onChange={(e) => setKind(e.target.value)}>
            <option value="">Choose...</option>
            <option value="agent">Real estate agent</option>
            <option value="manager">Property manager</option>
          </select>
        </div>
        <div>
          <label className={lbl} htmlFor="body">Licensing or registration body (optional)</label>
          <input id="body" className={field} maxLength={120} value={body} disabled={locked || busy} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div>
          <label className={lbl} htmlFor="num">Licence or registration number (optional)</label>
          <input id="num" className={field} maxLength={60} value={num} disabled={locked || busy} onChange={(e) => setNum(e.target.value)} />
        </div>
        {!locked && (
          <button type="button" onClick={submit} disabled={busy || !kind}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {!pro?.found ? 'Apply' : status === 'rejected' ? 'Send again for review' : 'Update my details'}
          </button>)}
      </section>
    </div>
  )
          }
