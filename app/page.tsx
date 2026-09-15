'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  ShieldCheck,
  Home as HomeIcon,
  MessageCircle,
  Tag,
  MapPin,
  ChevronDown,
  ClipboardCheck,
  Key,
  Building2,
  Home,
  DoorOpen,
  Building,
  Bed,
  Briefcase,
  Store,
  MapPinned,
  Warehouse,
  CalendarClock,
  Users,
  ScanFace,
  BadgeCheck,
  SearchCheck,
  Headphones,
  CheckCircle2,
  Crown,
  Eye,
  Heart,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { ListingCard } from '@/components/listing-card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'


const CATEGORIES = [
  { value: 'Flat / Apartment', label: 'Apartments', desc: 'Modern apartments for comfortable living', icon: Building2 },
  { value: 'Bungalow', label: 'Bungalows', desc: 'Spacious bungalows for families', icon: Home },
  { value: 'Self Contain', label: 'Self-Contain', desc: 'Private self-contained apartments', icon: DoorOpen },
  { value: 'Duplex', label: 'Duplexes', desc: 'Luxury duplexes with premium features', icon: Building },
  { value: 'Penthouse', label: 'Penthouses', desc: 'Premium top-floor living', icon: Bed },
  { value: 'Hostel', label: 'Hostels', desc: 'Shared spaces for students & professionals', icon: Users },
  { value: 'Office', label: 'Offices', desc: 'Professional spaces for your business', icon: Briefcase },
  { value: 'Shop / Mall', label: 'Shops & Malls', desc: 'Shops and commercial spaces', icon: Store },
  { value: 'Warehouse', label: 'Warehouses', desc: 'Warehouse and storage facilities', icon: Warehouse },
  { value: 'Land / Plot', label: 'Lands & Plots', desc: 'Residential and commercial lands', icon: MapPinned },
  { value: 'Event Center', label: 'Event Centers', desc: 'Spaces for events and gatherings', icon: CalendarClock },
]

const WHY_CHOOSE = [
  { title: 'Verified Landlords', desc: 'Every landlord is verified to ensure real, trusted people.', icon: ShieldCheck },
  { title: 'Secure & Safe', desc: 'Your safety is our priority with secure messaging.', icon: ScanFace },
  { title: 'Quality Listings', desc: 'We approve every listing to ensure genuine properties.', icon: BadgeCheck },
  { title: 'Easy Search', desc: 'Advanced filters help you find the perfect home fast.', icon: SearchCheck },
  { title: 'Always Here', desc: 'Our support team is ready to help whenever you need us.', icon: Headphones },
]

