'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, FileText, Loader2 } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

export default function ApplyPage() {
  const { id } = useParams()
  const router = useRouter()

  const [listing, setListing] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [alreadyApplied, setAlreadyApplied] = useState(false)
  const [error, setError] = useState('')

  const [message, setMessage] = useState('')
  const [moveInDate, setMoveInDate] = useState('')

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push(`/login?redirect=/apply/${id}`)
        return
      }

      const { data: listingData } = await supabase
        .from('listings')
        .select('id, title, location_text, price_monthly, landlord_id, status, photos')
        .eq('id', id)
        .single()

      if (!listingData || listingData.status !== 'approved') {
        setError('This listing is not available for applications right now.')
        setLoading(false)
        return
      }

      setListing(listingData)

      // Prevent duplicate applications from the same tenant for the same listing
      const { data: existing } = await supabase
        .from('applications')
        .select('id')
        .eq('listing_id', id)
        .eq('tenant_id', user.id)
        .maybeSingle()

      if (existing) {
        setAlreadyApplied(true)
      }

      setLoading(false)
    }

    if (id) load()
  }, [id, router])

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !listing) {
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
      setError('Something went wrong submitting your application. Please try again.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-20 w-full animate-pulse">
          <div className="h-6 bg-secondary rounded w-1/2 mb-4" />
          <div className="h-32 bg-secondary rounded" />
        </div>
        <Footer />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <p className="text-foreground font-medium mb-2">{error}</p>
          <button onClick={() => router.push('/search')} className="text-primary text-sm font-medium hover:underline">
            ← Back to search
          </button>
        </div>
        <Footer />
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <CheckCircle2 size={48} className="text-primary mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">Application submitted</h1>
          <p className="text-muted-foreground text-sm mb-6">
            The landlord has been notified. You can track the status of this application from your dashboard.
          </p>
          <Button onClick={() => router.push('/home')}>Go to dashboard</Button>
        </div>
        <Footer />
      </div>
    )
  }

  if (alreadyApplied) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <FileText size={40} className="text-muted-foreground mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-foreground mb-2">You've already applied to this property</h1>
          <p className="text-muted-foreground text-sm mb-6">Check your dashboard for the current status.</p>
          <Button onClick={() => router.push('/home')}>Go to dashboard</Button>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-10">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-primary font-medium hover:underline mb-6">
          <ArrowLeft size={14} /> Back
        </button>

        <div className="bg-card border border-border rounded-lg p-5 mb-6">
          <p className="text-sm text-muted-foreground mb-1">Applying for</p>
          <h1 className="text-lg font-bold text-foreground">{listing.title}</h1>
          <p className="text-sm text-muted-foreground">{listing.location_text}</p>
          <p className="text-primary font-semibold mt-2">₦{listing.price_monthly?.toLocaleString()}/month</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Preferred move-in date (optional)</label>
            <input
              type="date"
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Message to landlord (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Introduce yourself — who you are, when you'd like to move in, any questions."
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground resize-none"
            />
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className="w-full font-semibold">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Submitting...
              </span>
            ) : (
              'Submit Application'
            )}
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  )
}