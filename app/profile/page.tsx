'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User, Phone, Mail, Camera, Loader2, Check, LogOut, Lock, ShieldCheck, Bell, KeyRound, ChevronRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tenantVerificationState } from '@/lib/tenant-verification'
import { landlordVerificationDisplay } from '@/lib/landlord-verification'

// Profile.
// Same as before: photo upload, name and phone, email (read only), account links, logout.
// New: an "ID verification" row that tells the truth about where the person stands, with a link to the right page.
// New: the name and phone are checked before saving. The landlord "Verified" tag next to the role is gone: it
// read one database flag on its own. The verification row uses the same checks as the rest of the app.

type Profile = {
  id: string
  full_name: string | null
  phone: string | null
  role: string | null
  avatar_url: string | null
  verified: boolean | null
  verification_status: string | null
  rejection_reason: string | null
  account_type: string | null
  business_name: string | null
  business_address: string | null
  cac_number: string | null
  representative_name: string | null
  representative_role: string | null
  id_document_type: string | null
  id_document_url: string | null
  selfie_url: string | null
  ownership_doc_url: string | null
}

type VerifyRow = {
  label: string
  detail: string
  tone: 'green' | 'amber' | 'red' | 'grey'
  href: string
  action: string
}

const TONE_CHIP: Record<VerifyRow['tone'], string> = {
  green: 'bg-success-soft text-success',
  amber: 'bg-warning-soft text-warning',
  red: 'bg-destructive/10 text-destructive',
  grey: 'bg-secondary text-muted-foreground',
}

