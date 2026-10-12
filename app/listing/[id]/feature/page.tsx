'use client'

import {
  ArrowLeft,
  Home,
  Search,
  Award,
  TrendingUp,
  Eye,
  Bed,
  Bath,
  Building2,
  MapPin,
  MessageCircle,
  Zap,
  Lock,
  UserCheck,
  ShieldCheck,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BENEFITS = [
  { icon: Home, title: 'Homepage Placement', desc: 'Appear on the homepage for maximum exposure' },
  { icon: Search, title: 'Top Search Ranking', desc: 'Show at the top of search results' },
  { icon: Award, title: 'Gold Featured Badge', desc: 'Stand out with a premium gold badge' },
  { icon: TrendingUp, title: 'More Views & Enquiries', desc: 'Get more visibility for your listing' },
]

const PLANS = [
  { days: 7, price: 3000, tag: 'Great for urgent rentals', popular: false },
  { days: 14, price: 5000, tag: 'More visibility, more inquiries', popular: false },
  { days: 30, price: 10000, tag: 'Best value for maximum results', popular: true },
]

export default function FeatureYourPropertyPage() {
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState(30)

  const params = useParams()
  const listingId = String(params.id)
  const [loaded, setLoaded] = useState(false)
  const [property, setProperty] = useState({
    title: '',
    location: '',
    price: 0,
    beds: 0,
    baths: 0,
    type: '',
    image: '/placeholder.jpg',
    publicId: '',
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data } = await supabase
        .from('listings')
        .select('title, location_text, price_monthly, bedrooms, bathrooms, property_type, photos, properties(public_id)')
        .eq('id', listingId)
        .eq('landlord_id', user.id)
        .maybeSingle()
      if (!data) {
        router.push('/dashboard/listings')
        return
      }
      const row: any = data
      setProperty({
        title: row.title ?? 'Your property',
        location: row.location_text ?? '',
        price: Number(row.price_monthly ?? 0),
        beds: Number(row.bedrooms ?? 0),
        baths: Number(row.bathrooms ?? 0),
        type: row.property_type ?? '',
        image: Array.isArray(row.photos) && row.photos.length > 0 ? row.photos[0] : '/placeholder.jpg',
        publicId: row.properties?.public_id ?? '',
      })
      setLoaded(true)
    }
    load()
  }, [listingId, router])

  const plan = PLANS.find((p) => p.days === selectedPlan)!

  const whatsappMessage = encodeURIComponent(
    `Hi EboHomes, I'd like to feature my listing "${property.title}"${property.publicId ? ` (${property.publicId})` : ''} for ${plan.days} days (₦${plan.price.toLocaleString()}). Please guide me on payment.`
  )

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>

        {/* Header */}
        <div className="mb-10">
          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-600 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
            <Award size={13} />
            FEATURE YOUR PROPERTY
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3">
            Get More Views. <span className="text-primary">Rent Faster.</span>
          </h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-2xl">
            Featured properties appear on the homepage, at the top of search results, and receive
            more visibility with people searching for a home.
          </p>
        </div>

        {/* Top Grid: Benefits + Property Preview */}
        <div className="grid lg:grid-cols-2 gap-8 mb-14">
          {/* Left: Benefit cards */}
          <div className="grid sm:grid-cols-2 gap-4">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="bg-card border border-border rounded-3xl p-5 hover:shadow-md hover:border-primary/30 transition-all duration-300"
              >
                <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                  <b.icon size={20} className="text-primary" />
                </div>
                <p className="font-bold text-foreground text-sm mb-1">{b.title}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>

          {/* Right: Property preview card */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Your Property
            </p>
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="relative h-56">
                <img src={property.image} alt={property.title} className="w-full h-full object-cover" />
                <span className="absolute top-4 right-4 bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 text-xs font-bold px-3 py-1.5 rounded-full shadow">
                  Featured Preview
                </span>
              </div>
              <div className="p-5">
                <h3 className="font-bold text-foreground text-lg mb-1">{property.title}</h3>
                <p className="text-muted-foreground text-sm flex items-center gap-1 mb-3">
                  <MapPin size={13} />
                  {property.location}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                  <span className="flex items-center gap-1"><Bed size={14} className="text-primary" /> {property.beds} Beds</span>
                  <span className="flex items-center gap-1"><Bath size={14} className="text-primary" /> {property.baths} Baths</span>
                  <span className="flex items-center gap-1"><Building2 size={14} className="text-primary" /> {property.type}</span>
                </div>
                <p className="text-xl font-extrabold text-primary">
                  ₦{property.price.toLocaleString()}<span className="text-sm font-medium text-muted-foreground">/month</span>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-primary/5 border border-primary/10 rounded-2xl px-4 py-3.5 mt-4">
              <Eye size={16} className="text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-foreground/80 leading-relaxed">
                Featured properties get <span className="font-bold text-primary">more visibility</span> in premium placements.
              </p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="mb-14">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-1">Choose Your Promotion Plan</h2>
            <p className="text-muted-foreground text-sm">Select a duration that works best for you</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
            {PLANS.map((p) => {
              const active = selectedPlan === p.days
              return (
                <button
                  key={p.days}
                  onClick={() => setSelectedPlan(p.days)}
                  className={`relative text-left bg-card rounded-3xl p-6 transition-all duration-300 ${
                    p.popular
                      ? 'border-2 border-amber-400 shadow-lg shadow-amber-500/10'
                      : active
                      ? 'border-2 border-primary shadow-md'
                      : 'border border-border hover:border-primary/40 hover:shadow-md'
                  }`}
                >
                  {p.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 text-[10px] font-bold px-3 py-1 rounded-full shadow whitespace-nowrap">
                      <Award size={10} /> MOST POPULAR
                    </span>
                  )}
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-4 mx-auto ${p.popular ? 'bg-amber-50' : 'bg-primary/10'}`}>
                    <Award size={20} className={p.popular ? 'text-amber-500' : 'text-primary'} />
                  </div>
                  <p className="text-center font-bold text-foreground text-lg mb-1">{p.days} Days</p>
                  <p className="text-center text-muted-foreground text-xs mb-4">{p.tag}</p>
                  <p className="text-center text-2xl font-extrabold text-foreground mb-1">
                    ₦{p.price.toLocaleString()}
                  </p>
                  <p className="text-center text-xs text-muted-foreground mb-5">One-time payment</p>
                  <div
                    className={`text-center text-sm font-semibold rounded-full py-2.5 transition-colors ${
                      active
                        ? p.popular
                          ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950'
                          : 'bg-primary text-primary-foreground'
                        : 'border border-border text-foreground'
                    }`}
                  >
                    {active ? <Check size={15} className="inline mr-1 -mt-0.5" /> : null}
                    {active ? 'Selected' : 'Select Plan'}
                  </div>
                </button>
              )
            })}
          </div>

          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-6">
            <ShieldCheck size={14} className="text-primary" />
            All featured requests are reviewed by the EboHomes team before they go live.
          </p>
        </div>

        {/* WhatsApp Manual Activation */}
        <div className="bg-card border border-border rounded-3xl p-8 md:p-12 text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#25D366]/10 flex items-center justify-center mx-auto mb-5">
            <MessageCircle size={30} className="text-[#25D366]" />
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-foreground mb-2">Ready to Feature This Property?</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6 leading-relaxed">
            Contact EboHomes on WhatsApp to complete your featured listing request. After payment is
            confirmed, our team will manually activate your featured listing from the admin dashboard.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-7">
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Zap size={13} className="text-primary" /> Fast Response
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Lock size={13} className="text-primary" /> Secure Process
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <UserCheck size={13} className="text-primary" /> Manual Review
            </span>
          </div>

          <a
            href={`https://wa.me/2349169069445?text=${whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <Button className="bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold px-8 py-6 rounded-full shadow-lg shadow-[#25D366]/20 hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <MessageCircle size={18} className="mr-2" />
              Contact EboHomes on WhatsApp
            </Button>
          </a>
        </div>

        {/* Why Manual Activation */}
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-amber-400/20 flex items-center justify-center shrink-0">
            <ShieldCheck size={22} className="text-amber-600" />
          </div>
          <div>
            <h4 className="font-bold text-foreground text-sm mb-1.5">Why manual activation?</h4>
            <p className="text-muted-foreground text-sm leading-relaxed">
              To maintain trust on EboHomes, every featured request is manually reviewed before
              activation. Once payment is confirmed, your property is marked as Featured and
              immediately appears in premium placements across the platform.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}