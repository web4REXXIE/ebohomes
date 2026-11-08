'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Heart,
  Camera,
  Bed,
  Bath,
  Sofa,
  Share2,
  MapPin,
  Star,
  Calendar,
  Copy,
  Send,
  MessageCircle,
  X,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { EBOHOMES_WHATSAPP } from '@/lib/contact'
import { getSiteUrl } from '@/lib/site-url'
import { useInspectedIds } from '@/lib/use-inspected-ids'
import { sizedPhoto, photoSrcSet, PLACEHOLDER_PHOTO } from '@/lib/image-url'
import { SmartImage } from '@/components/ui/smart-image'

type ListingCardProps = {
  id: string
  landlord_id?: string // no longer used by the card; callers may still pass it
  title?: string
  image: string
  price_monthly: number
  price_yearly?: number
  location: string
  property_type: string
  bedrooms?: number
  bathrooms?: number
  living_rooms?: number
  build_size?: number
  photoCount?: number
  created_at?: string
  verified?: boolean // kept for future Phase 6 use — not displayed at property level today (no evidence backs it yet)
  featured?: boolean
  layout?: 'grid' | 'list' // 'list' = wide horizontal card on desktop (md and up)
  priority?: boolean // true for the first card(s) on screen, so their photo loads first
}

function addedLabel(createdAt?: string) {
  if (!createdAt) return ''
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
  if (Number.isNaN(days)) return ''
  if (days <= 0) return 'Added today'
  if (days === 1) return 'Added yesterday'
  if (days < 7) return `Added ${days} days ago`
  if (days < 30) return `Added ${Math.floor(days / 7)}w ago`
  return ''
}

/* ---------------- Share sheet ---------------- */

function ShareSheet({
  id,
  title,
  onClose,
}: {
  id: string
  title: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const url = `${getSiteUrl()}/listing/${id}`
  const text = `Check out this property on EboHomes: ${title}`
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(text)

  const links = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
  }

  function open(platform: keyof typeof links) {
    window.open(links[platform], '_blank', 'noopener,noreferrer')
    onClose()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(onClose, 900)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text, url })
      onClose()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Native share failed:', error)
    }
  }

  const buttonClass =
    'flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm font-medium text-foreground transition hover:bg-secondary'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Share this property"
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-background p-5 shadow-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Share this property</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share menu"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 truncate text-xs text-muted-foreground">{title}</p>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => open('whatsapp')} className={buttonClass}>
            <MessageCircle size={18} className="text-emerald-600" />
            WhatsApp
          </button>

          <button type="button" onClick={() => open('facebook')} className={buttonClass}>
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold leading-none text-white">
              f
            </span>
            Facebook
          </button>

          <button type="button" onClick={() => open('x')} className={buttonClass}>
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black text-[10px] font-bold leading-none text-white">
              X
            </span>
            X (Twitter)
          </button>

          <button type="button" onClick={() => open('telegram')} className={buttonClass}>
            <Send size={18} className="text-sky-500" />
            Telegram
          </button>

          <button type="button" onClick={copyLink} className={buttonClass}>
            <Copy size={18} />
            {copied ? 'Link copied!' : 'Copy link'}
          </button>

          {canNativeShare && (
            <button type="button" onClick={nativeShare} className={buttonClass}>
              <Share2 size={18} />
              More apps
            </button>
          )}
        </div>

        <p className="mt-4 text-xs leading-snug text-muted-foreground">
          For TikTok or Instagram, tap &quot;More apps&quot; on your phone, or copy the link and
          paste it into your post or story.
        </p>
      </div>
    </div>
  )
}

/* ---------------- Listing card ---------------- */

