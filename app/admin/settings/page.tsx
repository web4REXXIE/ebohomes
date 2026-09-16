'use client'

import { useEffect, useState } from 'react'
import {
  Settings as SettingsIcon, Shield, Mail, CreditCard, Sliders, Plug, ScrollText, Loader2, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type PlatformSettings = {
  id: number
  platform_name: string
  platform_tagline: string | null
  support_email: string | null
  support_phone: string | null
  timezone: string
  date_format: string
  currency: string
  default_user_role: string
  items_per_page: number
  max_file_size_mb: number
  allowed_file_types: string
  image_quality: string
}

const TABS = [
  { key: 'general', label: 'General', icon: SettingsIcon, ready: true },
  { key: 'system', label: 'System', icon: Sliders, ready: true },
  { key: 'security', label: 'Security', icon: Shield, ready: false },
  { key: 'email', label: 'Email & Notifications', icon: Mail, ready: false },
  { key: 'payment', label: 'Payment Settings', icon: CreditCard, ready: false },
  { key: 'integrations', label: 'Integrations', icon: Plug, ready: false },
  { key: 'logs', label: 'Activity Logs', icon: ScrollText, ready: false },
] as const

type TabKey = typeof TABS[number]['key']

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<TabKey>('general')
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'general' | 'system' | null>(null)
  const [saved, setSaved] = useState<'general' | 'system' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    setLoading(true)
    const { data, error } = await supabase
      .from('platform_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      setError(error.message)
    } else {
      setSettings(data)
    }
    setLoading(false)
  }

  function update<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleSave(section: 'general' | 'system') {
    if (!settings) return
    setSaving(section)
    setError(null)

    const payload = section === 'general'
      ? {
          platform_name: settings.platform_name,
          platform_tagline: settings.platform_tagline,
          support_email: settings.support_email,
          support_phone: settings.support_phone,
          timezone: settings.timezone,
          date_format: settings.date_format,
          currency: settings.currency,
        }
      : {
          default_user_role: settings.default_user_role,
          items_per_page: settings.items_per_page,
          max_file_size_mb: settings.max_file_size_mb,
          allowed_file_types: settings.allowed_file_types,
          image_quality: settings.image_quality,
        }

    const { error } = await supabase
      .from('platform_settings')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', 1)

    if (error) {
      setError(error.message)
    } else {
      setSaved(section)
      setTimeout(() => setSaved(null), 2000)
    }
    setSaving(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full py-20"><Loader2 className="animate-spin text-primary" size={28} /></div>
  }

  if (!settings) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          Couldn't load settings{error ? `: ${error}` : ''}. Make sure the `platform_settings` table exists and has a row with id = 1.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage and configure your platform settings and preferences.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={14} />
            {t.label}
            {!t.ready && (
              <span className="text-[9px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full ml-1">soon</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* General */}
      {tab === 'general' && (
        <div className="bg-card border border-border rounded-xl p-5 max-w-2xl">
          <h2 className="font-semibold text-foreground mb-4">General Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Platform Name">
              <input
                value={settings.platform_name ?? ''}
                onChange={(e) => update('platform_name', e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Platform Tagline">
              <input
                value={settings.platform_tagline ?? ''}
                onChange={(e) => update('platform_tagline', e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Support Email">
              <input
                type="email"
                value={settings.support_email ?? ''}
                onChange={(e) => update('support_email', e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Support Phone">
              <input
                value={settings.support_phone ?? ''}
                onChange={(e) => update('support_phone', e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Timezone">
              <input
                value={settings.timezone ?? ''}
                onChange={(e) => update('timezone', e.target.value)}
                placeholder="e.g. Africa/Lagos"
                className="input"
              />
            </Field>
            <Field label="Date Format">
              <select
                value={settings.date_format ?? ''}
                onChange={(e) => update('date_format', e.target.value)}
                className="input"
              >
                <option value="MMM d, yyyy">Jan 1, 2026</option>
                <option value="dd/MM/yyyy">31/01/2026</option>
                <option value="yyyy-MM-dd">2026-01-31</option>
              </select>
            </Field>
            <Field label="Currency">
              <select
                value={settings.currency ?? ''}
                onChange={(e) => update('currency', e.target.value)}
                className="input"
              >
                <option value="NGN">Nigerian Naira (₦)</option>
                <option value="USD">US Dollar ($)</option>
              </select>
            </Field>
          </div>
          <SaveButton section="general" saving={saving} saved={saved} onClick={() => handleSave('general')} />
        </div>
      )}

      {/* System */}
      {tab === 'system' && (
        <div className="bg-card border border-border rounded-xl p-5 max-w-2xl">
          <h2 className="font-semibold text-foreground mb-4">System Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Default Role for New Users">
              <select
                value={settings.default_user_role ?? ''}
                onChange={(e) => update('default_user_role', e.target.value)}
                className="input"
              >
                <option value="tenant">Tenant</option>
                <option value="landlord">Landlord</option>
              </select>
            </Field>
            <Field label="Items Per Page">
              <input
                type="number"
                min={5}
                max={100}
                value={settings.items_per_page}
                onChange={(e) => update('items_per_page', Number(e.target.value))}
                className="input"
              />
            </Field>
            <Field label="Max File Size (MB)">
              <input
                type="number"
                min={1}
                max={100}
                value={settings.max_file_size_mb}
                onChange={(e) => update('max_file_size_mb', Number(e.target.value))}
                className="input"
              />
            </Field>
            <Field label="Image Quality">
              <select
                value={settings.image_quality ?? ''}
                onChange={(e) => update('image_quality', e.target.value)}
                className="input"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Allowed File Types" full>
              <input
                value={settings.allowed_file_types ?? ''}
                onChange={(e) => update('allowed_file_types', e.target.value)}
                placeholder="jpg,jpeg,png,pdf,doc,docx"
                className="input"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Comma-separated extensions, no dots or spaces.</p>
            </Field>
          </div>
          <SaveButton section="system" saving={saving} saved={saved} onClick={() => handleSave('system')} />
        </div>
      )}

      {/* Not-yet-built tabs */}
      {!TABS.find((t) => t.key === tab)?.ready && (
        <div className="bg-card border border-dashed border-border rounded-xl p-10 text-center max-w-2xl">
          <p className="text-sm text-muted-foreground">
            {TABS.find((t) => t.key === tab)?.label} isn't wired up yet — this needs real backend work
            (not just a form), so it's intentionally left out until we scope it properly.
          </p>
        </div>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          height: 2.5rem;
          padding: 0 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

function SaveButton({
  section, saving, saved, onClick,
}: {
  section: 'general' | 'system'
  saving: 'general' | 'system' | null
  saved: 'general' | 'system' | null
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving === section}
      className="mt-5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60"
    >
      {saving === section ? (
        <Loader2 size={14} className="animate-spin" />
      ) : saved === section ? (
        <Check size={14} />
      ) : null}
      {saving === section ? 'Saving...' : saved === section ? 'Saved' : 'Save Changes'}
    </button>
  )
}