export default function HomePage() {
  const router = useRouter()
  const [listingMode] = useState<'rent' | 'sale'>('rent')
  const [location, setLocation] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  const [featured, setFeatured] = useState<any[]>([])
  const [recent, setRecent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [stats, setStats] = useState({ properties: 0, landlords: 0 })
  const [featuredIndex, setFeaturedIndex] = useState(0)

  const searchCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchHomeListings = async () => {
      setLoading(true)

      const { data: featuredData } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'approved')
        .eq('featured', true)
        .order('created_at', { ascending: false })

      const { data: recentData } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(4)

      setFeatured(featuredData ?? [])
      setRecent(recentData ?? [])
      setLoading(false)
    }
    fetchHomeListings()
  }, [])

  useEffect(() => {
    const fetchCategoryCounts = async () => {
      const { data } = await supabase
        .from('listings')
        .select('property_type')
        .eq('status', 'approved')

      const counts: Record<string, number> = {}
      data?.forEach((row) => {
        const type = row.property_type
        counts[type] = (counts[type] || 0) + 1
      })
      setCategoryCounts(counts)
    }
    fetchCategoryCounts()
  }, [])

  useEffect(() => {
    const fetchStats = async () => {
      const { count: propCount } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')

      const { count: landlordCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'landlord')

      setStats({ properties: propCount ?? 0, landlords: landlordCount ?? 0 })
    }
    fetchStats()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (location) params.set('location', location)
    if (propertyType) params.set('type', propertyType)
    if (minPrice) params.set('minPrice', minPrice)
    if (maxPrice) params.set('maxPrice', maxPrice)
    params.set('mode', listingMode)
    router.push('/search?' + params.toString())
  }

  const scrollToSearch = () => {
    searchCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const steps = [
    { n: 1, icon: Search, title: 'Search', desc: 'Find properties that fit your needs' },
    { n: 2, icon: MessageCircle, title: 'Contact', desc: 'Message or call landlords directly' },
    { n: 3, icon: ClipboardCheck, title: 'Inspect', desc: 'Schedule viewing and inspect' },
    { n: 4, icon: Key, title: 'Move In', desc: 'Sign agreement and move in' },
  ]

  const TRUST_MINI = [
    { icon: ShieldCheck, label: 'Verified Landlords' },
    { icon: MessageCircle, label: 'Secure Messaging' },
    { icon: BadgeCheck, label: 'Trusted Platform' },
    { icon: Headphones, label: '24/7 Support' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative">
          <div
            className="relative py-16 md:py-24"
            style={{
              backgroundImage: "url('/hero.jpg')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="absolute inset-0 bg-black/55" />
            <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center pb-14 md:pb-20">
              <span className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-sm font-medium px-4 py-1.5 rounded-full mb-6">
                <ShieldCheck size={16} className="text-primary" />
                Verified Rentals. Trusted People.
              </span>
              <h1 className="text-3xl md:text-5xl font-extrabold mb-3 text-white leading-tight text-balance">
                Find Verified Homes in <span className="text-primary">Ebonyi State</span>
              </h1>
              <p className="text-base md:text-lg text-white/90 max-w-xl mx-auto mb-7 text-balance">
                The safest way to rent genuine properties from verified landlords. No scams. No stress.
              </p>
              <Button
                type="button"
                onClick={scrollToSearch}
                variant="outline"
                className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Search size={18} className="mr-2" />
                Search Homes
              </Button>
            </div>
          </div>

          {/* Overlapping Search Card */}
          <div
            ref={searchCardRef}
            className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 md:-mt-14 relative z-20"
          >
            <form
              onSubmit={handleSearch}
              className="bg-card rounded-2xl shadow-xl border border-border p-5 md:p-6 space-y-4"
            >
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-1.5">
                  <MapPin size={15} className="text-primary" />
                  Location
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Where are you looking?"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full pl-3 pr-9 py-2.5 bg-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-1.5">
                  <HomeIcon size={15} className="text-primary" />
                  Property Type
                </label>
                <div className="relative">
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className="w-full appearance-none pl-3 pr-9 py-2.5 bg-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Any Type</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-1.5">
                  <Tag size={15} className="text-primary" />
                  Budget
                </label>
                <div className="flex items-center gap-2 px-3 py-1 bg-background border border-border rounded-xl focus-within:ring-2 focus-within:ring-primary">
                  <input
                    type="number"
                    placeholder="Min Price"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="w-full py-1.5 bg-transparent text-foreground text-sm focus:outline-none"
                  />
                  <span className="text-muted-foreground text-sm">–</span>
                  <input
                    type="number"
                    placeholder="Max Price"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="w-full py-1.5 bg-transparent text-foreground text-sm focus:outline-none"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5">
                <Search size={18} className="mr-2" />
                Search Homes
              </Button>
            </form>
          </div>
        </section>

        {/* Featured Properties */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-500 text-xl">★</span>
            <h2 className="text-xl md:text-3xl font-bold text-foreground">Featured Properties</h2>
            <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              Premium Listings
            </span>
          </div>
          <p className="text-muted-foreground text-sm mb-5">Handpicked premium properties from verified landlords</p>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-card rounded-lg overflow-hidden border border-border animate-pulse h-64" />
              ))}
            </div>
          ) : featured.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
              No featured properties yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {featured.map((listing) => (
                <ListingCard
                  key={listing.id}
                  id={listing.id}
                  landlord_id={listing.landlord_id}
                  image={listing.photos?.[0] ?? ''}
                  price_monthly={listing.price_monthly}
                  price_yearly={listing.price_yearly}
                  location={listing.location_text}
                  property_type={listing.property_type}
                  bedrooms={listing.bedrooms}
                  verified={listing.verified}
                  featured={listing.featured}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recently Added */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl md:text-3xl font-bold text-foreground">Recently Added</h2>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-card rounded-lg overflow-hidden border border-border animate-pulse h-56" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {recent.map((listing) => (
                <ListingCard
                  key={listing.id}
                  id={listing.id}
                  landlord_id={listing.landlord_id}
                  image={listing.photos?.[0] ?? ''}
                  price_monthly={listing.price_monthly}
                  price_yearly={listing.price_yearly}
                  location={listing.location_text}
                  property_type={listing.property_type}
                  bedrooms={listing.bedrooms}
                  verified={listing.verified}
                  featured={listing.featured}
                />
              ))}
            </div>
          )}
        </section>

        {/* See More Properties CTA */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Search size={26} className="text-primary" />
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-extrabold text-foreground uppercase tracking-wide">
                  See More Properties
                </h3>
                <p className="text-muted-foreground text-sm">Browse hundreds of verified properties across Ebonyi State</p>
              </div>
            </div>
            <Button
              onClick={() => router.push('/search')}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 py-3 rounded-full text-base whitespace-nowrap"
            >
              See More Properties →
            </Button>
          </div>
        </section>

        {/* Property Categories */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <h2 className="text-xl md:text-3xl font-bold text-foreground mb-1">Explore Properties by Category</h2>
          <p className="text-muted-foreground text-sm mb-6">Find the perfect type of property that suits your needs and lifestyle.</p>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => router.push('/search?type=' + encodeURIComponent(cat.value))}
                className="text-left bg-card border border-border rounded-xl p-5 hover:border-primary hover:shadow-md transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <cat.icon size={22} className="text-primary" />
                </div>
                <p className="font-semibold text-foreground">{cat.label}</p>
                <p className="text-xs text-muted-foreground mb-1">{cat.desc}</p>
                <p className="text-xs font-semibold text-primary">
                  {categoryCounts[cat.value] ?? 0} Properties
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="max-w-xl mb-12">
            <span className="text-primary text-xs font-semibold tracking-wide uppercase">Getting started</span>
            <h2 className="text-2xl md:text-4xl font-bold text-foreground mt-2">
              From search to move in, <span className="text-primary">four steps</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-14">
            {steps.map((step) => (
              <div key={step.n}>
                <p className="text-4xl md:text-5xl font-extrabold text-primary/15 mb-1 leading-none">0{step.n}</p>
                <step.icon size={20} className="text-primary mb-3" />
                <p className="font-semibold text-foreground mb-1">{step.title}</p>
                <p className="text-muted-foreground text-xs md:text-sm">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-secondary/40 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
            <ShieldCheck size={32} className="text-primary shrink-0" />
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-lg font-bold text-foreground mb-1">Safe. Simple. Stress-free.</h3>
              <p className="text-muted-foreground text-sm">
                We verify landlords, secure your information, and make sure your home search experience is smooth from start to finish.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 shrink-0">
              {TRUST_MINI.map((t) => (
                <span key={t.label} className="text-xs font-medium text-foreground">{t.label}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Why Choose EboHomes */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="relative">
              <img
                src="/hero.jpg"
                alt="Verified home in Ebonyi State"
                className="rounded-2xl object-cover w-full h-[380px] md:h-[440px]"
              />
              <div className="absolute -bottom-6 -right-4 sm:-right-6 bg-card border border-border rounded-xl px-5 py-4 shadow-lg">
                <p className="text-2xl font-extrabold text-foreground">{stats.landlords}+</p>
                <p className="text-xs text-muted-foreground max-w-[140px]">Verified landlords ready to rent to you</p>
              </div>
            </div>

            <div>
              <span className="text-primary text-xs font-semibold tracking-wide uppercase">Our promise</span>
              <h2 className="text-2xl md:text-4xl font-bold text-foreground mt-2 mb-4">
                Why trust <span className="text-primary">EboHomes?</span>
              </h2>
              <p className="text-muted-foreground text-sm mb-8 max-w-md">
                We built EboHomes because finding a home in Ebonyi State shouldn't mean risking a scam. Here's what that actually means for you.
              </p>
              <ul className="space-y-5">
                {WHY_CHOOSE.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <CheckCircle2 size={20} className="text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground text-sm">{item.title}</p>
                      <p className="text-muted-foreground text-sm">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Trusted by Students & Professionals */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="bg-card rounded-3xl shadow-lg border border-border/60 p-8 md:p-12 text-center">
            <h3 className="text-xl md:text-2xl font-bold text-foreground mb-2">Trusted by Students & Professionals</h3>
            <p className="text-muted-foreground text-sm mb-9 max-w-md mx-auto">
              We are proud to serve students and staff from leading institutions in Ebonyi State.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-14">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-secondary/40 flex items-center justify-center p-1.5 shrink-0">
                  <img src="/ebsu-logo.png" alt="EBSU" className="h-full w-full object-contain" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-primary text-base">EBSU</p>
                  <p className="text-xs text-muted-foreground">Ebonyi State University</p>
                </div>
              </div>

              <div className="hidden sm:block w-px h-10 bg-gradient-to-b from-transparent via-border to-transparent" />

              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-secondary/40 flex items-center justify-center p-1.5 shrink-0">
                  <img src="/funai-logo.png" alt="FUNAI" className="h-full w-full object-contain" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-primary text-base">FUNAI</p>
                  <p className="text-xs text-muted-foreground">Alex Ekwueme Federal University</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* App CTA */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
          <div className="bg-primary rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-5 text-primary-foreground">
            <div>
              <span className="inline-block bg-amber-400 text-amber-950 text-xs font-bold px-3 py-1 rounded-full mb-2">
                COMING SOON
              </span>
              <h3 className="text-xl md:text-2xl font-bold mb-1">EboHomes App Coming Soon!</h3>
              <p className="text-primary-foreground/80 text-sm max-w-md">
                We're working hard to bring you the best property search experience on the go.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-3">
              <CalendarClock size={20} />
              <span className="text-sm font-medium">Stay tuned!</span>
            </div>
          </div>
        </section>

        {/* Featured Upgrade Banner with Carousel */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-primary to-emerald-900 shadow-2xl">
            <div className="absolute top-0 right-0 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-400/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3" />
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage: 'radial-gradient(circle, #fbbf24 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />

            <div className="relative z-10 grid md:grid-cols-2 gap-10 md:gap-12 items-center p-8 md:p-14">
              <div>
                <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-amber-400/30 text-amber-300 text-xs font-bold px-4 py-1.5 rounded-full mb-6 tracking-wide">
                  <Crown size={13} className="text-amber-400" />
                  FEATURED LISTING
                </span>

                <h3 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-4">
                  List Your Property as{' '}
                  <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
                    Featured
                  </span>
                </h3>

                <p className="text-white/70 text-sm md:text-base mb-6 max-w-sm leading-relaxed">
                  Increase visibility, get more inquiries, and close deals faster by upgrading to a Featured Listing.
                </p>

                <div className="inline-flex items-center gap-2.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-3 mb-7">
                  <div className="w-8 h-8 rounded-full bg-amber-400/15 flex items-center justify-center shrink-0">
                    <Eye size={15} className="text-amber-400" />
                  </div>
                  <p className="text-xs md:text-sm text-white/90">
                    Featured listings get up to <span className="font-bold text-amber-400">5× more views</span>
                  </p>
                </div>

                <Button
                  onClick={() => router.push(featured.length > 0 ? `/listing/${featured[featuredIndex].id}/feature` : '/dashboard/listings')}
                  className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-amber-950 font-bold px-7 py-6 rounded-full shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 hover:scale-[1.03] transition-all duration-300"
                >
                  Upgrade to Featured
                  <ChevronRight size={18} className="ml-1" />
                </Button>
              </div>

              <div className="relative">
                {featured.length > 0 && (
                  <div className="relative bg-white rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 transition-transform duration-500">
                    <div className="relative h-52 md:h-60">
                      <img
                        src={featured[featuredIndex]?.photos?.[0] ?? '/hero.jpg'}
                        alt={featured[featuredIndex]?.property_type ?? 'Featured property'}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
                      <span className="absolute top-3.5 left-3.5 bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 text-xs font-bold px-3 py-1.5 rounded-full shadow">
                        Featured
                      </span>
                      <button
                        aria-label="Save property"
                        className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center shadow hover:bg-white hover:scale-110 transition-all duration-200"
                      >
                        <Heart size={16} className="text-foreground" />
                      </button>
                    </div>

                    <div className="p-5">
                      <p className="text-xl font-extrabold text-primary mb-1.5">
                        ₦{featured[featuredIndex]?.price_monthly?.toLocaleString()}
                        <span className="text-sm font-medium text-muted-foreground">/month</span>
                      </p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mb-3">
                        <MapPin size={13} />
                        {featured[featuredIndex]?.location_text}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
                        <span className="flex items-center gap-1.5">
                          <HomeIcon size={13} /> {featured[featuredIndex]?.property_type}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Bed size={13} /> {featured[featuredIndex]?.bedrooms} Beds
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {featured.length > 1 && (
                  <>
                    <button
                      aria-label="Previous featured property"
                      onClick={() => setFeaturedIndex((i) => (i - 1 + featured.length) % featured.length)}
                      className="absolute top-1/2 -translate-y-1/2 -left-4 md:-left-5 w-10 h-10 rounded-full bg-white/95 backdrop-blur-md shadow-lg flex items-center justify-center hover:bg-white hover:scale-110 transition-all duration-200"
                    >
                      <ChevronLeft size={18} className="text-foreground" />
                    </button>
                    <button
                      aria-label="Next featured property"
                      onClick={() => setFeaturedIndex((i) => (i + 1) % featured.length)}
                      className="absolute top-1/2 -translate-y-1/2 -right-4 md:-right-5 w-10 h-10 rounded-full bg-white/95 backdrop-blur-md shadow-lg flex items-center justify-center hover:bg-white hover:scale-110 transition-all duration-200"
                    >
                      <ChevronRight size={18} className="text-foreground" />
                    </button>

                    <div className="flex justify-center gap-1.5 mt-5">
                      {featured.map((_, i) => (
                        <button
                          key={i}
                          aria-label={`Go to featured property ${i + 1}`}
                          onClick={() => setFeaturedIndex(i)}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            i === featuredIndex
                              ? 'bg-gradient-to-r from-amber-300 to-amber-500 w-7'
                              : 'bg-white/30 w-1.5 hover:bg-white/50'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Ready to Get Started */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="relative overflow-hidden bg-gradient-to-br from-secondary/60 to-secondary/20 border border-border/60 rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-emerald-700 flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
              <Home size={28} className="text-white" />
            </div>

            <div className="flex-1 text-center md:text-left">
              <h3 className="text-xl md:text-2xl font-bold text-foreground mb-1.5">Ready to get started?</h3>
              <p className="text-muted-foreground text-sm md:text-base">
                List your property or explore verified properties across Ebonyi State.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full md:w-auto">
              <Button
                onClick={() => router.push('/list-property')}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full px-7 py-6 shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-300"
              >
                <Home size={16} className="mr-2" />
                List Your Property
              </Button>
              <Button
                onClick={() => router.push('/search')}
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/5 hover:border-primary font-semibold rounded-full px-7 py-6 hover:scale-[1.02] transition-all duration-300"
              >
                <Search size={16} className="mr-2" />
                Browse Properties
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}