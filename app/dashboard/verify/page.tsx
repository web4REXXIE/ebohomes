'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Clock, XCircle, FileText, Check, Landmark, Circle, HelpCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  OWNERSHIP_BUCKET,
  OWNERSHIP_ACCEPT,
  validateOwnershipFile,
  buildOwnershipPath,
  isValidOwnershipPath,
  getOwnershipSignedUrl,
} from '@/lib/ownership-docs'
import { isSubmissionComplete, landlordVerificationDisplay, missingItems } from '@/lib/landlord-verification'
import { ToneChip } from '@/components/dashboard-ui'

// Stage 16 Part 2: presentation changes only.
// Upload, submit, cleanup and storage logic are the same as before.
// What the landlord is TOLD about their status now comes from landlordVerificationDisplay(),
// which never treats the `verified` flag on its own as proof of anything.

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
type UploadKey = 'id' | 'selfie' | 'doc'

const ID_LABELS: Record<string, string> = {
  nin: 'NIN slip / card',
  drivers_licence: "Driver's licence",
  voters_card: "Voter's card",
  intl_passport: 'International passport',
}

const INPUT =
  'min-h-11 w-full rounded-lg border border-border bg-input px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'

// One shared definition of "submitted" (verification_status defaults to 'pending' in the database).
const hasAllDetails = (d: FormData) => isSubmissionComplete(d)

