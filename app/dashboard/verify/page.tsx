'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Clock, XCircle, FileText, Check, Landmark, Circle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  OWNERSHIP_BUCKET,
  OWNERSHIP_ACCEPT,
  validateOwnershipFile,
  buildOwnershipPath,
  isValidOwnershipPath,
  getOwnershipSignedUrl,
} from '@/lib/ownership-docs'
import { isSubmissionComplete } from '@/lib/landlord-verification'

type FormData = {
  business_name: string
  business_address: string
  cac_number: string
  account_type: string
  representative_name: string
  representative_role: string
  ownership_doc_url: string
  id_document_type: string
  id_document_url: string
  selfie_url: string
}

type PayoutState = 'loading' | 'none' | 'pending' | 'active' | 'unknown'

const ID_LABELS: Record<string, string> = {
  nin: 'NIN slip / card',
  drivers_licence: "Driver's licence",
  voters_card: "Voter's card",
  intl_passport: 'International passport',
}

// One shared definition of "submitted" (verification_status defaults to 'pending' in the database).
const hasAllDetails = (d: FormData) => isSubmissionComplete(d)

function ChecklistRow({ done, label, value }: { done: boolean; label: string; value: string }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {done ? (
        <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium text-foreground">{value}</p>
      </div>
    </li>
  )
}

// Module-level so it is defined before the effect that calls it.
// Fire-and-forget: asks the server to delete this user's own unused identity uploads.
async function cleanupOldFiles() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/verification-files/cleanup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  } catch {
    /* best effort */
  }
}

