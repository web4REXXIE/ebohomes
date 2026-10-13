'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, FileText, Loader2 } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

const OPEN_STATUSES = ['pending', 'info_requested', 'approved']

export default function ApplyPage() {
  const { id } = useParams()
  const router = useRouter()

  const [listing, setListing] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [existingStatus, setExistingStatus] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')

  const [message, setMessage] = useState('')
  const [moveInDate, setMoveInDate] = useState('')

  const findOpenApplication = async (userId: string) => {
    const { data: open } = await supabase
      .from('applications')
      .select('id, status')
      .eq('listing_id', id)
      .eq('tenant_id', userId)
      .in('status', OPEN_STATUSES)
      .limit(1)
    return open && open.length > 0 ? (open[0].status as string) : null
  }

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/login?redirect=/apply/${id}`)
        return
      }

      const { data: listingData, error: listingError } = await supabase
        .from('listings')
        .select('id, title, location_text, price_monthly, landlord_id, status, photos')
        .eq('id', id)
        .maybeSingle()

      if (listingError) {
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

      // Only an open application blocks a new one. Rejected or withdrawn ones do not.
      const status = await findOpenApplication(user.id)
      if (status) setExistingStatus(status)

      setLoading(false)
    }

    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router])

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setSubmitError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setSubmitting(false)
      router.push(`/login?redirect=/apply/${id}`)
      return
    }
    if (!listing) {
      setSubmitting(false)
      return
    }

    const { error: insertError } = await supabase.from('applications').insert({
      tenant_id: user.id,
      listing_id: listing.id,
      landlord_id: listing.landlord_id,
      status: 'pending',
      message: message.trim() || null,
      application_data: moveInDate ? { move_in_date: moveInDate } : null,
    })

    if (insertError) {
      if (insertError.code === '23505') {
        // Duplicate open application: show the real current status.
        const status = await findOpenApplication(user.id)
        if (status) {
          setExistingStatus(status)
        } else {
          setSubmitError('You already have an open application for this property.')
        }
      } else if (/not active/i.test(insertError.message)) {
        setSubmitError(
          'Your account is not active, so you cannot apply right now. Please contact EboHomes support.'
        )
      } else if (insertError.code === '42501' || /row-level security/i.test(insertError.message)) {
        setSubmitError('You are not able to apply to this property. It may no longer be open for applications.')
      } else {
        setSubmitError('Something went wrong submitting your application. Please try again.')
      }
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      {children}
      <Footer />
    </div>
  )

  if (loading) {
    return shell(
      <div className="max-w-xl mx-auto px-4 py-20 w-full animate-pulse">
        <div className="h-6 bg-secondary rounded w-1/2 mb-4" />
        <div className="h-32 bg-secondary rounded" />
      </div>
    )
  }

  if (loadError) {
    return shell(
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <p className="text-foreground font-medium mb-2">{loadError}</p>
        <button onClick={() => router.push('/search')} className="text-primary text-sm font-medium hover:underline">
          ← Back to search
        </button>
      </div>
    )
  }

  if (existingStatus) {
    const text =
      existingStatus === 'approved'
        ? 'The landlord has accepted your application for this property. Open your applications to see the next step.'
        : existingStatus === 'info_requested'
        ? 'The landlord has asked you a question about your application. Open your applications to answer it.'
        : 'Your application for this property is waiting for the landlord to review it.'
    return shell(
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <CheckCircle2 size={48} className="mx-auto mb-4 text-primary" />
        <p className="text-lg font-semibold text-foreground mb-2">You've already applied</p>
        <p className="text-muted-foreground mb-6">{text}</p>
        <button onClick={() => router.push('/applications')} className="text-primary text-sm font-medium hover:underline">
          Go to my applications
        </button>
      </div>
    )
  }

  if (submitted) {
    return shell(
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <CheckCircle2 size={48} className="mx-auto mb-4 text-primary" />
        <p className="text-lg font-semibold text-foreground mb-2">Application submitted</p>
        <p className="text-muted-foreground mb-6">
          Your application has been sent for the landlord to review. Submitting it does not reserve the property or involve any payment. You'll be notified when the landlord responds.
        </p>
        <button onClick={() => router.push('/applications')} className="text-primary text-sm font-medium hover:underline">
          Track my application
        </button>
      </div>
    )
  }

  const today = new Date().toISOString().split('T')[0]

  return shell(
    <main className="flex-1 max-w-xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-primary text-sm font-medium hover:underline mb-6">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Apply for {listing?.title}</h1>
        <p className="text-muted-foreground text-sm">{listing?.location_text}</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Move-in date</label>
          <input
            type="date"
            min={today}
            value={moveInDate}
            onChange={(e) => setMoveInDate(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Note with your application (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell the landlord about yourself..."
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
            rows={4}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          This is a rental application, not a payment and not a viewing request. You will arrange viewing and next steps through EboHomes after the landlord responds.
        </p>

        {submitError && <p className="text-sm text-destructive">{submitError}</p>}

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="animate-spin mr-2" /> : <FileText size={16} className="mr-2" />}
          {submitting ? 'Submitting...' : 'Submit Application'}
        </Button>
      </div>
    </main>
  )
}