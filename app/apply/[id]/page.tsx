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

  if (alreadyApplied) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-primary" />
          <p className="text-lg font-semibold text-foreground mb-2">You've already applied</p>
          <p className="text-muted-foreground mb-6">You have already submitted an application for this property. Check your messages for updates.</p>
          <button onClick={() => router.push('/messages')} className="text-primary text-sm font-medium hover:underline">
            Go to messages
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
          <CheckCircle2 size={48} className="mx-auto mb-4 text-primary" />
          <p className="text-lg font-semibold text-foreground mb-2">Application submitted!</p>
          <p className="text-muted-foreground mb-6">The landlord has received your application. You'll be notified when they respond.</p>
          <button onClick={() => router.push('/messages')} className="text-primary text-sm font-medium hover:underline">
            Check messages
          </button>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

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
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Message to landlord (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell the landlord about yourself..."
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              rows={4}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

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

      <Footer />
    </div>
  )
}