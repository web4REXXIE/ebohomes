'use client'

import { useState, useEffect, useRef } from 'react'
import {
  User, Building2, ShieldCheck, Lock, Bell, Landmark,
  ShieldAlert, Camera, Loader2, ChevronDown, ChevronRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  location: string | null
  avatar_url: string | null
  verified: boolean | null
  verification_status: string | null
  business_name: string | null
  business_address: string | null
  cac_number: string | null
  bank_name: string | null
  bank_account_name: string | null
  bank_account_number: string | null
}

const VERIFICATION_STEPS = [
  { key: 'email', label: 'Email Address' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'identity', label: 'Identity Verification' },
  { key: 'address', label: 'Address Verification' },
  { key: 'cac', label: 'Business Registration (CAC)' },
]

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [personalForm, setPersonalForm] = useState({ full_name: '', phone: '', location: '' })
  const [businessForm, setBusinessForm] = useState({ business_name: '', business_address: '', cac_number: '' })
  const [bankForm, setBankForm] = useState({ bank_name: '', bank_account_name: '', bank_account_number: '' })

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      console.error('Failed to load profile:', error)
      setLoading(false)
      return
    }

    // Backfill email from auth if not yet stored on the profile row
    const email = data.email ?? user.email ?? null

    setProfile({ ...data, email })
    setPersonalForm({
      full_name: data.full_name ?? '',
      phone: data.phone ?? '',
      location: data.location ?? '',
    })
    setBusinessForm({
      business_name: data.business_name ?? '',
      business_address: data.business_address ?? '',
      cac_number: data.cac_number ?? '',
    })
    setBankForm({
      bank_name: data.bank_name ?? '',
      bank_account_name: data.bank_account_name ?? '',
      bank_account_number: data.bank_account_number ?? '',
    })
    setLoading(false)
  }

  async function handleSave(section: 'personal' | 'business' | 'bank') {
    if (!profile) return
    setSaving(true)

    const payload =
      section === 'personal' ? personalForm :
      section === 'business' ? businessForm :
      bankForm

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', profile.id)

    setSaving(false)
    if (error) {
      console.error('Save failed:', error)
      return
    }

    setProfile({ ...profile, ...payload })
    setOpenSection(null)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    setUploadingPhoto(true)
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      console.error('Upload failed:', uploadError)
      setUploadingPhoto(false)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const avatar_url = `${urlData.publicUrl}?t=${Date.now()}` // cache-bust

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url })
      .eq('id', profile.id)

    if (!updateError) {
      setProfile({ ...profile, avatar_url })
    }
    setUploadingPhoto(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  if (!profile) {
    return <div className="p-6 text-muted-foreground">Couldn't load your profile.</div>
  }

  const initials = profile.full_name?.[0]?.toUpperCase() ?? 'L'

  const tiles = [
    { key: 'personal', icon: User, label: 'Personal Information', desc: 'Update your personal details and contact information.' },
    { key: 'business', icon: Building2, label: 'Business Information', desc: 'Manage your business and agency details.' },
    { key: 'verification', icon: ShieldCheck, label: 'Verification Status', desc: 'View your verification progress and documents.' },
    { key: 'security', icon: Lock, label: 'Security', desc: 'Change password and manage account security.', stub: true },
    { key: 'notifications', icon: Bell, label: 'Notification Preferences', desc: 'Choose what notifications you want to receive.', stub: true },
    { key: 'bank', icon: Landmark, label: 'Bank Details', desc: 'Manage your bank account for payouts.' },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Profile & Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, business details and account preferences.</p>
      </div>

      {/* Profile card */}
      <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
            >
              {uploadingPhoto ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-foreground">{profile.full_name || 'Unnamed Landlord'}</p>
              {profile.verified && (
                <span className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  <ShieldCheck size={11} /> Verified Landlord
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{profile.email}</p>
            <p className="text-xs text-muted-foreground">{profile.phone || 'No phone on file'} {profile.location ? `· ${profile.location}` : ''}</p>
          </div>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="h-9 px-4 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-secondary/50"
        >
          Edit Photo
        </button>
      </div>

      {/* Settings tiles */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            onClick={() => !tile.stub && setOpenSection(openSection === tile.key ? null : tile.key)}
            className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3">
                <tile.icon size={17} />
              </div>
              {tile.stub ? <ChevronRight size={16} className="text-muted-foreground mt-1" /> :
                (openSection === tile.key ? <ChevronDown size={16} className="text-muted-foreground mt-1" /> : <ChevronRight size={16} className="text-muted-foreground mt-1" />)}
            </div>
            <p className="text-sm font-semibold text-foreground">{tile.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{tile.desc}</p>
          </button>
        ))}
      </div>

      {/* Personal Information panel */}
      {openSection === 'personal' && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="font-semibold text-foreground text-sm">Personal Information</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full Name" value={personalForm.full_name} onChange={(v) => setPersonalForm({ ...personalForm, full_name: v })} />
            <Field label="Phone Number" value={personalForm.phone} onChange={(v) => setPersonalForm({ ...personalForm, phone: v })} />
            <Field label="Location" value={personalForm.location} onChange={(v) => setPersonalForm({ ...personalForm, location: v })} className="sm:col-span-2" />
          </div>
          <SaveBar saving={saving} onSave={() => handleSave('personal')} onCancel={() => setOpenSection(null)} />
        </div>
      )}

      {/* Business Information panel */}
      {openSection === 'business' && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="font-semibold text-foreground text-sm">Business Information</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Business / Agency Name" value={businessForm.business_name} onChange={(v) => setBusinessForm({ ...businessForm, business_name: v })} />
            <Field label="CAC Number" value={businessForm.cac_number} onChange={(v) => setBusinessForm({ ...businessForm, cac_number: v })} />
            <Field label="Business Address" value={businessForm.business_address} onChange={(v) => setBusinessForm({ ...businessForm, business_address: v })} className="sm:col-span-2" />
          </div>
          <SaveBar saving={saving} onSave={() => handleSave('business')} onCancel={() => setOpenSection(null)} />
        </div>
      )}

      {/* Bank Details panel */}
      {openSection === 'bank' && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="font-semibold text-foreground text-sm">Bank Details</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Bank Name" value={bankForm.bank_name} onChange={(v) => setBankForm({ ...bankForm, bank_name: v })} />
            <Field label="Account Name" value={bankForm.bank_account_name} onChange={(v) => setBankForm({ ...bankForm, bank_account_name: v })} />
            <Field label="Account Number" value={bankForm.bank_account_number} onChange={(v) => setBankForm({ ...bankForm, bank_account_number: v })} />
          </div>
          <SaveBar saving={saving} onSave={() => handleSave('bank')} onCancel={() => setOpenSection(null)} />
        </div>
      )}

      {/* Verification Status panel */}
      {openSection === 'verification' && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-foreground text-sm">Verification Status</p>
            <span className="text-xs font-semibold text-primary capitalize">{profile.verification_status ?? 'pending'}</span>
          </div>
          {VERIFICATION_STEPS.map((step) => (
            <div key={step.key} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span className="text-foreground">{step.label}</span>
              <span className={profile.verified ? 'text-primary text-xs font-semibold' : 'text-amber-500 text-xs font-semibold'}>
                {profile.verified ? 'Verified' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Danger Zone */}
      <div className="bg-card border border-destructive/30 rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className="text-destructive shrink-0" size={18} />
          <div>
            <p className="text-sm font-semibold text-destructive">Danger Zone</p>
            <p className="text-xs text-muted-foreground">Deactivate or permanently delete your landlord account.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="h-9 px-4 rounded-lg border border-destructive/40 text-destructive text-sm font-semibold hover:bg-destructive/5">
            Deactivate Account
          </button>
          <button className="h-9 px-4 rounded-lg bg-destructive text-white text-sm font-semibold hover:bg-destructive/90">
            Delete Account
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  )
}

function SaveBar({ saving, onSave, onCancel }: { saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button onClick={onCancel} className="h-9 px-4 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-secondary/50">
        Cancel
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        Save Changes
      </button>
    </div>
  )
}