export default function GetVerifiedPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)

  const [docUploading, setDocUploading] = useState(false)
  const [docName, setDocName] = useState('')
  const [idUploading, setIdUploading] = useState('')
  const [idDocName, setIdDocName] = useState('')
  const [selfieName, setSelfieName] = useState('')
  const [docPreviewUrl, setDocPreviewUrl] = useState('')
  const [payout, setPayout] = useState<PayoutState>('loading')
  const [consent, setConsent] = useState(false)
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null)

  const [formData, setFormData] = useState<FormData>({
    business_name: '',
    business_address: '',
    cac_number: '',
    account_type: 'individual',
    representative_name: '',
    representative_role: '',
    ownership_doc_url: '', // stores a storage PATH, not a public URL
    id_document_type: '',
    id_document_url: '',
    selfie_url: '',
  })

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setMessage('You must be logged in.')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('account_type, representative_name, representative_role, business_name, business_address, cac_number, ownership_doc_url, id_document_type, id_document_url, selfie_url, verification_status, verified, rejection_reason, verification_reviewed_at')
        .eq('id', user.id)
        .single()

      if (!error && data) {
        setFormData({
          business_name: data.business_name || '',
          business_address: data.business_address || '',
          cac_number: data.cac_number || '',
          account_type: data.account_type || 'individual',
          representative_name: data.representative_name || '',
          representative_role: data.representative_role || '',
          ownership_doc_url: data.ownership_doc_url || '',
          id_document_type: data.id_document_type || '',
          id_document_url: data.id_document_url || '',
          selfie_url: data.selfie_url || '',
        })
        setStatus(data.verified ? 'verified' : (data.verification_status || null))
        setRejectionReason(data.rejection_reason || null)
        setVerifiedAt(data.verification_reviewed_at || null)

        // Remove this user's old, unused ID/selfie/document uploads (server checks ownership).
        if (!data.verified) cleanupOldFiles()

        // if a doc path already exists, validate it and generate a signed preview link
        if (data.ownership_doc_url) {
          if (isValidOwnershipPath(data.ownership_doc_url, user.id)) {
            const signedUrl = await getOwnershipSignedUrl(data.ownership_doc_url, user.id)
            if (signedUrl) setDocPreviewUrl(signedUrl)
          } else {
            // old/invalid value (e.g. a full URL) — clear it so the user re-uploads
            setFormData((p) => ({ ...p, ownership_doc_url: '' }))
          }
        }
      }
      setLoading(false)
    }
    loadProfile()
  }, [])

  // Payout account status comes from the existing /api/payout-account route.
  const loadPayout = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setPayout('unknown'); return }
      const res = await fetch('/api/payout-account', {
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      })
      if (!res.ok) { setPayout('unknown'); return }
      const j = await res.json()
      const items: { status: string }[] = Array.isArray(j?.items) ? j.items : []
      if (j?.current_id) setPayout('active')
      else if (items.some((i) => i.status === 'pending_review' || i.status === 'approved')) setPayout('pending')
      else setPayout('none')
    } catch {
      setPayout('unknown')
    }
  }, [])

  const underReview = status === 'pending' && hasAllDetails(formData)

  useEffect(() => {
    if (underReview) loadPayout()
  }, [underReview, loadPayout])

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return

    const err = validateOwnershipFile(file)
    if (err) {
      alert(err)
      input.value = ''
      return
    }

    setDocUploading(true)
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) {
      alert('You must be logged in.')
      setDocUploading(false)
      router.replace('/login')
      return
    }

    const filePath = buildOwnershipPath(user.id, 'verification', file)
    const { error: uploadError } = await supabase.storage
      .from(OWNERSHIP_BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      alert('Failed to upload document: ' + uploadError.message)
      setDocUploading(false)
      input.value = ''
      return
    }

    // store the PATH (not a public URL) — this is what gets saved to the database
    setFormData((p) => ({ ...p, ownership_doc_url: filePath }))
    setDocName(file.name)

    // signed URL just for immediate on-screen preview
    const signedUrl = await getOwnershipSignedUrl(filePath, user.id)
    if (signedUrl) setDocPreviewUrl(signedUrl)

    setDocUploading(false)
    input.value = ''
  }

  const removeDoc = () => {
    setFormData((p) => ({ ...p, ownership_doc_url: '' }))
    setDocName('')
    setDocPreviewUrl('')
  }

  const handleIdUpload = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'id' | 'selfie') => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    const validationError = validateOwnershipFile(file)
    if (validationError) {
      alert(validationError)
      input.value = ''
      return
    }
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) {
      alert('You must be logged in.')
      return
    }
    setIdUploading(kind)
    const filePath = buildOwnershipPath(user.id, kind === 'id' ? 'govid' : 'selfie', file)
    const { error: uploadError } = await supabase.storage
      .from(OWNERSHIP_BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      alert('Upload failed: ' + uploadError.message)
      setIdUploading('')
      input.value = ''
      return
    }
    if (kind === 'id') {
      setFormData((p) => ({ ...p, id_document_url: filePath }))
      setIdDocName(file.name)
    } else {
      setFormData((p) => ({ ...p, selfie_url: filePath }))
      setSelfieName(file.name)
    }
    setIdUploading('')
    input.value = ''
  }

  const canSubmit = hasAllDetails(formData) && consent

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setMessage('You must be logged in.')
      setSubmitting(false)
      return
    }

    if (
      !isValidOwnershipPath(formData.ownership_doc_url, user.id) ||
      !isValidOwnershipPath(formData.id_document_url, user.id) ||
      !isValidOwnershipPath(formData.selfie_url, user.id)
    ) {
      setMessage('One of your uploaded files is invalid. Please remove it and upload it again.')
      setSubmitting(false)
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        business_name: formData.business_name.trim(),
        business_address: formData.business_address.trim(),
        cac_number: formData.cac_number.trim() || null,
        account_type: formData.account_type,
        representative_name: formData.account_type === 'company' ? formData.representative_name.trim() : null,
        representative_role: formData.account_type === 'company' ? formData.representative_role.trim() : null,
        ownership_doc_url: formData.ownership_doc_url, // storage path
        id_document_type: formData.id_document_type,
        id_document_url: formData.id_document_url,
        selfie_url: formData.selfie_url,
        verification_status: 'pending',
      })
      .eq('id', user.id)

    setSubmitting(false)

    if (error) {
      setMessage('Failed to submit: ' + error.message)
      return
    }

    setRejectionReason(null)
    setStatus('pending')
    cleanupOldFiles()
    window.scrollTo({ top: 0 })
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-center text-muted-foreground">Loading...</div>
  }

  if (status === 'verified') {
    const company = formData.account_type === 'company'
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="bg-card border border-emerald-200 rounded-2xl p-6 text-center">
          <ShieldCheck size={40} className="mx-auto text-emerald-600 mb-3" />
          <h1 className="text-xl font-bold text-foreground mb-1">You&apos;re Verified</h1>
          <p className="text-sm text-muted-foreground">
            Your landlord account has been verified on EboHomes
            {verifiedAt ? ` on ${new Date(verifiedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
          </p>
        </div>

        <section className="bg-card border border-border rounded-2xl p-4" aria-label="What EboHomes checked">
          <h2 className="font-bold text-foreground mb-1">What EboHomes reviewed</h2>
          <ul className="divide-y divide-border">
            <ChecklistRow done label="Business" value={`${formData.business_name || '—'}${company ? ' (company)' : ''}`} />
            <ChecklistRow done label="Government ID and selfie" value="Reviewed" />
            <ChecklistRow done label="Property ownership / authority document" value="Reviewed" />
          </ul>
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            Verification confirms who you are and the documents you sent. It does not by itself prove you own a particular property.
          </p>
        </section>

        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900" aria-label="If your details change">
          <p className="font-semibold mb-1">If your details change</p>
          <p>
            Changing your name, business name, business address, CAC number, ID, selfie, documents or payout account sends your
            account back to review until EboHomes checks it again. Update them on your{' '}
            <Link href="/dashboard/profile" className="font-semibold underline">profile</Link>.
          </p>
        </section>

        <Link href="/dashboard/payout-account" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Landmark size={16} /> Manage your payout account
        </Link>
      </div>
    )
  }

  // Submitted: show everything EboHomes is reviewing, plus the payout account step.
  if (underReview) {
    const company = formData.account_type === 'company'
    const payoutValue =
      payout === 'active'
        ? 'Approved and active'
        : payout === 'pending'
          ? 'Sent. Waiting for EboHomes review'
          : payout === 'loading'
            ? 'Checking...'
            : payout === 'unknown'
              ? 'Could not check. Open the payout page'
              : 'Not added yet'
    const payoutDone = payout === 'active' || payout === 'pending'

    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="bg-card border border-amber-200 rounded-2xl p-6 text-center">
          <Clock size={36} className="mx-auto text-amber-600 mb-3" />
          <h1 className="text-xl font-bold text-foreground mb-1">Verification under review</h1>
          <p className="text-sm text-muted-foreground">
            We&apos;ve received your details. EboHomes will review them and notify you of the result.
          </p>
        </div>

        <section className="bg-card border border-border rounded-2xl p-4" aria-label="Details submitted for verification">
          <h2 className="font-bold text-foreground mb-1">What you submitted</h2>
          <ul className="divide-y divide-border">
            <ChecklistRow done label="Registered as" value={company ? 'A company' : 'An individual'} />
            <ChecklistRow done label="Business name" value={formData.business_name} />
            <ChecklistRow done label="Business address" value={formData.business_address} />
            <ChecklistRow
              done={Boolean(formData.cac_number.trim())}
              label="CAC number"
              value={formData.cac_number.trim() || (company ? 'Missing' : 'Not provided (optional)')}
            />
            {company && (
              <ChecklistRow
                done
                label="Authorised representative"
                value={`${formData.representative_name} (${formData.representative_role})`}
              />
            )}
            <ChecklistRow
              done
              label="Government ID"
              value={`${ID_LABELS[formData.id_document_type] || 'ID'} uploaded`}
            />
            <ChecklistRow done label="Selfie holding your ID" value="Uploaded" />
            <ChecklistRow done label="Property ownership / authority document" value="Uploaded" />
          </ul>
        </section>

        <section className="bg-card border border-border rounded-2xl p-4" aria-label="Payout account">
          <h2 className="font-bold text-foreground mb-1">Payout account</h2>
          <ul>
            <ChecklistRow done={payoutDone} label="Bank account for your rent" value={payoutValue} />
          </ul>
          <p className="text-xs text-muted-foreground mb-3">
            EboHomes checks that the account name matches your verified identity, so add it now to avoid delays when your first rent is ready.
          </p>
          {payout !== 'active' && (
            <Link
              href="/dashboard/payout-account"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <Landmark size={16} /> {payout === 'pending' ? 'View payout request' : 'Add payout account'}
            </Link>
          )}
        </section>
      </div>
    )
  }

  // Never submitted (or rejected): show the full form.
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">Get Verified</h1>
        <p className="text-sm text-muted-foreground">
          Verified landlords get a trust badge. Provide accurate details — this is reviewed by our team.
        </p>
      </div>

      {status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">
            <p className="font-semibold mb-1">Your previous submission was not approved.</p>
            {rejectionReason ? (
              <p><span className="font-semibold">Reason:</span> {rejectionReason}</p>
            ) : (
              <p>Please review your details and resubmit.</p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Registering as *</label>
          <select
            value={formData.account_type}
            onChange={(e) => setFormData((p) => ({ ...p, account_type: e.target.value }))}
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="individual">An individual</option>
            <option value="company">A company</option>
          </select>
        </div>

        {formData.account_type === 'company' && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">
              A CAC number shows the company exists. It does not prove the company owns this property, so upload the property document below as well.
            </p>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Authorised representative&apos;s full name *</label>
              <input
                value={formData.representative_name}
                onChange={(e) => setFormData((p) => ({ ...p, representative_name: e.target.value }))}
                className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Their role in the company *</label>
              <input
                value={formData.representative_role}
                onChange={(e) => setFormData((p) => ({ ...p, representative_role: e.target.value }))}
                placeholder="e.g. Director"
                className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Business Name *</label>
          <input
            required
            value={formData.business_name}
            onChange={(e) => setFormData((p) => ({ ...p, business_name: e.target.value }))}
            placeholder="e.g. Onyeka Properties Ltd"
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Business Address *</label>
          <input
            required
            value={formData.business_address}
            onChange={(e) => setFormData((p) => ({ ...p, business_address: e.target.value }))}
            placeholder="e.g. 12 Ogoja Road, Abakaliki"
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            CAC Number {formData.account_type === 'company' ? '*' : '(optional)'}
          </label>
          <input
            value={formData.cac_number}
            onChange={(e) => setFormData((p) => ({ ...p, cac_number: e.target.value }))}
            placeholder="e.g. RC1234567"
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="border-t border-border pt-4">
          <label className="block text-sm font-semibold text-foreground mb-2">Government ID *</label>
          <p className="text-xs text-muted-foreground mb-3">
            Upload a clear photo of your NIN slip, driver&apos;s licence, voter&apos;s card or international passport.
          </p>
          <select
            value={formData.id_document_type}
            onChange={(e) => setFormData((p) => ({ ...p, id_document_type: e.target.value }))}
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select ID type</option>
            <option value="nin">NIN slip / card</option>
            <option value="drivers_licence">Driver&apos;s licence</option>
            <option value="voters_card">Voter&apos;s card</option>
            <option value="intl_passport">International passport</option>
          </select>
          {formData.id_document_url ? (
            <div className="flex items-center justify-between border-2 border-border rounded-lg p-3 bg-secondary">
              <span className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                <Check size={14} className="text-primary" /> {idDocName || 'ID uploaded'}
              </span>
              <button
                type="button"
                onClick={() => { setFormData((p) => ({ ...p, id_document_url: '' })); setIdDocName('') }}
                className="text-destructive text-sm font-semibold px-2"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="block border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-secondary transition-colors text-sm">
              {idUploading === 'id' ? (
                <span className="text-primary">Uploading ID...</span>
              ) : (
                <span className="font-semibold text-foreground flex items-center justify-center gap-2">
                  <FileText size={16} /> Click to upload your ID
                </span>
              )}
              <input type="file" accept={OWNERSHIP_ACCEPT} onChange={(e) => handleIdUpload(e, 'id')} className="hidden" />
            </label>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <label className="block text-sm font-semibold text-foreground mb-2">Selfie holding your ID *</label>
          <p className="text-xs text-muted-foreground mb-3">
            Take a clear photo of your face, holding the same ID next to it.
          </p>
          {formData.selfie_url ? (
            <div className="flex items-center justify-between border-2 border-border rounded-lg p-3 bg-secondary">
              <span className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                <Check size={14} className="text-primary" /> {selfieName || 'Selfie uploaded'}
              </span>
              <button
                type="button"
                onClick={() => { setFormData((p) => ({ ...p, selfie_url: '' })); setSelfieName('') }}
                className="text-destructive text-sm font-semibold px-2"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="block border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-secondary transition-colors text-sm">
              {idUploading === 'selfie' ? (
                <span className="text-primary">Uploading selfie...</span>
              ) : (
                <span className="font-semibold text-foreground flex items-center justify-center gap-2">
                  <FileText size={16} /> Click to take or upload a selfie
                </span>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(e) => handleIdUpload(e, 'selfie')} className="hidden" />
            </label>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <label className="block text-sm font-semibold text-foreground mb-2">Property Ownership / Authority Document *</label>
          <p className="text-xs text-muted-foreground mb-3">
            Upload a title document, deed, C of O, survey, tenancy paper, or proof that you are authorised to rent this property.
          </p>
          {formData.ownership_doc_url ? (
            <div className="flex items-center justify-between border-2 border-border rounded-lg p-3 bg-secondary">
              <a href={docPreviewUrl || '#'} target="_blank" rel="noreferrer" className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                <Check size={14} className="text-primary" /> {docName || 'Document uploaded'}
              </a>
              <button type="button" onClick={removeDoc} className="text-destructive text-sm font-semibold px-2">
                Remove
              </button>
            </div>
          ) : (
            <label className="block border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-secondary transition-colors text-sm">
              {docUploading ? (
                <span className="text-primary">Uploading document...</span>
              ) : (
                <span className="font-semibold text-foreground flex items-center justify-center gap-2">
                  <FileText size={16} /> Click to upload document
                </span>
              )}
              <input type="file" accept={OWNERSHIP_ACCEPT} onChange={handleDocUpload} className="hidden" />
            </label>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary p-4 text-sm">
            <Landmark size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">Payout account comes next.</span>{' '}
              Submit the details above first. Your next screen shows everything you sent and a button to add your payout
              account, which EboHomes reviews with your identity. The account must be in your own name.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary p-4 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span className="text-muted-foreground">
            I confirm these details and documents are mine and true. I agree that EboHomes may review my ID, selfie and
            ownership document to verify my identity, as described in the{' '}
            <Link href="/privacy" target="_blank" className="font-semibold text-primary underline">Privacy Policy</Link>.
          </span>
        </label>

        {message && <p className="text-sm text-destructive">{message}</p>}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting...' : 'Submit for Verification'}
        </button>
      </form>
    </div>
  )
}
