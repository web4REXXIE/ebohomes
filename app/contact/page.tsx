'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MessageCircle, Phone, Mail, MapPin, Clock, ShieldAlert, ChevronDown, Send, ShieldCheck, Lock, Users, Headphones, Home } from 'lucide-react'

const faqs = [
  { q: 'How do I contact a landlord?', a: 'Once you find a property you like, open the listing and send your enquiry through EboHomes. Our team handles all communication between tenants and landlords, so you never have to chase anyone directly.' },
  { q: 'How do I list my property?', a: 'Sign up as a landlord, click "List Your Property," and follow the guided form — photos, price, location, and proof of ownership.' },
  { q: 'Is EboHomes free to use?', a: 'Browsing and searching is free for tenants. Landlords pay a small listing fee to publish and manage properties.' },
  { q: 'How long does verification take?', a: 'Landlord document verification typically takes 24–48 hours once all documents are submitted.' },
  { q: 'What if I see a scam listing?', a: 'Use the "Report a Scam Listing" button below or on any listing page — our team reviews reports within 24 hours.' },
  { q: 'How do payments work?', a: 'For now, payments are made directly via bank transfer with confirmation handled by our team. Card payments are coming soon.' },
]

export default function ContactPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' })
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError('')
    const { error: insertError } = await supabase.from('contact_messages').insert({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() === '' ? null : form.phone.trim(),
      subject: form.subject === '' ? null : form.subject,
      message: form.message.trim(),
    })
    setSending(false)
    if (insertError) {
      setError('Sorry, your message could not be sent. Please try again or message us on WhatsApp.')
      return
    }
    setSent(true)
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-accent/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="text-xs font-semibold text-primary tracking-wide">CONTACT &amp; SUPPORT</span>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mt-2 mb-3">
              Need Help Finding <br className="hidden sm:block" />
              or Listing a <span className="text-primary">Home?</span>
            </h1>
            <p className="text-muted-foreground">
              Our team is here to help you every step of the way. Reach out anytime.
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden shadow-lg h-56 md:h-64">
            <img src="/hero.jpg" alt="EboHomes support team" className="w-full h-full object-cover" />
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid lg:grid-cols-3 gap-8">

        {/* Contact form */}
        <div className="lg:col-span-1 bg-card border border-border rounded-2xl p-6">
          <h2 className="font-semibold text-lg text-foreground mb-5">Send us a message</h2>
          {sent ? (
            <div className="text-center py-10">
              <p className="text-primary font-semibold mb-1">Message sent!</p>
              <p className="text-sm text-muted-foreground">We&apos;ll get back to you within 15 minutes during business hours.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter your full name"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Email Address</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Enter your email"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Phone Number</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+234 801 234 5678"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Subject</label>
                <select
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a subject</option>
                  <option value="tenant">I&apos;m looking for a home</option>
                  <option value="landlord">I want to list a property</option>
                  <option value="scam">Report a scam listing</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Message</label>
                <textarea
                  required
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Type your message here..."
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {sending ? 'Sending...' : 'Send Message'} <Send size={16} />
              </button>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center">
                <Lock size={12} /> Your information is safe with us. We never share your data.
              </p>
            </form>
          )}
        </div>

        {/* Other ways to reach us */}
        <div className="lg:col-span-1">
          <h2 className="font-semibold text-lg text-foreground mb-5">Other ways to reach us</h2>
          <div className="grid grid-cols-2 gap-4">
            <a href="https://wa.me/2348012345678" target="_blank" rel="noopener noreferrer" className="bg-card border border-border rounded-2xl p-4 hover:border-primary transition-colors">
              <span className="inline-flex bg-accent text-primary p-2 rounded-lg mb-2"><MessageCircle size={18} /></span>
              <p className="font-medium text-sm text-foreground">WhatsApp Support</p>
              <p className="text-xs text-muted-foreground mb-1">Chat with us instantly</p>
              <span className="text-xs text-primary font-medium">Chat now →</span>
            </a>
            <a href="tel:+2348012345678" className="bg-card border border-border rounded-2xl p-4 hover:border-primary transition-colors">
              <span className="inline-flex bg-accent text-primary p-2 rounded-lg mb-2"><Phone size={18} /></span>
              <p className="font-medium text-sm text-foreground">Call Support</p>
              <p className="text-xs text-muted-foreground mb-1">Speak with our team</p>
              <span className="text-xs text-primary font-medium">+234 801 234 5678</span>
            </a>
            <a href="mailto:support@ebohomes.com" className="bg-card border border-border rounded-2xl p-4 hover:border-primary transition-colors">
              <span className="inline-flex bg-accent text-primary p-2 rounded-lg mb-2"><Mail size={18} /></span>
              <p className="font-medium text-sm text-foreground">Email Support</p>
              <p className="text-xs text-muted-foreground mb-1">We&apos;ll get back to you</p>
              <span className="text-xs text-primary font-medium">support@ebohomes.com</span>
            </a>
            <div className="bg-card border border-border rounded-2xl p-4">
              <span className="inline-flex bg-accent text-primary p-2 rounded-lg mb-2"><Headphones size={18} /></span>
              <p className="font-medium text-sm text-foreground">Live Chat</p>
              <p className="text-xs text-muted-foreground mb-1">Chat with our team</p>
              <span className="text-xs text-primary font-medium">Coming soon</span>
            </div>
          </div>

          <div className="mt-5 bg-accent/40 border border-border rounded-2xl p-4 flex items-center gap-3">
            <Clock size={18} className="text-primary shrink-0" />
            <p className="text-sm text-foreground">We reply within 15 minutes during business hours.</p>
          </div>
        </div>

        {/* Office + scam report */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <MapPin size={16} className="text-primary" /> Our Office
            </h3>
            <div className="h-32 bg-muted rounded-xl mb-3" />
            <p className="text-sm font-medium text-foreground">EboHomes Headquarters</p>
            <p className="text-sm text-muted-foreground mb-3">Abakaliki, Ebonyi State, Nigeria</p>
            <div className="border-t border-border pt-3 text-sm space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Monday – Friday</span><span className="text-foreground">8AM – 6PM</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Saturday</span><span className="text-foreground">9AM – 3PM</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Sunday</span><span className="text-destructive">Closed</span>
              </div>
            </div>
          </div>

          <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5">
            <h3 className="font-semibold text-destructive mb-1.5 flex items-center gap-2">
              <ShieldAlert size={16} /> Report a Scam Listing
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Found a suspicious listing or fake agent? Help us keep EboHomes safe.
            </p>
            <a href="/report-listing" className="text-sm font-semibold text-destructive">Report Now →</a>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h2 className="text-2xl font-bold text-foreground mb-6">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <span className="font-medium text-sm text-foreground">{f.q}</span>
                <ChevronDown size={18} className={`text-muted-foreground transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && (
                <p className="px-5 pb-4 text-sm text-muted-foreground">{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Trust badges */}
      <section className="bg-muted/40 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: Home, title: 'Verified Listings', desc: 'Every property is checked' },
            { icon: ShieldCheck, title: 'Secure Platform', desc: 'Your data is protected' },
            { icon: Users, title: 'Trusted Community', desc: 'Thousands of happy users' },
            { icon: Headphones, title: '24/7 Support', desc: "We're always here to help" },
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="bg-accent text-primary p-2.5 rounded-xl shrink-0"><b.icon size={20} /></span>
              <div>
                <p className="text-sm font-semibold text-foreground">{b.title}</p>
                <p className="text-xs text-muted-foreground">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}