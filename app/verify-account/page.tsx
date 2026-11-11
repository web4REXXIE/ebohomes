'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Clock, XCircle, Check, Circle, FileText, Loader2, Mail, Info } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import {
  OWNERSHIP_BUCKET,
  OWNERSHIP_ACCEPT,
  validateOwnershipFile,
  buildOwnershipPath,
  isValidOwnershipPath,
} from '@/lib/ownership-docs'
import { VerificationTracker, IdTypePicker, UploadTips } from '@/components/verification-ui'
import {
  tenantMissingItems,
  tenantVerificationState,
  safeNextPath,
  TENANT_ID_LABELS,
  type TenantVerificationState,
} from '@/lib/tenant-verification'

type Row = {
  role: string | null
  id_document_type: string | null
  id_document_url: string | null
  selfie_url: string | null
  verification_status: string | null
  verified: boolean | null
  rejection_reason: string | null
}

type UploadKind = 'id' | 'selfie'

function UploadField({
  id,
  title,
  hint,
  uploaded,
  fileName,
  uploading,
  uploadingText,
  idleText,
  accept,
  capture,
  error,
  onPick,
  onRemove,
}: {
  id: string
  title: string
  hint: string
  uploaded: boolean
  fileName: string
  uploading: boolean
  uploadingText: string
  idleText: string
  accept: string
  capture?: 'user'
  error?: string
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
}) {
  return (
    <div className="border-t border-border pt-4">
      <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
      <p id={`${id}-hint`} className="mb-3 text-sm text-muted-foreground">{hint}</p>
      {uploaded ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-success-soft p-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
            <Check size={16} className="shrink-0 text-success" aria-hidden />
            <span className="truncate">{fileName || 'Uploaded'}</span>
          </span>
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

export default function VerifyAccountPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState<Row | null>(null)
  const [nextPath, setNextPath] = useState<string | null>(null)

  const [idType, setIdType] = useState('')
  const [idPath, setIdPath] = useState('')
  const [selfiePath, setSelfiePath] = useState('')
  const [idName, setIdName] = useState('')
  const [selfieName, setSelfieName] = useState('')
  const [uploading, setUploading] = useState<UploadKind | ''>('')
  const [errors, setErrors] = useState<Partial<Record<UploadKind, string>>>({})
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setNextPath(safeNextPath(new URLSearchParams(window.location.search).get('next')))
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth?.user) {
        router.replace('/login?redirect=/verify-account')
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('role, id_document_type, id_document_url, selfie_url, verification_status, verified, rejection_reason')
        .eq('id', auth.user.id)
        .maybeSingle()
      if (data?.role === 'landlord') {
        router.replace('/dashboard/verify')
        return
      }
      setRow((data as Row) ?? null)
      setLoading(false)
    })()
  }, [router])

  const state: TenantVerificationState = tenantVerificationState(row)
  const missing = tenantMissingItems({ id_document_type: idType, id_document_url: idPath, selfie_url: selfiePath })
  const canSubmit = missing.length === 0 && consent && !uploading && !submitting

  const setErr = (k: UploadKind, text: string) => setErrors((p) => ({ ...p, [k]: text }))

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, kind: UploadKind) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    setErr(kind, '')
    const problem = validateOwnershipFile(file)
    if (problem) {
      setErr(kind, problem)
      input.value = ''
      return
    }
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) {
      router.replace('/login?redirect=/verify-account')
      return
    }
    setUploading(kind)
    const path = buildOwnershipPath(auth.user.id, kind === 'id' ? 'govid' : 'selfie', file)
    const { error } = await supabase.storage
      .from(OWNERSHIP_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    setUploading('')
    input.value = ''
    if (error) {
      setErr(kind, 'Upload failed. Check your network and try again.')
      return
    }
    if (kind === 'id') {
      setIdPath(path)
      setIdName(file.name)
    } else {
      setSelfiePath(path)
      setSelfieName(file.name)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setMessage('')

    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) {
      router.replace('/login?redirect=/verify-account')
      return
    }

    if (!isValidOwnershipPath(idPath, user.id) || !isValidOwnershipPath(selfiePath, user.id)) {
      setMessage('One of your uploaded files is invalid. Please remove it and upload it again.')
      setSubmitting(false)
      return
    }

    // One submission only: read the latest state first. If something is already on file, do not send again.
    const { data: latest } = await supabase
      .from('profiles')
      .select('role, id_document_type, id_document_url, selfie_url, verification_status, verified, rejection_reason')
      .eq('id', user.id)
      .maybeSingle()
    const latestState = tenantVerificationState(latest)
    if (latestState === 'submitted' || latestState === 'verified') {
      setRow(latest as Row)
      setSubmitting(false)
      window.scrollTo({ top: 0 })
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        id_document_type: idType,
        id_document_url: idPath,
        selfie_url: selfiePath,
        verification_status: 'pending',
      })
      .eq('id', user.id)

    setSubmitting(false)
    if (error) {
      setMessage('Could not send your details: ' + error.message)
      return
    }

    setRow({
      role: 'tenant',
      id_document_type: idType,
      id_document_url: idPath,
      selfie_url: selfiePath,
      verification_status: 'pending',
      verified: false,
      rejection_reason: null,
    })
    window.scrollTo({ top: 0 })
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
      <Footer />
    </div>
  )

  if (loading) {
    return (
      <Shell>
        <div aria-busy="true" aria-label="Loading verification">
          <div className="mb-4 h-8 w-48 animate-pulse rounded bg-secondary" />
          <div className="h-64 animate-pulse rounded-card border border-border bg-secondary" />
        </div>
      </Shell>
    )
  }

  // ---- Verified ----
  if (state === 'verified') {
    return (
      <Shell>
        <div className="rounded-card border border-success/30 bg-card p-6 text-center">
          <ShieldCheck size={40} className="mx-auto mb-3 text-success" aria-hidden />
          <h1 className="mb-1 text-xl font-bold text-foreground">Your account is verified</h1>
          <p className="mb-5 text-sm text-muted-foreground">
            EboHomes reviewed the ID and selfie you sent and approved your account. You can now apply for properties.
          </p>
          <Link
            href={nextPath ?? '/search'}
            className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {nextPath ? 'Continue' : 'Browse properties'}
          </Link>
        </div>
      </Shell>
    )
  }

  // ---- Submitted: one submission only, so there is no form here ----
  if (state === 'submitted') {
    return (
      <Shell>
        <div className="rounded-card border border-warning/30 bg-card p-6 text-center">
          <Clock size={36} className="mx-auto mb-3 text-warning" aria-hidden />
          <h1 className="mb-1 text-xl font-bold text-foreground">We have your details</h1>
          <p className="text-sm text-muted-foreground">
            You have submitted your ID and selfie. EboHomes has not recorded a decision yet. You will be notified when there is one.
          </p>
        </div>

        <section className="rounded-card border border-border bg-card p-4 shadow-rest" aria-label="Verification progress">
          <VerificationTracker current="waiting" />
        </section>

        <section className="rounded-card border border-border bg-card p-4 shadow-rest" aria-label="What you submitted">
          <h2 className="mb-1 font-bold text-foreground">What you submitted</h2>
          <ul className="divide-y divide-border text-sm">
            <li className="flex items-center gap-3 py-3">
              <Check size={18} className="shrink-0 text-success" aria-hidden />
              <span className="text-foreground">ID type: {TENANT_ID_LABELS[row?.id_document_type ?? ''] ?? 'On file'}</span>
            </li>
            <li className="flex items-center gap-3 py-3">
              <Check size={18} className="shrink-0 text-success" aria-hidden />
              <span className="text-foreground">ID photo: received</span>
            </li>
            <li className="flex items-center gap-3 py-3">
              <Check size={18} className="shrink-0 text-success" aria-hidden />
              <span className="text-foreground">Selfie holding your ID: received</span>
            </li>
          </ul>
        </section>

        <section className="rounded-card border border-border bg-card p-4 shadow-rest" aria-label="What happens next">
          <h2 className="mb-3 font-bold text-foreground">What happens next?</h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <Mail size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              EboHomes will notify you when a decision is recorded.
            </li>
            <li className="flex items-start gap-3">
              <Info size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              If something is wrong, you will see the reason here and can send new photos.
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              Your ID and selfie are used only to verify your identity.
            </li>
          </ul>
        </section>

        <Link
          href="/search"
          className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground"
        >
          Browse properties while you wait
        </Link>
      </Shell>
    )
  }

  // ---- Not submitted, or rejected: the form ----
  return (
    <Shell>
      <div>
        <h1 className="mb-1 text-2xl font-bold text-foreground">Verify your account</h1>
        <p className="text-sm text-muted-foreground">
          EboHomes checks every tenant before they apply. It takes a few minutes: your ID type, a photo of the ID and a selfie holding it.
        </p>
      </div>

      <section className="rounded-card border border-border bg-card p-4 shadow-rest" aria-label="Verification progress">
        <VerificationTracker current="submit" />
      </section>

      {state === 'rejected' && (
        <div role="alert" className="flex items-start gap-3 rounded-card border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <XCircle size={20} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-semibold text-foreground">Your last submission was not approved</p>
            <p className="text-muted-foreground">
              {row?.rejection_reason ? `Reason: ${row.rejection_reason}. ` : ''}Send a new ID type, ID photo and selfie below.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-card border border-border bg-card p-4 shadow-rest sm:p-6" noValidate>
        <IdTypePicker value={idType} onChange={setIdType} />

        <UploadTips />

        <UploadField
          id="t-id-photo"
          title="Government ID photo *"
          hint="All four corners and the text must be readable."
          uploaded={!!idPath}
          fileName={idName}
          uploading={uploading === 'id'}
          uploadingText="Uploading ID..."
          idleText="Take a photo or choose from gallery"
          accept={OWNERSHIP_ACCEPT}
          error={errors.id}
          onPick={(e) => handleUpload(e, 'id')}
          onRemove={() => {
            setIdPath('')
            setIdName('')
          }}
        />

        <UploadField
          id="t-selfie"
          title="Selfie holding your ID *"
          hint="A clear photo of your face, holding the same ID next to it."
          uploaded={!!selfiePath}
          fileName={selfieName}
          uploading={uploading === 'selfie'}
          uploadingText="Uploading selfie..."
          idleText="Take a selfie holding your ID"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          error={errors.selfie}
          onPick={(e) => handleUpload(e, 'selfie')}
          onRemove={() => {
            setSelfiePath('')
            setSelfieName('')
          }}
        />

        <div className="border-t border-border pt-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
            />
            <span>I confirm these documents are mine and are genuine. I understand I can only send them once.</span>
          </label>
        </div>

        {message && <p role="alert" className="text-sm font-medium text-destructive">{message}</p>}

        {!canSubmit && !submitting && (
          <p className="text-xs text-muted-foreground">
            {missing.length > 0 ? `To submit, add: ${missing.join(', ')}.` : 'Tick the confirmation to submit.'}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden /> Submitting...
            </>
          ) : (
            'Submit for Verification'
          )}
        </button>
      </form>
    </Shell>
  )
  }