function ChecklistRow({ done, label, value }: { done: boolean; label: string; value: string }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {done ? (
        <Check size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
      ) : (
        <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium text-foreground">
          {value}
          <span className="sr-only">{done ? ' (done)' : ' (not done)'}</span>
        </p>
      </div>
    </li>
  )
}

// A file upload box that keyboard users can reach: the real input is visually hidden, not display:none,
// and the label shows a focus ring when the input has focus.
function UploadField({
  id,
  title,
  hint,
  uploaded,
  fileName,
  fallbackName,
  uploading,
  uploadingText,
  idleText,
  accept,
  capture,
  error,
  href,
  onPick,
  onRemove,
}: {
  id: string
  title: string
  hint: string
  uploaded: boolean
  fileName: string
  fallbackName: string
  uploading: boolean
  uploadingText: string
  idleText: string
  accept: string
  capture?: 'user'
  error?: string
  href?: string
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
}) {
  return (
    <div className="border-t border-border pt-4">
      <p id={`${id}-title`} className="mb-1 text-sm font-semibold text-foreground">{title}</p>
      <p id={`${id}-hint`} className="mb-3 text-sm text-muted-foreground">{hint}</p>
      {uploaded ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-success-soft p-3">
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" className="focus-ring flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
              <Check size={16} className="shrink-0 text-success" aria-hidden />
              <span className="truncate">{fileName || fallbackName}</span>
            </a>
          ) : (
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
              <Check size={16} className="shrink-0 text-success" aria-hidden />
              <span className="truncate">{fileName || fallbackName}</span>
            </span>
          )}
          <button type="button" onClick={onRemove} className="focus-ring min-h-11 shrink-0 px-3 text-sm font-semibold text-destructive">
            Remove<span className="sr-only"> {title}</span>
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex min-h-14 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border p-4 text-center text-sm transition-colors hover:bg-secondary focus-within:ring-2 focus-within:ring-primary"
        >
          {uploading ? (
            <span className="flex items-center gap-2 font-medium text-primary" role="status">
              <Loader2 size={16} className="animate-spin" aria-hidden /> {uploadingText}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2 font-semibold text-foreground">
              <FileText size={16} aria-hidden /> {idleText}
            </span>
          )}
          <input
            id={id}
            type="file"
            accept={accept}
            capture={capture}
            onChange={onPick}
            disabled={uploading}
            aria-describedby={`${id}-hint`}
            className="sr-only"
          />
        </label>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-destructive">{error}</p>}
    </div>
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
  // The two raw database fields. They are never shown directly: landlordVerificationDisplay() decides the wording.
  const [dbStatus, setDbStatus] = useState<string | null>(null)
  const [dbVerified, setDbVerified] = useState<boolean | null>(null)
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
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<UploadKey, string>>>({})

  const setUploadError = (key: UploadKey, text: string) => setUploadErrors((p) => ({ ...p, [key]: text }))

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
        setDbStatus(data.verification_status ?? null)
        setDbVerified(typeof data.verified === 'boolean' ? data.verified : null)
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

  // What we may tell the landlord. This is the only place the wording for a status is decided.
  const display = landlordVerificationDisplay({ ...formData, verification_status: dbStatus, verified: dbVerified })
  const submitted = display.state === 'submitted'

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

  useEffect(() => {
    if (submitted) loadPayout()
  }, [submitted, loadPayout])

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    setUploadError('doc', '')

    const err = validateOwnershipFile(file)
    if (err) {
      setUploadError('doc', err)
      input.value = ''
      return
    }

    setDocUploading(true)
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) {
      setMessage('You must be logged in.')
      setDocUploading(false)
      router.replace('/login')
      return
    }

    const filePath = buildOwnershipPath(user.id, 'verification', file)
    const { error: uploadError } = await supabase.storage
      .from(OWNERSHIP_BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      setUploadError('doc', 'Failed to upload document: ' + uploadError.message)
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
    setUploadError(kind, '')
    const validationError = validateOwnershipFile(file)
    if (validationError) {
      setUploadError(kind, validationError)
      input.value = ''
      return
    }
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) {
      setMessage('You must be logged in.')
      return
    }
    setIdUploading(kind)
    const filePath = buildOwnershipPath(user.id, kind === 'id' ? 'govid' : 'selfie', file)
    const { error: uploadError } = await supabase.storage
      .from(OWNERSHIP_BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      setUploadError(kind, 'Upload failed: ' + uploadError.message)
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
      (formData.ownership_doc_url !== '' && !isValidOwnershipPath(formData.ownership_doc_url, user.id)) ||
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
        ownership_doc_url: formData.ownership_doc_url || null, // storage path, optional
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
    setDbStatus('pending')
    setDbVerified(false)
    cleanupOldFiles()
    window.scrollTo({ top: 0 })
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8" aria-busy="true" aria-label="Loading verification">
        <div className="mb-4 h-8 w-48 animate-pulse rounded bg-secondary" />
        <div className="h-64 animate-pulse rounded-card border border-border bg-secondary" />
      </div>
    )
  }

  // Shown on every state: what the landlord's own records say, in words we can stand behind.
  const company = formData.account_type === 'company'

  // ---- Verified: both database fields agree on an explicit administrator outcome. ----
  if (display.state === 'verified') {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <div className="rounded-card border border-success/30 bg-card p-6 text-center">
          <ShieldCheck size={40} className="mx-auto mb-3 text-success" aria-hidden />
          <ToneChip tone="green">Verified</ToneChip>
          <h1 className="mb-1 mt-3 text-xl font-bold text-foreground">Your landlord account is verified</h1>
          <p className="text-sm text-muted-foreground">
            {display.detail}
            {verifiedAt ? ` Decision recorded on ${new Date(verifiedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''}
          </p>
        </div>

        <section className="rounded-card border border-border bg-card p-4 shadow-rest" aria-label="Details on file">
          <h2 className="mb-1 font-bold text-foreground">Details on file</h2>
          <ul className="divide-y divide-border">
            <ChecklistRow done label="Business" value={`${formData.business_name || '—'}${company ? ' (company)' : ''}`} />
            <ChecklistRow done={!!formData.id_document_url} label="Government ID" value={formData.id_document_url ? 'On file' : 'Not on file'} />
            <ChecklistRow done={!!formData.selfie_url} label="Selfie holding your ID" value={formData.selfie_url ? 'On file' : 'Not on file'} />
            <ChecklistRow done={!!formData.ownership_doc_url} label="Ownership document (optional)" value={formData.ownership_doc_url ? 'On file' : 'Not provided'} />
          </ul>
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">
            Verification is about your landlord account. It does not by itself prove you own a particular property. EboHomes checks each property separately.
          </p>
        </section>

        <section className="rounded-card border border-warning/25 bg-warning-soft p-4 text-sm text-foreground" aria-label="If your details change">
          <p className="mb-1 font-semibold">If your details change</p>
          <p>
            Changing your name, business name, business address, CAC number, ID, selfie, documents or payout account sends your
            account back to review until EboHomes checks it again. Update them on your{' '}
            <Link href="/dashboard/profile" className="focus-ring font-semibold underline">profile</Link>.
          </p>
        </section>

        <Link href="/dashboard/payout-account" className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Landmark size={16} aria-hidden /> Manage your payout account
        </Link>
      </div>
    )
  }

  // ---- Neutral: the records do not give a clear result. We say so and do not guess. ----
  if (display.state === 'unknown') {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <HelpCircle size={36} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <ToneChip tone="grey">{display.label}</ToneChip>
          <h1 className="mb-1 mt-3 text-xl font-bold text-foreground">We cannot show a clear result</h1>
          <p className="text-sm text-muted-foreground">{display.detail}</p>
        </div>
        <section className="rounded-card border border-border bg-card p-4 shadow-rest" aria-label="Details on file">
          <h2 className="mb-1 font-bold text-foreground">Details on file</h2>
          <ul className="divide-y divide-border">
            <ChecklistRow done={!!formData.business_name} label="Business name" value={formData.business_name || 'Not provided'} />
            <ChecklistRow done={!!formData.id_document_url} label="Government ID" value={formData.id_document_url ? 'On file' : 'Not on file'} />
            <ChecklistRow done={!!formData.selfie_url} label="Selfie holding your ID" value={formData.selfie_url ? 'On file' : 'Not on file'} />
          </ul>
        </section>
        <Link href="/contact" className="focus-ring inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Contact EboHomes
        </Link>
      </div>
    )
  }

  // ---- Submitted: everything is on file and EboHomes has not recorded a decision. ----
  if (submitted) {
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
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <div className="rounded-card border border-warning/30 bg-card p-6 text-center">
          <Clock size={36} className="mx-auto mb-3 text-warning" aria-hidden />
          <ToneChip tone="amber">{display.label}</ToneChip>
          <h1 className="mb-1 mt-3 text-xl font-bold text-foreground">We have your details</h1>
          <p className="text-sm text-muted-foreground">{display.detail}</p>
        </div>

        <section className="rounded-card border border-border bg-card p-4 shadow-rest" aria-label="Details submitted for verification">
          <h2 className="mb-1 font-bold text-foreground">What you submitted</h2>
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
            <ChecklistRow done label="Government ID" value={`${ID_LABELS[formData.id_document_type] || 'ID'} uploaded`} />
            <ChecklistRow done label="Selfie holding your ID" value="Uploaded" />
            <ChecklistRow done={!!formData.ownership_doc_url} label="Ownership document (optional)" value={formData.ownership_doc_url ? 'Uploaded' : 'Not provided'} />
          </ul>
        </section>

        <section className="rounded-card border border-border bg-card p-4 shadow-rest" aria-label="Payout account">
          <h2 className="mb-1 font-bold text-foreground">Payout account</h2>
          <ul>
            <ChecklistRow done={payoutDone} label="Bank account for your rent" value={payoutValue} />
          </ul>
          <p className="mb-3 text-xs text-muted-foreground">
            EboHomes checks that the account name matches your identity, so add it now to avoid delays when your first rent is ready.
          </p>
          {payout !== 'active' && (
            <Link
              href="/dashboard/payout-account"
              className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <Landmark size={16} aria-hidden /> {payout === 'pending' ? 'View payout request' : 'Add payout account'}
            </Link>
          )}
        </section>
      </div>
    )
  }

  // ---- Not submitted, or rejected: show the form. ----
  const missing = missingItems(formData)
  const total = company ? 8 : 5
  const done = Math.max(0, total - missing.length)
  const percent = Math.round((done / total) * 100)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-5">
        <h1 className="mb-1 text-2xl font-bold text-foreground">Get Verified</h1>
        <p className="text-sm text-muted-foreground">
          Verified landlords get a trust badge. Give accurate details. Our team reviews them.
        </p>
      </div>

      {display.state === 'rejected' && (
        <div className="mb-5 flex items-start gap-3 rounded-card border border-danger/30 bg-danger-soft p-4">
          <XCircle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          <div className="text-sm text-foreground">
            <p className="mb-1 font-semibold">{display.label}</p>
            {rejectionReason ? (
              <p><span className="font-semibold">Reason:</span> {rejectionReason}</p>
            ) : (
              <p>{display.detail}</p>
            )}
          </div>
        </div>
      )}

      {/* Progress comes straight from the fields below. Nothing here is a new requirement. */}
      <section className="mb-5 rounded-card border border-border bg-card p-4 shadow-rest" aria-label="Your progress">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-foreground">Your progress</h2>
          <span className="text-sm font-semibold text-foreground">{done} of {total} required</span>
        </div>
        <div
          role="progressbar"
          aria-label="Required details completed"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="h-2 overflow-hidden rounded-full bg-secondary"
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {missing.length === 0 ? 'Everything required is filled in. Tick the confirmation and submit.' : `Still needed: ${missing.join(', ')}.`}
        </p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-card border border-border bg-card p-5 shadow-rest sm:p-6">
        <div>
          <label htmlFor="v-account-type" className="mb-2 block text-sm font-semibold text-foreground">Registering as *</label>
          <select
            id="v-account-type"
            value={formData.account_type}
            onChange={(e) => setFormData((p) => ({ ...p, account_type: e.target.value }))}
            className={INPUT}
          >
            <option value="individual">An individual</option>
            <option value="company">A company</option>
          </select>
        </div>

        {company && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">
              A CAC number shows the company exists. It does not prove the company owns this property, so upload the property document below as well.
            </p>
            <div>
              <label htmlFor="v-rep-name" className="mb-2 block text-sm font-semibold text-foreground">Authorised representative&apos;s full name *</label>
              <input
                id="v-rep-name"
                value={formData.representative_name}
                onChange={(e) => setFormData((p) => ({ ...p, representative_name: e.target.value }))}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="v-rep-role" className="mb-2 block text-sm font-semibold text-foreground">Their role in the company *</label>
              <input
                id="v-rep-role"
                value={formData.representative_role}
                onChange={(e) => setFormData((p) => ({ ...p, representative_role: e.target.value }))}
                placeholder="e.g. Director"
                className={INPUT}
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="v-business-name" className="mb-2 block text-sm font-semibold text-foreground">Business Name *</label>
          <input
            id="v-business-name"
            required
            value={formData.business_name}
            onChange={(e) => setFormData((p) => ({ ...p, business_name: e.target.value }))}
            placeholder="e.g. Onyeka Properties Ltd"
            className={INPUT}
          />
        </div>

        <div>
          <label htmlFor="v-business-address" className="mb-2 block text-sm font-semibold text-foreground">Business Address *</label>
          <input
            id="v-business-address"
            required
            value={formData.business_address}
            onChange={(e) => setFormData((p) => ({ ...p, business_address: e.target.value }))}
            placeholder="e.g. 12 Ogoja Road, Abakaliki"
            className={INPUT}
          />
        </div>

        <div>
          <label htmlFor="v-cac" className="mb-2 block text-sm font-semibold text-foreground">
            CAC Number {company ? '*' : '(optional)'}
          </label>
          <input
            id="v-cac"
            value={formData.cac_number}
            onChange={(e) => setFormData((p) => ({ ...p, cac_number: e.target.value }))}
            placeholder="e.g. RC1234567"
            className={INPUT}
          />
        </div>

        <div className="border-t border-border pt-4">
          <label htmlFor="v-id-type" className="mb-1 block text-sm font-semibold text-foreground">Government ID type *</label>
          <p className="mb-3 text-sm text-muted-foreground">
            Choose the ID you will photograph: NIN slip, driver&apos;s licence, voter&apos;s card or international passport.
          </p>
          <select
            id="v-id-type"
            value={formData.id_document_type}
            onChange={(e) => setFormData((p) => ({ ...p, id_document_type: e.target.value }))}
            className={INPUT}
          >
            <option value="">Select ID type</option>
            <option value="nin">NIN slip / card</option>
            <option value="drivers_licence">Driver&apos;s licence</option>
            <option value="voters_card">Voter&apos;s card</option>
            <option value="intl_passport">International passport</option>
          </select>
        </div>

        <UploadField
          id="v-id-photo"
          title="Government ID photo *"
          hint="Upload a clear photo of the ID. All four corners and the text must be readable."
          uploaded={!!formData.id_document_url}
          fileName={idDocName}
          fallbackName="ID uploaded"
          uploading={idUploading === 'id'}
          uploadingText="Uploading ID..."
          idleText="Tap to upload your ID"
          accept={OWNERSHIP_ACCEPT}
          error={uploadErrors.id}
          onPick={(e) => handleIdUpload(e, 'id')}
          onRemove={() => { setFormData((p) => ({ ...p, id_document_url: '' })); setIdDocName('') }}
        />

        <UploadField
          id="v-selfie"
          title="Selfie holding your ID *"
          hint="Take a clear photo of your face, holding the same ID next to it."
          uploaded={!!formData.selfie_url}
          fileName={selfieName}
          fallbackName="Selfie uploaded"
          uploading={idUploading === 'selfie'}
          uploadingText="Uploading selfie..."
          idleText="Tap to take or upload a selfie"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          error={uploadErrors.selfie}
          onPick={(e) => handleIdUpload(e, 'selfie')}
          onRemove={() => { setFormData((p) => ({ ...p, selfie_url: '' })); setSelfieName('') }}
        />

        <UploadField
          id="v-ownership"
          title="Ownership document (optional)"
          hint="Only if you own property yourself. Agents and property managers can skip this. EboHomes checks each property separately when you list it."
          uploaded={!!formData.ownership_doc_url}
          fileName={docName}
          fallbackName="Document uploaded"
          uploading={docUploading}
          uploadingText="Uploading document..."
          idleText="Tap to upload a document"
          accept={OWNERSHIP_ACCEPT}
          error={uploadErrors.doc}
          href={docPreviewUrl || undefined}
          onPick={handleDocUpload}
          onRemove={removeDoc}
        />

        <div className="border-t border-border pt-4">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary p-4 text-sm">
            <Landmark size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">Payout account comes next.</span>{' '}
              Submit the details above first. Your next screen shows everything you sent and a button to add your payout
              account, which EboHomes reviews with your identity. The account must be in your own name.
            </p>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary p-4 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-primary"
          />
          <span className="text-muted-foreground">
            I confirm these details and documents are mine and true. I agree that EboHomes may review my ID, selfie and
            any document I upload to verify my identity, as described in the{' '}
            <Link href="/privacy" target="_blank" className="focus-ring font-semibold text-primary underline">Privacy Policy</Link>.
          </span>
        </label>

        {/* Stays on screen above the phone's bottom bar so the main action is never lost. */}
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-5 -mb-5 space-y-2 border-t border-border bg-card px-5 py-3 sm:-mx-6 sm:-mb-6 sm:px-6 md:bottom-0">
          {message && <p role="alert" className="text-sm font-medium text-destructive">{message}</p>}
          {!canSubmit && !submitting && (
            <p className="text-xs text-muted-foreground">
              {missing.length > 0 ? 'Complete the required details above to submit.' : 'Tick the confirmation above to submit.'}
            </p>
          )}
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="focus-ring min-h-12 w-full rounded-lg bg-primary py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit for Verification'}
          </button>
        </div>
      </form>
    </div>
  )
}
