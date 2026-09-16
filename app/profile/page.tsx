'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User, Phone, Mail, Camera, Loader2, Check, LogOut, Lock, ShieldCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  full_name: string | null
  phone: string | null
  role: string | null
  avatar_url: string | null
  verified: boolean | null
  verification_status: string | null
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
      .select('id, full_name, phone, role, avatar_url, verified, verification_status')
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
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, phone })
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-foreground mb-1">Profile</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage your account details.</p>

      {/* Avatar + role */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Profile"
              className="w-24 h-24 rounded-full object-cover border-4 border-card shadow"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl font-bold border-4 border-card shadow">
              {fullName?.[0]?.toUpperCase() ?? email[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer shadow-md">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploading} />
          </label>
        </div>

        {profile?.role && (
          <span className="mt-3 text-xs font-medium bg-secondary text-muted-foreground px-3 py-1 rounded-full capitalize">
            {profile.role}
            {profile.role === 'landlord' && profile.verified && (
              <span className="inline-flex items-center gap-1 text-primary ml-1.5">
                <ShieldCheck size={11} /> Verified
              </span>
            )}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Editable fields */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <h2 className="font-semibold text-foreground mb-4 text-sm">Personal Details</h2>

        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Full Name</label>
        <div className="relative mb-4">
          <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full h-11 pl-10 pr-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>

        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Phone Number</label>
        <div className="relative mb-4">
          <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full h-11 pl-10 pr-3 rounded-lg border border-border bg-background text-sm"
          />
        </div>

        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
        <div className="relative mb-1">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={email}
            disabled
            className="w-full h-11 pl-10 pr-3 rounded-lg border border-border bg-muted text-sm text-muted-foreground"
          />
        </div>
        <p className="text-[11px] text-muted-foreground mb-4">Email can't be changed here.</p>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : null}
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
        </button>
      </div>

      {/* Account actions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Link
          href="/forgot-password"
          className="flex items-center gap-3 px-5 py-4 text-sm font-medium text-foreground hover:bg-muted transition-colors border-b border-border"
        >
          <Lock size={16} className="text-muted-foreground" />
          Change Password
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-5 py-4 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors text-left"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </div>
  )
}