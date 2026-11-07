'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Clock, ShieldCheck, Home, ClipboardList, Plus, UserCheck, HomeIcon, Users } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

export default function VerificationPendingPage() {
  const [listing, setListing] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLatestListing = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (!userId) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('listings')
        .select('id, title, location_text, photos, status, created_at')
        .eq('landlord_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setListing(data)
      setLoading(false)
    }
    fetchLatestListing()
  }, [])

  const statusLabel =
    listing?.status === 'approved' ? 'Published' :
    listing?.status === 'rejected' ? 'Rejected' :
    'Pending Review'

  const currentStep = listing?.status === 'approved' ? 3 : 2

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* Success block */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-10">
          <div className="relative shrink-0">
            <div className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                <Check size={30} className="text-primary-foreground" strokeWidth={3} />
              </div>
            </div>
            <span className="absolute top-0 left-2 text-lg">🎉</span>
            <span className="absolute bottom-2 right-0 text-sm">✨</span>
          </div>

          <div className="text-center sm:text-left">
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground mb-1">
              Listing Submitted Successfully! 🎉
            </h1>
            <p className="text-primary font-semibold mb-3">Your property is under review</p>
            <p className="text-muted-foreground text-sm max-w-lg mb-4">
              We've received your property details and ownership documents. Our team is now verifying your
              submission to ensure every listing on EboHomes is genuine and safe for tenants.
            </p>
            <span className="inline-flex items-center gap-1.5 bg-secondary text-foreground text-xs font-medium px-3 py-1.5 rounded-full">
              <Clock size={13} className="text-primary" />
              Estimated review time: Within 2 business days
            </span>
          </div>
        </div>

        {/* Progress tracker */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            {[
              { label: 'Submitted', sub: 'Completed', done: true },
              { label: 'Under Review', sub: 'In Progress', done: currentStep >= 2, active: currentStep === 2 },
              { label: 'Published', sub: 'Pending', done: currentStep >= 3 },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      step.done ? 'bg-primary text-primary-foreground'
                      : step.active ? 'bg-amber-400 text-amber-950'
                      : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {step.done ? <Check size={16} /> : step.active ? <Clock size={16} /> : <span className="w-2 h-2 rounded-full bg-current" />}
                  </div>
                  <p className="font-semibold text-foreground text-sm mt-2">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.sub}</p>
                </div>
                {i < arr.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${step.done ? 'bg-primary' : 'bg-border'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Listing card */}
        {loading ? (
          <div className="bg-card border border-border rounded-xl p-4 mb-8 animate-pulse h-24" />
        ) : listing ? (
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 mb-8">
            <img
              src={listing.photos?.[0] ?? ''}
              alt={listing.title ?? 'Listing photo'}
              className="w-24 h-24 rounded-lg object-cover shrink-0 bg-secondary"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-foreground truncate">{listing.title ?? 'Untitled listing'}</p>
                  <p className="text-sm text-muted-foreground">{listing.location_text}</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
                  ● {statusLabel}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Submitted: {listing.created_at ? new Date(listing.created_at).toLocaleString() : '—'}
              </p>
            </div>
          </div>
        ) : null}

        {/* While you wait */}
        <h2 className="font-bold text-foreground mb-4">While you wait, you can</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Home size={18} className="text-primary" />
            </div>
            <p className="font-semibold text-foreground text-sm mb-1">Browse Properties</p>
            <p className="text-xs text-muted-foreground mb-4">Discover verified homes across Ebonyi.</p>
            <Link href="/search">
              <Button variant="outline" className="w-full justify-between font-semibold text-sm">
                Browse Listings →
              </Button>
            </Link>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <ClipboardList size={18} className="text-primary" />
            </div>
            <p className="font-semibold text-foreground text-sm mb-1">Go to My Listings</p>
            <p className="text-xs text-muted-foreground mb-4">Track the status of all your properties.</p>
            <Link href="/dashboard/listings">
              <Button variant="outline" className="w-full justify-between font-semibold text-sm">
                My Listings →
              </Button>
            </Link>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Plus size={18} className="text-primary" />
            </div>
            <p className="font-semibold text-foreground text-sm mb-1">Submit Another Property</p>
            <p className="text-xs text-muted-foreground mb-4">Own more than one property? Add another listing anytime.</p>
            <Link href="/list-property">
              <Button variant="outline" className="w-full justify-between font-semibold text-sm">
                Add Property →
              </Button>
            </Link>
          </div>
        </div>

        {/* Why we review */}
        <div className="bg-secondary/40 rounded-xl p-6 flex flex-col sm:flex-row items-center gap-5">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shrink-0">
            <ShieldCheck size={22} className="text-primary-foreground" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="font-bold text-foreground mb-1">Why do we review listings?</p>
            <p className="text-sm text-muted-foreground">
              To protect tenants from scams and ensure every property on EboHomes belongs to a verified owner. This helps build trust for everyone using the platform.
            </p>
          </div>
          <div className="flex gap-4 shrink-0 text-primary">
            <UserCheck size={22} />
            <HomeIcon size={22} />
            <Users size={22} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
