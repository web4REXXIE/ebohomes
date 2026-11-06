'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowLeft, Building2, Upload, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { uploadOrganizationFile } from '@/lib/organization-client'
import { AUTHORITY_ACCEPT } from '@/lib/authority-evidence'
import { ORG_DOC_LABELS, ORG_DOC_TYPE_VALUES, ORG_LOGO_ACCEPT, type OrgDocType } from '@/lib/organization-evidence'

const field = 'w-full min-h-12 rounded-lg border border-border bg-input px-3 py-2.5 text-base'
const lbl = 'mb-1 block text-sm font-semibold text-foreground'
const hint = 'mt-1 text-xs text-muted-foreground'
const when = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-NG') : '')

const TONE: Record<string, string> = {
  neutral: 'border-slate-300 bg-slate-50 text-slate-900',
  good: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  bad: 'border-red-300 bg-red-50 text-red-900',
}

const STATUS: Record<string, { tone: string; title: string; text: string }> = {
  draft: { tone: 'neutral', title: 'Not submitted', text: 'Fill in your company details, add your documents, then send it for review.' },
  pending_review: { tone: 'warn', title: 'Pending review', text: 'EboHomes is reviewing your company. You can edit again if more information is requested.' },
  info_required: { tone: 'warn', title: 'Additional information required', text: 'EboHomes needs more from you. Read the note, update your company and send it again.' },
  approved: { tone: 'good', title: 'Approved', text: 'Your company is verified. This does not approve any property or any person who works for you. Each property is still reviewed separately.' },
  rejected: { tone: 'bad', title: 'Not approved', text: 'Your company was not approved. Read the reason, update your details and send it again.' },
  suspended: { tone: 'bad', title: 'Suspended', text: 'Your company profile is suspended. Existing tenancies and applications are not affected. Please contact EboHomes.' },
}

const SERVICE_IDEAS = ['Property sales', 'Rentals', 'Property management', 'Land sales', 'Property valuation', 'Facility management']

type Doc = { id: string; doc_type: OrgDocType; name: string | null; uploaded_at: string; withdrawn_at: string | null; status: string; reason?: string | null }
type Org = {
  found: boolean; id?: string; status?: string; slug?: string | null; name?: string; description?: string | null; has_logo?: boolean
  business_email?: string | null; business_phone?: string | null; business_address?: string | null
  public_email?: string | null; public_phone?: string | null
  operating_locations?: string[]; services?: string[]; areas_served?: string[]
  reg_type?: string | null; reg_number?: string | null; rep_name?: string | null; rep_role?: string | null; rep_phone?: string | null
  change_pending?: boolean; pending_name?: string | null; pending_reg_number?: string | null; pending_logo?: boolean
  submitted_at?: string | null; reviewed_at?: string | null; decision_note?: string | null; documents?: Doc[]
}

const toList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)