// One plain description of the person's verification, from the same helpers the verification pages use.
function verifyRow(p: Profile): VerifyRow {
  if (p.role === 'landlord') {
    const d = landlordVerificationDisplay(p)
    return {
      label: d.label,
      detail: d.detail,
      tone: d.tone === 'blue' ? 'amber' : d.tone,
      href: '/dashboard/verify',
      action: d.state === 'verified' ? 'View details' : d.actionLabel,
    }
  }
  const state = tenantVerificationState(p)
  if (state === 'verified') {
    return { label: 'Verified', detail: 'EboHomes approved your account. You can apply for properties.', tone: 'green', href: '/verify-account', action: 'View details' }
  }
  if (state === 'submitted') {
    return { label: 'Submitted, waiting for EboHomes', detail: 'You have sent your ID and selfie. EboHomes has not recorded a decision yet.', tone: 'amber', href: '/verify-account', action: 'View status' }
  }
  if (state === 'rejected') {
    return { label: 'Not approved', detail: 'Your last submission was not approved. Open it to see the reason and send new photos.', tone: 'red', href: '/verify-account', action: 'Update details' }
  }
  return { label: 'Not verified', detail: 'You must verify your ID before you can apply for a property.', tone: 'grey', href: '/verify-account', action: 'Verify now' }
}

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user

    if (!user) {
      router.push('/login')
      return
    }

    setEmail(user.email ?? '')

    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, full_name, phone, role, avatar_url, verified, verification_status, rejection_reason, account_type, business_name, business_address, cac_number, representative_name, representative_role, id_document_type, id_document_url, selfie_url, ownership_doc_url',
      )
      .eq('id', user.id)
      .maybeSingle()

    if (error) setError(error.message)
    if (data) {
      setProfile(data)
      setFullName(data.full_name ?? '')
      setPhone(data.phone ?? '')
    }
    setLoading(false)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    setUploading(true)
    setError(null)

    const data = new FormData()
    data.append('file', file)
    data.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!)

    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: data }
      )
      const json = await res.json()
      if (!json.secure_url) throw new Error('Upload failed')

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: json.secure_url })
        .eq('id', profile.id)

      if (updateError) throw updateError

      setProfile((prev) => (prev ? { ...prev, avatar_url: json.secure_url } : prev))
    } catch (err: any) {
      setError(err.message ?? 'Could not upload photo. Try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!profile) return
    setError(null)

    const cleanName = fullName.trim()
    const cleanPhone = phone.trim()
    if (!cleanName) {
      setError('Please enter your full name.')
      return
    }
    if (cleanPhone && cleanPhone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid phone number, for example 0801 234 5678.')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: cleanName, phone: cleanPhone || null })
      .eq('id', profile.id)

    if (error) {
      setError(error.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" role="status" aria-label="Loading your profile">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-foreground mb-1">Profile</h1>
      <p className="text-sm text-muted-foreground mb-6">Your details and account settings.</p>

      {/* Avatar + role */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={fullName ? `${fullName}'s profile photo` : 'Your profile photo'}
              className="w-24 h-24 rounded-full object-cover border-4 border-card shadow"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl font-bold border-4 border-card shadow">
              {fullName?.[0]?.toUpperCase() ?? email[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <label className="focus-within:ring-2 focus-within:ring-ring absolute -bottom-1 -right-1 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            {uploading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Camera size={16} aria-hidden />}
            <span className="sr-only">{uploading ? 'Uploading photo' : 'Change profile photo'}</span>
            <input type="file" accept="image/*" onChange={handleAvatarUpload} className="sr-only" disabled={uploading} />
          </label>
        </div>

        {profile?.role && (
          <span className="mt-3 text-xs font-medium bg-secondary text-muted-foreground px-3 py-1 rounded-full capitalize">
            {profile.role}
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-4 bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Editable fields */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <h2 className="font-semibold text-foreground mb-4 text-sm">Personal Details</h2>

        <label htmlFor="profile-name" className="text-sm font-medium text-foreground-secondary mb-1.5 block">Full name</label>
        <div className="relative mb-4">
          <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="profile-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className="w-full h-12 pl-10 pr-3 rounded-lg border border-border-strong bg-background text-base"
          />
        </div>

        <label htmlFor="profile-phone" className="text-sm font-medium text-foreground-secondary mb-1.5 block">Phone number</label>
        <div className="relative mb-4">
          <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="profile-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="w-full h-12 pl-10 pr-3 rounded-lg border border-border-strong bg-background text-base"
          />
        </div>

        <label htmlFor="profile-email" className="text-sm font-medium text-foreground-secondary mb-1.5 block">Email</label>
        <div className="relative mb-1">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="profile-email"
            value={email}
            disabled
            aria-describedby="profile-email-help"
            className="w-full h-12 pl-10 pr-3 rounded-lg border border-border bg-muted text-base text-muted-foreground"
          />
        </div>
        <p id="profile-email-help" className="text-xs text-muted-foreground mb-4">Email can't be changed here.</p>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="focus-ring w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : saved ? <Check size={16} aria-hidden /> : null}
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </button>
        <p role="status" className="sr-only">{saved ? 'Your changes were saved.' : ''}</p>
      </div>

      {/* ID verification */}
      {profile && (() => {
        const v = verifyRow(profile)
        return (
          <section aria-labelledby="profile-verify-title" className="bg-card border border-border rounded-xl p-5 mb-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 id="profile-verify-title" className="flex items-center gap-2 font-semibold text-foreground text-sm">
                <ShieldCheck size={16} className="text-primary" aria-hidden /> ID verification
              </h2>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${TONE_CHIP[v.tone]}`}>{v.label}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{v.detail}</p>
            <Link
              href={v.href}
              className="focus-ring inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              {v.action}
            </Link>
          </section>
        )
      })()}

      {/* Account actions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {profile?.role !== 'landlord' && (
          <Link
            href="/journey"
            className="focus-ring flex min-h-14 items-center gap-3 px-5 py-4 text-sm font-medium text-foreground hover:bg-muted transition-colors border-b border-border"
          >
            <KeyRound size={16} className="text-muted-foreground" aria-hidden />
            <span className="flex-1">My Rental Journey</span>
            <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
          </Link>
        )}
        <Link
          href="/notifications/preferences"
          className="focus-ring flex min-h-14 items-center gap-3 px-5 py-4 text-sm font-medium text-foreground hover:bg-muted transition-colors border-b border-border"
        >
          <Bell size={16} className="text-muted-foreground" aria-hidden />
          <span className="flex-1">Notification settings</span>
          <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
        </Link>
        <Link
          href="/forgot-password"
          className="focus-ring flex min-h-14 items-center gap-3 px-5 py-4 text-sm font-medium text-foreground hover:bg-muted transition-colors border-b border-border"
        >
          <Lock size={16} className="text-muted-foreground" aria-hidden />
          <span className="flex-1">Change Password</span>
          <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="focus-ring w-full flex min-h-14 items-center gap-3 px-5 py-4 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors text-left"
        >
          <LogOut size={16} aria-hidden />
          Logout
        </button>
      </div>
    </div>
  )
}
