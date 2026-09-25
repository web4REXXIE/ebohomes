'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Clock, XCircle, FileText, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function GetVerifiedPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)

  const [docUploading, setDocUploading] = useState(false)
  const [docName, setDocName] = useState('')
  const [docPreviewUrl, setDocPreviewUrl] = useState('')

  const [formData, setFormData] = useState({
    business_name: '',
    business_address: '',
    cac_number: '',
    bank_name: '',
    bank_account_name: '',
    bank_account_number: '',
    ownership_doc_url: '', // now stores a storage PATH, not a public URL
  })

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setMessage('You must be logged in.')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('business_name, business_address, cac_number, bank_name, bank_account_name, bank_account_number, ownership_doc_url, verification_status, verified, rejection_reason')
        .eq('id', user.id)
        .single()

      if (!error && data) {
        setFormData({
          business_name: data.business_name || '',
          business_address: data.business_address || '',
          cac_number: data.cac_number || '',
          bank_name: data.bank_name || '',
          bank_account_name: data.bank_account_name || '',
          bank_account_number: data.bank_account_number || '',
          ownership_doc_url: data.ownership_doc_url || '',
        })
        setStatus(data.verified ? 'verified' : (data.verification_status || null))
        setRejectionReason(data.rejection_reason || null)

        // if a doc path already exists, generate a signed preview link
        if (data.ownership_doc_url) {
          const { data: signed } = await supabase.storage
            .from('ownership-docs')
            .createSignedUrl(data.ownership_doc_url, 60 * 5) // valid 5 minutes
          if (signed?.signedUrl) setDocPreviewUrl(signed.signedUrl)
        }
      }
      setLoading(false)
    }
    loadProfile()
  }, [])

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocUploading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setDocUploading(false)
      return
    }

    const filePath = `${user.id}/verification-${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('ownership-docs')
      .upload(filePath, file)

    if (uploadError) {
      alert('Failed to upload document: ' + uploadError.message)
      setDocUploading(false)
      return
    }

    // store the PATH (not a public URL) — this is what gets saved to the database
    setFormData((p) => ({ ...p, ownership_doc_url: filePath }))
    setDocName(file.name)

    // generate a signed URL just for immediate on-screen preview
    const { data: signed } = await supabase.storage
      .from('ownership-docs')
      .createSignedUrl(filePath, 60 * 5)
    if (signed?.signedUrl) setDocPreviewUrl(signed.signedUrl)

    setDocUploading(false)
  }

  const removeDoc = () => {
    setFormData((p) => ({ ...p, ownership_doc_url: '' }))
    setDocName('')
    setDocPreviewUrl('')
  }

  const canSubmit =
    formData.business_name &&
    formData.business_address &&
    formData.bank_name &&
    formData.bank_account_name &&
    formData.bank_account_number &&
    formData.ownership_doc_url

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setMessage('You must be logged in.')
      setSubmitting(false)
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        business_name: formData.business_name,
        business_address: formData.business_address,
        cac_number: formData.cac_number || null,
        bank_name: formData.bank_name,
        bank_account_name: formData.bank_account_name,
        bank_account_number: formData.bank_account_number,
        ownership_doc_url: formData.ownership_doc_url, // storage path now
        verification_status: 'pending',
      })
      .eq('id', user.id)

    setSubmitting(false)

    if (error) {
      setMessage('Failed to submit: ' + error.message)
      return
    }

    setStatus('pending')
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-10 text-center text-muted-foreground">Loading...</div>
  }

  if (status === 'verified') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-card border border-emerald-200 rounded-2xl p-8 text-center">
          <ShieldCheck size={40} className="mx-auto text-emerald-600 mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-1">You're Verified</h1>
          <p className="text-sm text-muted-foreground">Your landlord account has been verified on EboHomes.</p>
        </div>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-card border border-amber-200 rounded-2xl p-8 text-center">
          <Clock size={40} className="mx-auto text-amber-600 mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-1">Verification Pending</h1>
          <p className="text-sm text-muted-foreground">We've received your details. Our team will review them shortly.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">Get Verified</h1>
        <p className="text-sm text-muted-foreground">
          Verified landlords get a trust badge and more tenant enquiries. Provide accurate details — this is reviewed by our team.
        </p>
      </div>

      {status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">
            <p className="font-semibold mb-1">Your previous submission was not approved.</p>
            {rejectionReason ? (
              <p><span className="font-semibold">Reason:</span> {rejectionReason}</p>
            ) : (
              <p>Please review your details and resubmit.</p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Business Name *</label>
          <input
            required
            value={formData.business_name}
            onChange={(e) => setFormData((p) => ({ ...p, business_name: e.target.value }))}
            placeholder="e.g. Onyeka Properties Ltd"
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Business Address *</label>
          <input
            required
            value={formData.business_address}
            onChange={(e) => setFormData((p) => ({ ...p, business_address: e.target.value }))}
            placeholder="e.g. 12 Ogoja Road, Abakaliki"
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">CAC Number (optional)</label>
          <input
            value={formData.cac_number}
            onChange={(e) => setFormData((p) => ({ ...p, cac_number: e.target.value }))}
            placeholder="e.g. RC1234567"
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-semibold text-foreground mb-3">Bank Details *</p>
          <div className="space-y-3">
            <input
              required
              value={formData.bank_name}
              onChange={(e) => setFormData((p) => ({ ...p, bank_name: e.target.value }))}
              placeholder="Bank name"
              className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              required
              value={formData.bank_account_name}
              onChange={(e) => setFormData((p) => ({ ...p, bank_account_name: e.target.value }))}
              placeholder="Account name"
              className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              required
              value={formData.bank_account_number}
              onChange={(e) => setFormData((p) => ({ ...p, bank_account_number: e.target.value }))}
              placeholder="Account number"
              className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <label className="block text-sm font-semibold text-foreground mb-2">Verification Document *</label>
          <p className="text-xs text-muted-foreground mb-3">
            Upload a valid ID, CAC certificate, or business registration document.
          </p>
          {formData.ownership_doc_url ? (
            <div className="flex items-center justify-between border-2 border-border rounded-lg p-3 bg-secondary">
              <a href={docPreviewUrl || '#'} target="_blank" rel="noreferrer" className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                <Check size={14} className="text-primary" /> {docName || 'Document uploaded'}
              </a>
              <button type="button" onClick={removeDoc} className="text-destructive text-sm font-semibold px-2">
                Remove
              </button>
            </div>
          ) : (
            <label className="block border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-secondary transition-colors text-sm">
              {docUploading ? (
                <span className="text-primary">Uploading document...</span>
              ) : (
                <span className="font-semibold text-foreground flex items-center justify-center gap-2">
                  <FileText size={16} /> Click to upload document
                </span>
              )}
              <input type="file" accept="image/*,application/pdf" onChange={handleDocUpload} className="hidden" />
            </label>
          )}
        </div>

        {message && <p className="text-sm text-destructive">{message}</p>}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting...' : 'Submit for Verification'}
        </button>
      </form>
    </div>
  )
}