export default function CompanyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<Org | null>(null)
  const [idVerified, setIdVerified] = useState<boolean | null>(null)
  const [proStatus, setProStatus] = useState<string>('none')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [addr, setAddr] = useState('')
  const [pubEmail, setPubEmail] = useState('')
  const [pubPhone, setPubPhone] = useState('')
  const [locs, setLocs] = useState('')
  const [svcs, setSvcs] = useState('')
  const [areas, setAreas] = useState('')
  const [regType, setRegType] = useState('')
  const [regNum, setRegNum] = useState('')
  const [repName, setRepName] = useState('')
  const [repRole, setRepRole] = useState('')
  const [repPhone, setRepPhone] = useState('')
  const [docType, setDocType] = useState<OrgDocType | ''>('')
  const docRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  const fill = (o: Org) => {
    setName(o.name ?? ''); setDesc(o.description ?? ''); setEmail(o.business_email ?? ''); setPhone(o.business_phone ?? '')
    setAddr(o.business_address ?? ''); setPubEmail(o.public_email ?? ''); setPubPhone(o.public_phone ?? '')
    setLocs((o.operating_locations ?? []).join(', ')); setSvcs((o.services ?? []).join(', ')); setAreas((o.areas_served ?? []).join(', '))
    setRegType(o.reg_type ?? ''); setRegNum(o.reg_number ?? ''); setRepName(o.rep_name ?? ''); setRepRole(o.rep_role ?? ''); setRepPhone(o.rep_phone ?? '')
  }

  const load = useCallback(async (refill = true) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const [{ data, error }, { data: prof }, { data: ps }] = await Promise.all([
      supabase.rpc('organization_my'),
      supabase.from('profiles').select('verified, verification_status').eq('id', user.id).maybeSingle(),
      supabase.rpc('professional_my'),
    ])
    if (error) { setErr(error.message); setLoading(false); return }
    const o = (data ?? { found: false }) as Org
    setOrg(o)
    setIdVerified(!!(prof?.verified === true || prof?.verification_status === 'verified'))
    setProStatus(ps?.found ? (ps.status ?? 'none') : 'none')
    if (o.found && refill) fill(o)
    setLoading(false)
  }, [router])
  useEffect(() => { load() }, [load])

  const status = org?.found ? (org.status ?? 'draft') : 'draft'
  const exists = !!org?.found
  const frozen = status === 'pending_review' || status === 'suspended'
  const info = STATUS[status]
  const docs = (org?.documents ?? []).filter((d) => !d.withdrawn_at)

  const payload = () => ({
    name, description: desc, business_email: email, business_phone: phone, business_address: addr,
    public_email: pubEmail, public_phone: pubPhone,
    operating_locations: toList(locs), services: toList(svcs), areas_served: toList(areas),
    reg_type: regNum.trim() ? regType : '', reg_number: regNum, rep_name: repName, rep_role: repRole, rep_phone: repPhone,
  })

  async function save(): Promise<boolean> {
    setErr(null); setMsg(null); setBusy(true)
    const { data, error } = await supabase.rpc('organization_save', { p: payload() })
    setBusy(false)
    if (error) { setErr(error.message); return false }
    setMsg(data?.change_pending ? 'Saved. Changes to your name or registration number wait for EboHomes to approve them. Your approved details stay live meanwhile.' : 'Saved.')
    await load(false)
    return true
  }

  async function sendForReview() {
    if (!(await save())) return
    setErr(null); setMsg(null); setBusy(true)
    const { error } = await supabase.rpc('organization_submit')
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg('Sent. EboHomes will review your company.')
    await load()
  }

  async function onDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!docType) { setErr('Choose what kind of document this is first.'); return }
    setErr(null); setMsg(null); setBusy(true)
    const r = await uploadOrganizationFile(file, 'document', docType)
    setBusy(false)
    if (r.error) { setErr(r.error); return }
    setMsg('Document added.'); setDocType('')
    await load(false)
  }

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr(null); setMsg(null); setBusy(true)
    const r = await uploadOrganizationFile(file, 'logo')
    setBusy(false)
    if (r.error) { setErr(r.error); return }
    setMsg(r.pending ? 'Logo uploaded. EboHomes will review it. Your current approved logo stays live meanwhile.' : 'Logo saved.')
    await load(false)
  }

  async function withdraw(d: Doc) {
    if (!window.confirm('Remove this document? EboHomes keeps a record that it was added.')) return
    setErr(null); setMsg(null); setBusy(true)
    const { error } = await supabase.rpc('organization_withdraw_document', { p_doc: d.id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    await load(false)
  }

  if (loading) return <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>

  const btn = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50'

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-24">
      <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold"><ArrowLeft size={16} aria-hidden /> Dashboard</Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><Building2 size={20} aria-hidden /> My company</h1>
        <p className="text-sm text-muted-foreground">For real estate businesses that list or manage properties for owners.</p>
      </div>

      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        Company approval confirms that the business exists. It never approves a property and never approves your staff.
        Each property still needs its own authority review. You need a verified identity and an approved professional profile before you can send a property for a company.
      </p>

      <div className="space-y-2">
        <p className={`rounded-lg border p-3 text-sm ${idVerified ? TONE.good : TONE.warn}`}>
          {idVerified ? 'Your identity is verified.' : <>Your identity must be verified before your company can be approved. <Link href="/dashboard/verify" className="font-semibold underline">Get verified</Link></>}
        </p>
        <p className={`rounded-lg border p-3 text-sm ${proStatus === 'approved' ? TONE.good : TONE.warn}`}>
          {proStatus === 'approved' ? 'Your professional profile is approved.' : <>Your professional profile is not approved yet. It is needed to send property claims for your company. <Link href="/dashboard/professional" className="font-semibold underline">Open professional profile</Link></>}
        </p>
      </div>

      {info && (
        <div className={`rounded-lg border p-3 text-sm ${TONE[info.tone]}`}>
          <p className="font-semibold">{info.title}{org?.reviewed_at && status !== 'draft' ? ` · ${when(org.reviewed_at)}` : ''}</p>
          <p>{info.text}</p>
          {org?.decision_note && ['rejected', 'info_required', 'suspended'].includes(status) && <p className="mt-2 border-t border-current/20 pt-2">Note from EboHomes: {org.decision_note}</p>}
          {status === 'approved' && org?.slug && <p className="mt-2 border-t border-current/20 pt-2"><Link href={`/company/${org.slug}`} className="font-semibold underline">View your public profile</Link></p>}
        </div>)}

      {org?.change_pending && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          A change is waiting for EboHomes to review{org.pending_name ? `: new name "${org.pending_name}"` : ''}{org.pending_reg_number ? `, new registration number ${org.pending_reg_number}` : ''}{org.pending_logo ? ', new logo' : ''}.
          Your approved details stay live meanwhile.
        </p>)}

      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {msg && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">Company details</h2>
        <div><label className={lbl} htmlFor="name">Company or business name</label>
          <input id="name" className={field} maxLength={200} value={name} disabled={frozen || busy} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className={lbl} htmlFor="desc">Business description</label>
          <textarea id="desc" className={field} rows={4} maxLength={2000} value={desc} disabled={frozen || busy} onChange={(e) => setDesc(e.target.value)} /></div>
        <div><label className={lbl} htmlFor="email">Business email (private)</label>
          <input id="email" type="email" className={field} value={email} disabled={frozen || busy} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className={lbl} htmlFor="phone">Business phone (private)</label>
          <input id="phone" type="tel" className={field} value={phone} disabled={frozen || busy} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><label className={lbl} htmlFor="addr">Business address (private)</label>
          <input id="addr" className={field} maxLength={400} value={addr} disabled={frozen || busy} onChange={(e) => setAddr(e.target.value)} />
          <p className={hint}>Your business email, phone and address are only seen by EboHomes. They are never shown publicly.</p></div>
        <div><label className={lbl} htmlFor="locs">Operating locations</label>
          <input id="locs" className={field} placeholder="Abakaliki, Enugu" value={locs} disabled={frozen || busy} onChange={(e) => setLocs(e.target.value)} />
          <p className={hint}>Separate with commas.</p></div>
        <div><label className={lbl} htmlFor="svcs">Real estate services offered</label>
          <input id="svcs" className={field} placeholder="Rentals, Property management" value={svcs} disabled={frozen || busy} onChange={(e) => setSvcs(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            {SERVICE_IDEAS.map((s) => (
              <button key={s} type="button" disabled={frozen || busy || toList(svcs).includes(s)}
                onClick={() => setSvcs(toList(svcs).concat(s).join(', '))}
                className="min-h-11 rounded-full border border-border px-3 text-xs font-semibold disabled:opacity-40">+ {s}</button>))}
          </div></div>
        <div><label className={lbl} htmlFor="areas">Areas served</label>
          <input id="areas" className={field} placeholder="Abakaliki, Afikpo, Ezza" value={areas} disabled={frozen || busy} onChange={(e) => setAreas(e.target.value)} />
          <p className={hint}>Separate with commas.</p></div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">Public contact (optional)</h2>
        <p className="text-xs text-muted-foreground">Only fill these in if you want the public to see them on your company profile once approved. Leave them empty to show no contact details.</p>
        <div><label className={lbl} htmlFor="pemail">Public email</label>
          <input id="pemail" type="email" className={field} value={pubEmail} disabled={frozen || busy} onChange={(e) => setPubEmail(e.target.value)} /></div>
        <div><label className={lbl} htmlFor="pphone">Public phone</label>
          <input id="pphone" type="tel" className={field} value={pubPhone} disabled={frozen || busy} onChange={(e) => setPubPhone(e.target.value)} /></div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">Business registration</h2>
        <p className="text-xs text-muted-foreground">Optional if your business has no registration number. EboHomes will then look at other evidence. A professional licence number is never required.</p>
        <div><label className={lbl} htmlFor="rt">Type</label>
          <select id="rt" className={field} value={regType} disabled={frozen || busy} onChange={(e) => setRegType(e.target.value)}>
            <option value="">Choose...</option>
            <option value="rc">RC (registered company)</option>
            <option value="bn">BN (business name)</option>
            <option value="it">IT (incorporated trustees)</option>
            <option value="other">Other</option>
          </select></div>
        <div><label className={lbl} htmlFor="rn">Registration number</label>
          <input id="rn" className={field} placeholder="RC1234567" value={regNum} disabled={frozen || busy} onChange={(e) => setRegNum(e.target.value)} />
          <p className={hint}>EboHomes checks the number against the public CAC record by hand.</p></div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-foreground">Primary authorized representative</h2>
        <div><label className={lbl} htmlFor="rep">Full name</label>
          <input id="rep" className={field} value={repName} disabled={frozen || busy} onChange={(e) => setRepName(e.target.value)} /></div>
        <div><label className={lbl} htmlFor="rrole">Role in the company</label>
          <input id="rrole" className={field} placeholder="Director, Manager..." value={repRole} disabled={frozen || busy} onChange={(e) => setRepRole(e.target.value)} /></div>
        <div><label className={lbl} htmlFor="rphone">Phone</label>
          <input id="rphone" type="tel" className={field} value={repPhone} disabled={frozen || busy} onChange={(e) => setRepPhone(e.target.value)} /></div>
      </section>

      {!frozen && (
        <button type="button" onClick={save} disabled={busy || name.trim().length < 2} className={`${btn} border border-border bg-card text-foreground`}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}{exists ? 'Save details' : 'Create my company'}
        </button>)}

      {exists && (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-bold text-foreground">Logo</h2>
            <p className="text-xs text-muted-foreground">Use only your own company logo. A JPG, PNG or WEBP image up to 2MB. It is shown publicly after EboHomes approves your company.</p>
            <p className="text-sm">{org?.has_logo ? 'A logo is on file.' : 'No logo yet.'}</p>
            {!frozen && (
              <>
                <input ref={logoRef} type="file" accept={ORG_LOGO_ACCEPT} className="hidden" onChange={onLogo} />
                <button type="button" disabled={busy} onClick={() => logoRef.current?.click()} className={`${btn} border border-border bg-card text-foreground`}>
                  <Upload size={16} aria-hidden /> {org?.has_logo ? 'Replace logo' : 'Upload logo'}
                </button>
              </>)}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-foreground">Documents</h2>
            <p className="text-xs text-muted-foreground">Private. Only EboHomes reviewers can open them. JPG, PNG, WEBP or PDF up to 10MB.</p>
            <ul className="space-y-2">
              {docs.length === 0 && <li className="text-sm text-muted-foreground">No documents yet.</li>}
              {docs.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">{ORG_DOC_LABELS[d.doc_type] ?? d.doc_type}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.name ?? 'File'} · added {when(d.uploaded_at)}</p>
                    <p className="text-xs">{d.status === 'accepted' ? 'Accepted' : d.status === 'rejected' ? `Not accepted${d.reason ? `: ${d.reason}` : ''}` : 'Waiting for review'}</p>
                  </div>
                  {!frozen && (
                    <button type="button" aria-label="Remove document" disabled={busy} onClick={() => withdraw(d)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground">
                      <Trash2 size={16} aria-hidden />
                    </button>)}
                </li>))}
            </ul>
            {!frozen && (
              <>
                <div><label className={lbl} htmlFor="dt">What is this document?</label>
                  <select id="dt" className={field} value={docType} disabled={busy} onChange={(e) => setDocType(e.target.value as OrgDocType | '')}>
                    <option value="">Choose...</option>
                    {ORG_DOC_TYPE_VALUES.map((t) => <option key={t} value={t}>{ORG_DOC_LABELS[t]}</option>)}
                  </select>
                  <p className={hint}>Needed: a document showing you may act for the company (board resolution, appointment letter or director listing). With a registration number, also add the registration certificate.</p></div>
                <input ref={docRef} type="file" accept={AUTHORITY_ACCEPT} className="hidden" onChange={onDoc} />
                <button type="button" disabled={busy || !docType} onClick={() => docRef.current?.click()} className={`${btn} border border-border bg-card text-foreground`}>
                  <Upload size={16} aria-hidden /> Add document
                </button>
              </>)}
          </section>

          {['draft', 'info_required', 'rejected'].includes(status) && (
            <button type="button" onClick={sendForReview} disabled={busy} className={`${btn} bg-primary text-primary-foreground`}>
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}{status === 'draft' ? 'Send for review' : 'Send again for review'}
            </button>)}
        </>)}
    </div>
  )
                          }