export function ListingCard({
  id,
  title,
  image,
  price_monthly,
  price_yearly,
  location,
  property_type,
  bedrooms,
  bathrooms,
  living_rooms,
  photoCount,
  created_at,
  featured,
  layout = 'grid',
  priority = false,
}: ListingCardProps) {
  const [saved, setSaved] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const router = useRouter()

  const isList = layout === 'list'
  const displayTitle = title || property_type
  const added = addedLabel(created_at)
  const inspected = useInspectedIds([id]).has(id)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data?.user?.id ?? null
      setUserId(uid)
      if (uid) {
        const { data: existing } = await supabase
          .from('saved_properties')
          .select('id')
          .eq('tenant_id', uid)
          .eq('listing_id', id)
          .maybeSingle()
        setSaved(!!existing)
      }
    })
  }, [id])

  async function handleSave(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return

    if (!userId) {
      router.push('/login')
      return
    }

    setBusy(true)
    setSaveError(false)
    const { error } = saved
      ? await supabase.from('saved_properties').delete().eq('tenant_id', userId).eq('listing_id', id)
      : await supabase.from('saved_properties').insert({ tenant_id: userId, listing_id: id })
    if (error) {
      console.error('Failed to update saved property:', error.message)
      setSaveError(true)
    } else {
      setSaved(!saved)
    }
    setBusy(false)
  }

  function handleViewingClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const text = `Hello EboHomes, I'd like to request a viewing for this property: ${property_type} in ${location}. ${getSiteUrl()}/listing/${id}`
    window.open(
      `https://wa.me/${EBOHOMES_WHATSAPP}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <>
      <article
        className={`group flex flex-col overflow-hidden rounded-card bg-card shadow-rest transition-shadow hover:shadow-raised ${
          featured
            ? 'border border-featured ring-1 ring-featured/40'
            : 'border border-border'
        } ${isList ? 'md:flex-row' : ''}`}
      >
        {/* Photo */}
        <div className={`relative ${isList ? 'md:w-72 md:shrink-0' : ''}`}>
          <Link href={`/listing/${id}`} className="block h-full" aria-label="View property">
            <div
              className={`relative w-full overflow-hidden bg-secondary/40 ${
                isList ? 'aspect-[4/3] md:aspect-auto md:h-full md:min-h-52' : 'aspect-[4/3]'
              }`}
            >
              <SmartImage
                src={image ? sizedPhoto(image, 600) : PLACEHOLDER_PHOTO}
                srcSet={image ? photoSrcSet(image, [320, 480, 640]) : undefined}
                sizes={isList ? '(min-width: 768px) 288px, 100vw' : '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw'}
                alt={displayTitle}
                fallbackSrc={PLACEHOLDER_PHOTO}
                priority={priority}
                className="transition-transform duration-500 motion-reduce:transition-none group-hover:scale-[1.03]"
              />
            </div>
          </Link>

          {featured && (
            <div className="absolute left-0 top-0 flex items-center gap-1 rounded-br-xl bg-featured px-2.5 py-1 text-xs font-bold text-featured-foreground shadow">
              <Star size={11} className="fill-current" />
              FEATURED
            </div>
          )}

          {inspected && (
            <div className="absolute left-0 bottom-9 flex items-center gap-1 rounded-r-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow">
              <ShieldCheck size={11} />
              Inspected by EboHomes
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            title={saved ? 'Remove from saved properties' : 'Save this property'}
            aria-label={saved ? 'Unsave property' : 'Save property'}
            aria-pressed={saved}
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-card/95 text-foreground shadow-rest backdrop-blur-md transition hover:bg-card disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Heart
              size={18}
              aria-hidden="true"
              className={saved ? 'fill-destructive text-destructive' : 'text-foreground'}
            />
          </button>

          {photoCount ? (
            <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <Camera size={11} />
              {photoCount}
            </div>
          ) : null}
        </div>

        {/* Details */}
        <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="whitespace-nowrap text-base font-extrabold leading-tight text-primary sm:text-lg">
                ₦{Number(price_monthly || 0).toLocaleString('en-NG')}
                <span className="text-xs font-medium text-muted-foreground">
                  {' '}
                  /month
                </span>
              </p>
              {Number(price_yearly) > 0 && (
                <p className="text-xs text-muted-foreground">
                  ₦{Number(price_yearly).toLocaleString('en-NG')}/year
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowShare(true)
              }}
              aria-label="Share property"
              className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Share2 size={16} />
            </button>
          </div>

          <Link href={`/listing/${id}`} className="mt-2 block">
            <h3 className="line-clamp-1 text-sm font-semibold text-foreground sm:text-base">
              {displayTitle}
            </h3>
          </Link>

          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin size={12} className="shrink-0" />
            <span className="line-clamp-1">{location}</span>
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {property_type && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">
                {property_type}
              </span>
            )}
            {bedrooms != null && (
              <span className="flex items-center gap-1">
                <Bed size={13} className="text-primary" aria-hidden="true" />
                {bedrooms} {Number(bedrooms) === 1 ? 'bed' : 'beds'}
              </span>
            )}
            {bathrooms != null && (
              <span className="flex items-center gap-1">
                <Bath size={13} className="text-primary" aria-hidden="true" />
                {bathrooms} {Number(bathrooms) === 1 ? 'bath' : 'baths'}
              </span>
            )}
            {living_rooms != null && (
              <span className="flex items-center gap-1">
                <Sofa size={13} className="text-primary" aria-hidden="true" />
                {living_rooms} {Number(living_rooms) === 1 ? 'living room' : 'living rooms'}
              </span>
            )}
          </div>

          {saveError && (
            <p role="alert" className="mt-2 text-xs font-medium text-destructive">
              Could not update your saved properties. Please try again.
            </p>
          )}
          {added && <p className="mt-2 text-xs font-medium text-success">{added}</p>}

          <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
            <Link
              href={`/listing/${id}`}
              className="flex h-11 items-center justify-center rounded-lg border border-border px-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/50 sm:text-sm"
            >
              Details
            </Link>
            <button
              type="button"
              onClick={handleViewingClick}
              className="flex h-11 items-center justify-center gap-1 rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:text-sm"
            >
              <Calendar size={14} />
              Viewing
            </button>
          </div>
        </div>
      </article>

      {showShare && (
        <ShareSheet id={id} title={displayTitle} onClose={() => setShowShare(false)} />
      )}
    </>
  )
}
