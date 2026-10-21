'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, MapPin, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { naira } from '@/lib/case-status'
import {
  OCCUPATIONS,
  OPEN_STATUSES,
  MAX_MESSAGE,
  buildApplicationRow,
  classifySubmitError,
  formatMoveIn,
  hasErrors,
  normalisePhone,
  todayIso,
  validateApplication,
  type ApplicationForm,
  type FieldErrors,
} from '@/lib/application-form'
import { Stepper } from '@/components/application-ui'

type Step = 'form' | 'review' | 'done'

// The application form, moved inside the rental journey (Stage 1). Same fields, checks and database insert as the old Apply page.

const EMPTY: ApplicationForm = { fullName: '', phone: '', moveInDate: '', occupants: '', occupation: '', message: '' }

const inputCls =
  'w-full min-h-12 px-3 py-3 text-base border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary'

export function JourneyApply({ listingId }: { listingId: string }) {
  const id = listingId
  const router = useRouter()

  const [listing, setListing] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [form, setForm] = useState<ApplicationForm>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [step, setStep] = useState<Step>('form')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<{ message: string; supportCode: string } | null>(null)
  const [caseRef, setCaseRef] = useState<string | null>(null)
  const submittingRef = useRef(false) // blocks a second submit before React re-renders
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [photoFailed, setPhotoFailed] = useState(false)

  const set = (k: keyof ApplicationForm, v: string) => {
    setForm((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }

  const findOpenApplication = useCallback(
    async (userId: string) => {
      const { data: open } = await supabase
        .from('applications')
        .select('id, status')
        .eq('listing_id', id)
        .eq('tenant_id', userId)
        .in('status', [...OPEN_STATUSES])
        .limit(1)
      return open && open.length > 0 ? (open[0].id as string) : null
    },
    [id]
  )

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/login?redirect=/journey/apply/${id}`)
        return
      }

      const { data: listingData, error: listingError } = await supabase
        .from('listings')
        .select('id, title, location_text, price_monthly, landlord_id, status, photos, properties(public_id)')
        .eq('id', id)
        .maybeSingle()

      if (listingError) {
        console.error('[apply] listing load failed', listingError.code, listingError.message)
        setLoadError('We could not load this listing. Please try again.')
        setLoading(false)
        return
      }
      if (!listingData || listingData.status !== 'approved') {
        setLoadError('This listing is not available for applications right now.')
        setLoading(false)
        return
      }
      if (listingData.landlord_id === user.id) {
        setLoadError('You cannot apply to your own listing.')
        setLoading(false)
        return
      }
      setListing(listingData)

      // Prefill from the tenant's own profile. Failure here is harmless.
      const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle()
      if (profile) {
        setForm((p) => ({ ...p, fullName: profile.full_name ?? '', phone: profile.phone ?? '' }))
      }

      // Already applied: go straight to that application's journey.
      const openId = await findOpenApplication(user.id)
      if (openId) { router.replace(`/journey/${openId}`); return }
      setLoading(false)
    }
    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router])

  const goReview = () => {
    const e = validateApplication(form)
    setErrors(e)
    if (hasErrors(e)) {
      const first = Object.keys(e)[0]
      document.getElementById(`field-${first}`)?.focus()
      return
    }
    setSubmitError(null)
    setStep('review')
    window.scrollTo({ top: 0 })
    setTimeout(() => headingRef.current?.focus(), 0)
  }

  const handleSubmit = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push(`/login?redirect=/journey/apply/${id}`)
        return
      }
      if (!listing) return

      // Re-validate: the review screen must never submit stale or invalid data.
      const e = validateApplication(form)
      if (hasErrors(e)) {
        setErrors(e)
        setStep('form')
        setTimeout(() => document.getElementById(`field-${Object.keys(e)[0]}`)?.focus(), 0)
        return
      }

      // Duplicate guard (the database unique rule remains the real protection).
      const open = await findOpenApplication(user.id)
      if (open) {
        router.replace(`/journey/${open}`)
        return
      }

      const { error: insertError } = await supabase
        .from('applications')
        .insert(buildApplicationRow(form, { tenantId: user.id, listingId: listing.id, landlordId: listing.landlord_id }))

      if (insertError) {
        // Full detail goes to the console for staff diagnosis; tenants only see the safe message.
        console.error('[apply] insert failed', {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        })
        const c = classifySubmitError(insertError)
        if (c.kind === 'duplicate') {
          const dupId = await findOpenApplication(user.id)
          if (dupId) {
            router.replace(`/journey/${dupId}`)
            return
          }
        }
        setSubmitError({ message: c.message, supportCode: c.supportCode })
        return
      }

      // Best effort only: neither of these may turn a successful submission into an error.
      try {
        const phone = normalisePhone(form.phone)
        await supabase.from('profiles').update({ phone, full_name: form.fullName.trim().replace(/\s+/g, ' ') }).eq('id', user.id)
      } catch (err) {
        console.warn('[apply] profile update skipped', err)
      }
      let newId: string | null = null
      try {
        const { data: row } = await supabase
          .from('applications')
          .select('id, case_ref')
          .eq('listing_id', listing.id)
          .eq('tenant_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setCaseRef(row?.case_ref ?? null)
        newId = (row as any)?.id ?? null
      } catch {
        setCaseRef(null)
      }

      // Success. Show it briefly, then open the journey, where the saved status decides the next stage.
      setStep('done')
      window.scrollTo({ top: 0 })
      setTimeout(() => headingRef.current?.focus(), 0)
      setTimeout(() => router.replace(newId ? `/journey/${newId}?submitted=1` : '/journey'), 1400)
    } catch (err: any) {
      console.error('[apply] unexpected failure', err)
      const c = classifySubmitError({ message: err?.message })
      setSubmitError({ message: c.message, supportCode: c.supportCode })
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const shell = (children: React.ReactNode) => <>{children}</>

  const centered = (children: React.ReactNode) =>
    shell(<div className="flex items-center justify-center px-4 py-10"><div className="max-w-md w-full text-center">{children}</div></div>)

  if (loading) {
    return shell(
      <div className="w-full" aria-busy="true" aria-label="Loading application">
        <div className="animate-pulse grid lg:grid-cols-[1fr_22rem] gap-6">
          <div className="space-y-4 order-2 lg:order-1">
            <div className="h-8 bg-secondary rounded w-2/3" />
            <div className="h-72 bg-secondary rounded-xl" />
          </div>
          <div className="h-56 bg-secondary rounded-xl order-1 lg:order-2" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return centered(
      <>
        <AlertCircle size={40} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
        <p role="alert" className="text-foreground font-medium mb-4">{loadError}</p>
        <Button onClick={() => router.push('/search')} variant="outline" className="min-h-11">Back to search</Button>
      </>
    )
  }

  const propertyId = listing?.properties?.public_id ?? listing?.properties?.[0]?.public_id ?? null
  const photo = !photoFailed && Array.isArray(listing?.photos) ? listing.photos[0] : null

  const summary = (
    <aside aria-label="Property summary" className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm lg:sticky lg:top-24">
      <div className="flex lg:block">
        {photo ? (
          <img
            src={photo}
            alt={listing?.title ?? 'Property photo'}
            onError={() => setPhotoFailed(true)}
            className="w-28 sm:w-40 lg:w-full h-auto min-h-28 lg:h-44 object-cover shrink-0"
          />
        ) : (
          <div className="w-28 sm:w-40 lg:w-full lg:h-32 shrink-0 flex items-center justify-center bg-accent text-primary text-xs font-medium">No photo</div>
        )}
        <div className="p-3 sm:p-4 min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">You're applying for</p>
          <h2 className="text-base font-bold text-foreground leading-snug line-clamp-2">{listing?.title}</h2>
          <p className="text-sm text-muted-foreground flex items-start gap-1 mt-1">
            <MapPin size={14} className="shrink-0 mt-0.5" aria-hidden /> <span className="min-w-0">{listing?.location_text}</span>
          </p>
          <p className="mt-2 text-lg font-bold text-primary">
            {naira(listing?.price_monthly)}
            <span className="text-xs font-medium text-muted-foreground"> / month</span>
          </p>
          {propertyId && <p className="text-xs text-muted-foreground mt-1">Property ID: <span className="font-medium text-foreground">{propertyId}</span></p>}
        </div>
      </div>
      <div className="hidden lg:flex gap-2 border-t border-border bg-accent/50 p-4 text-xs text-accent-foreground">
        <ShieldCheck size={16} className="shrink-0 text-primary" aria-hidden />
        <p>EboHomes checks every application first, then coordinates with the landlord. Never pay anyone to apply.</p>
      </div>
    </aside>
  )

  if (step === 'done') {
    return shell(
      <div className="rounded-2xl border border-primary/30 bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary">
          <CheckCircle2 size={34} className="text-primary-foreground" aria-hidden />
        </div>
        <h2 ref={headingRef} tabIndex={-1} role="status" className="text-2xl font-bold text-foreground outline-none">Application submitted</h2>
        <p className="mt-1 text-sm text-muted-foreground">for {listing?.title}</p>
        {caseRef && <p className="mt-3 text-sm"><span className="text-muted-foreground">Reference </span><span className="font-bold text-foreground tracking-wide">{caseRef}</span></p>}
        <p className="mt-3 text-sm text-muted-foreground">Stage 1 is complete. Opening your journey…</p>
        <Loader2 size={20} className="mx-auto mt-3 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  const field = (key: keyof ApplicationForm, label: string, control: React.ReactNode, hint?: string) => (
    <div>
      <label htmlFor={`field-${key}`} className="block text-sm font-semibold text-foreground mb-1.5">{label}</label>
      {control}
      {hint && !errors[key] && <p id={`hint-${key}`} className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
      {errors[key] && <p id={`err-${key}`} role="alert" className="flex items-start gap-1 text-sm text-destructive mt-1.5"><AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden />{errors[key]}</p>}
    </div>
  )
  const aria = (k: keyof ApplicationForm, hasHint = false) => ({
    id: `field-${k}`,
    'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? `err-${k}` : hasHint ? `hint-${k}` : undefined,
  })
  const ctl = (k: keyof ApplicationForm) => `${inputCls} ${errors[k] ? 'border-destructive focus:ring-destructive/30 focus:border-destructive' : ''}`
  const sectionTitle = (t: string, d: string) => (
    <div className="mb-4"><h3 className="text-base font-semibold text-foreground">{t}</h3><p className="text-xs text-muted-foreground">{d}</p></div>
  )

  return shell(
    <div className="w-full pb-12">
      <button
        onClick={() => (step === 'review' ? setStep('form') : router.back())}
        disabled={submitting}
        className="inline-flex items-center gap-1 text-primary text-sm font-medium hover:underline mb-4 min-h-11 disabled:opacity-50"
      >
        <ArrowLeft size={16} aria-hidden /> {step === 'review' ? 'Edit my details' : 'Back'}
      </button>

      <div className="grid lg:grid-cols-[1fr_22rem] gap-5 lg:gap-8 items-start">
        <div className="order-2 lg:order-1 min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
            {step === 'form' ? 'Apply to rent' : 'Review your application'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            {step === 'form' ? 'It takes about two minutes. No documents or payment needed.' : 'Check everything below. You can still go back and edit.'}
          </p>
          <div className="mb-5"><Stepper steps={['Your details', 'Review', 'Submitted']} current={step === 'form' ? 0 : 1} /></div>

          {step === 'form' && (
            <form noValidate onSubmit={(e) => { e.preventDefault(); goReview() }} className="bg-card border border-border rounded-2xl shadow-sm divide-y divide-border">
              <section className="p-5 sm:p-6 space-y-5" aria-labelledby="sec-about">
                <div id="sec-about">{sectionTitle('About you', 'So EboHomes knows who is applying and how to reach you.')}</div>
                {field('fullName', 'Full name', <input {...aria('fullName')} type="text" autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={ctl('fullName')} />)}
                {field('phone', 'Phone number', <input {...aria('phone', true)} type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={ctl('phone')} />, 'EboHomes uses this to reach you. It is not shown to the landlord at this stage.')}
                {field('occupation', 'Occupation', <select {...aria('occupation', true)} value={form.occupation} onChange={(e) => set('occupation', e.target.value)} className={ctl('occupation')}><option value="">Select one</option>{OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>, "Employer details or documents are only requested later if they're needed.")}
              </section>
              <section className="p-5 sm:p-6 space-y-5" aria-labelledby="sec-move">
                <div id="sec-move">{sectionTitle('Your move', 'When you would like to move in and who will live there.')}</div>
                <div className="grid sm:grid-cols-2 gap-5">
                  {field('moveInDate', 'Preferred move-in date', <input {...aria('moveInDate')} type="date" min={todayIso()} value={form.moveInDate} onChange={(e) => set('moveInDate', e.target.value)} className={ctl('moveInDate')} />)}
                  {field('occupants', 'Number of occupants', <input {...aria('occupants', true)} type="number" inputMode="numeric" min={1} step={1} value={form.occupants} onChange={(e) => set('occupants', e.target.value)} className={ctl('occupants')} />, 'Including you.')}
                </div>
              </section>
              <section className="p-5 sm:p-6 space-y-5" aria-labelledby="sec-more">
                <div id="sec-more">{sectionTitle('Anything else?', 'Optional. Share anything that helps your application.')}</div>
                {field('message', 'Message (optional)', <textarea {...aria('message', true)} rows={4} maxLength={MAX_MESSAGE + 200} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="For example: your work situation, or questions about the property." className={ctl('message')} />, `${form.message.trim().length}/${MAX_MESSAGE}`)}
              </section>
              <div className="p-5 sm:p-6 space-y-4 bg-secondary/40 rounded-b-2xl">
                {hasErrors(errors) && <p role="alert" className="text-sm text-destructive">Please fix the {Object.keys(errors).length === 1 ? 'highlighted field' : `${Object.keys(errors).length} highlighted fields`} to continue.</p>}
                <p className="text-xs text-muted-foreground flex gap-2"><ShieldCheck size={16} className="shrink-0 text-primary" aria-hidden />A rental application only. It is not a payment, a viewing, or a reservation.</p>
                <Button type="submit" className="w-full min-h-12 text-base bg-primary hover:bg-primary/90"><ClipboardCheck size={18} className="mr-2" aria-hidden /> Review application</Button>
              </div>
            </form>
          )}

          {step === 'review' && (
            <div className="bg-card border border-border rounded-2xl shadow-sm">
              <div className="p-5 sm:p-6">
                <dl className="text-sm divide-y divide-border">
                  {[
                    ['Full name', form.fullName.trim().replace(/\s+/g, ' ')],
                    ['Phone', form.phone.trim()],
                    ['Occupation', form.occupation],
                    ['Preferred move-in', formatMoveIn(form.moveInDate)],
                    ['Occupants', form.occupants],
                    ['Message', form.message.trim() || 'None'],
                  ].map(([k, v]) => (
                    <div key={k} className="py-3 grid grid-cols-[8rem_1fr] sm:grid-cols-[10rem_1fr] gap-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-foreground font-medium break-words min-w-0 whitespace-pre-wrap">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="p-5 sm:p-6 space-y-4 border-t border-border bg-secondary/40 rounded-b-2xl">
                {submitError && (
                  <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden />
                    <div><p>{submitError.message}</p><p className="text-xs mt-1 opacity-80">Reference code: {submitError.supportCode}</p></div>
                  </div>
                )}
                <Button onClick={handleSubmit} disabled={submitting} aria-busy={submitting} className="w-full min-h-12 text-base bg-primary hover:bg-primary/90 disabled:opacity-60">
                  {submitting ? <Loader2 size={18} className="animate-spin mr-2" aria-hidden /> : <CheckCircle2 size={18} className="mr-2" aria-hidden />}
                  {submitting ? 'Submitting…' : submitError ? 'Try again' : 'Submit application'}
                </Button>
                <Button onClick={() => setStep('form')} disabled={submitting} variant="outline" className="w-full min-h-11">Edit my details</Button>
                <p className="text-xs text-muted-foreground text-center">EboHomes reviews your application first, then coordinates with the landlord.</p>
              </div>
            </div>
          )}
        </div>
        <div className="order-1 lg:order-2">{summary}</div>
      </div>
    </div>
  )
}