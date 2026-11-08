'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { EBOHOMES_WHATSAPP, EBOHOMES_EMAIL, EBOHOMES_PHONE_DISPLAY } from '@/lib/contact'
import { MessageCircle, Phone, Mail, MapPin, Clock, ShieldAlert, ChevronDown, Send, ShieldCheck, Headphones, Home, ClipboardCheck } from 'lucide-react'

const faqs = [
  { q: 'How do I contact a landlord?', a: 'EboHomes handles communication for you. Open the listing and tap "Chat with EboHomes". Once your interest is approved and an inspection is arranged, we coordinate the next steps with the landlord..' },
  { q: 'How do I list my property?', a: 'Sign up as a landlord, click "List Your Property," and follow the guided form — photos, price, location, and proof of ownership.' },
  { q: 'Is EboHomes free to use?', a: 'Browsing and searching is free for tenants. Landlords can submit properties for review. Featured placement is an optional paid upgrade, and the price is shown before you pay.' },
  { q: 'How long does verification take?', a: 'We review documents as quickly as we can. You can see your status in your dashboard.' },
  { q: 'What if I see a scam listing?', a: 'Use the "Report a Scam Listing" button below or on any listing page — our team reviews reports within 24 hours.' },
  { q: 'How do payments work?', a: 'Pay only to the official EboHomes payment details shown on your tenancy page after you sign in. EboHomes checks each payment before it counts. We cannot protect payments made anywhere else, so if you are unsure, message our team on WhatsApp first.' },
]

const fieldCls =
  'w-full min-h-12 border border-border rounded-control px-4 py-2.5 text-base bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30'
const labelCls = 'text-label font-semibold text-foreground mb-1.5 block'

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
            <h1 className="text-h1 sm:text-display font-bold text-foreground mt-2 mb-3">
              Need Help Finding <br className="hidden sm:block" />
              or Listing a <span className="text-primary">Home?</span>
            </h1>
            <p className="text-muted-foreground">
              Our team is here to help you every step of the way. Reach out anytime.
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden shadow-lg h-56 md:h-64">
            <img src="/hero.jpg" alt="" className="w-full h-full object-cover" />
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid lg:grid-cols-3 gap-8">

        {/* Contact form */}
        <div className="lg:col-span-1 bg-card border border-border rounded-card shadow-rest p-5 sm:p-6">
          <h2 className="text-h3 font-semibold text-foreground mb-5">Send us a message</h2>
          {sent ? (
            <div role="status" className="text-center py-10">
              <p className="text-primary font-semibold mb-1">Message sent!</p>
              <p className="text-body text-muted-foreground">We&apos;ll get back to you within 15 minutes during business hours.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="contact-name" className={labelCls}>Full Name</label>
                <input
                  id="contact-name"
                  autoComplete="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter your full name"
                  className={fieldCls}
                />
              </div>
              <div>
                <label htmlFor="contact-email" className={labelCls}>Email Address</label>
                <input
                  id="contact-email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Enter your email"
                  className={fieldCls}
                />
              </div>
              <div>
                <label htmlFor="contact-phone" className={labelCls}>Phone Number</label>
                <input
                  id="contact-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+234 801 234 5678"
                  className={fieldCls}
                />
              </div>
              <div>
                <label htmlFor="contact-subject" className={labelCls}>Subject</label>
                <select
                  id="contact-subject"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className={fieldCls}
                >
                  <option value="">Select a subject</option>
                  <option value="tenant">I&apos;m looking for a home</option>
                  <option value="landlord">I want to list a property</option>
                  <option value="scam">Report a scam listing</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="contact-message" className={labelCls}>Message</label>
                <textarea
                  id="contact-message"
                  required
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Type your message here..."
                  className={`${fieldCls} resize-none`}
                />
              </div>
              {error && <p role="alert" className="text-body text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={sending}
                className="w-full min-h-12 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3 rounded-button hover:bg-primary/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
              >
                {sending ? 'Sending...' : 'Send Message'} <Send size={16} />
              </button>
              <p className="text-caption text-muted-foreground text-center">
                See how we use your details in our{' '}
                <Link href="/privacy" className="font-semibold text-primary underline underline-offset-2">Privacy Policy</Link>.
              </p>
            </form>
          )}
        </div>

        {/* Other ways to reach us */}
        <div className="lg:col-span-1">
          <h2 className="text-h3 font-semibold text-foreground mb-5">Other ways to reach us</h2>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
            <a href={`https://wa.me/${EBOHOMES_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="bg-card border border-border rounded-card shadow-rest p-4 hover:border-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span className="inline-flex bg-accent text-primary p-2 rounded-lg mb-2"><MessageCircle size={18} /></span>
              <p className="font-semibold text-body text-foreground">WhatsApp Support</p>
              <p className="text-caption text-muted-foreground mb-1">Chat with us instantly</p>
              <span className="text-caption text-primary font-semibold break-all">Chat now →</span>
            </a>
            <a href={`tel:+${EBOHOMES_WHATSAPP}`} className="bg-card border border-border rounded-card shadow-rest p-4 hover:border-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span className="inline-flex bg-accent text-primary p-2 rounded-lg mb-2"><Phone size={18} /></span>
              <p className="font-semibold text-body text-foreground">Call Support</p>
              <p className="text-caption text-muted-foreground mb-1">Speak with our team</p>
              <span className="text-caption text-primary font-semibold break-all">{EBOHOMES_PHONE_DISPLAY}</span>
            </a>
            <a href={`mailto:${EBOHOMES_EMAIL}`} className="bg-card border border-border rounded-card shadow-rest p-4 hover:border-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span className="inline-flex bg-accent text-primary p-2 rounded-lg mb-2"><Mail size={18} /></span>
              <p className="font-semibold text-body text-foreground">Email Support</p>
              <p className="text-caption text-muted-foreground mb-1">We&apos;ll get back to you</p>
              <span className="text-caption text-primary font-semibold break-all">{EBOHOMES_EMAIL}</span>
            </a>
            <div className="bg-card border border-border rounded-card shadow-rest p-4">
              <span className="inline-flex bg-accent text-primary p-2 rounded-lg mb-2"><Headphones size={18} /></span>
              <p className="font-semibold text-body text-foreground">Live Chat</p>
              <p className="text-caption text-muted-foreground mb-1">Chat with our team</p>
              <span className="text-caption text-primary font-semibold break-all">Coming soon</span>
            </div>
          </div>

          <div className="mt-5 bg-accent/40 border border-border rounded-2xl p-4 flex items-center gap-3">
            <Clock size={18} className="text-primary shrink-0" />
            <p className="text-body text-foreground">We reply within 15 minutes during business hours.</p>
          </div>

          <p className="mt-4 text-body text-muted-foreground">
            Follow EboHomes on{' '}
            <a href="https://www.tiktok.com/@ebohomes7" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-2">
              TikTok
            </a>
            .
          </p>
        </div>

        {/* Office + scam report */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card border border-border rounded-card shadow-rest p-5">
            <h2 className="text-h3 font-semibold text-foreground mb-3 flex items-center gap-2">
              <MapPin size={16} className="text-primary" aria-hidden /> Our Office
            </h2>
            <p className="text-body font-semibold text-foreground">EboHomes Headquarters</p>
            <p className="text-body text-muted-foreground mb-3">Abakaliki, Ebonyi State, Nigeria</p>
            <div className="border-t border-border pt-3 text-body space-y-1">
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

          <div className="bg-destructive/5 border border-destructive/20 rounded-card p-5">
            <h2 className="text-h3 font-semibold text-destructive mb-1.5 flex items-center gap-2">
              <ShieldAlert size={16} aria-hidden /> Report a Scam Listing
            </h2>
            <p className="text-body text-muted-foreground mb-3">
              Found a suspicious listing or fake agent? Help us keep EboHomes safe.
            </p>
            <Link href="/report-listing" className="inline-flex min-h-11 items-center text-body font-semibold text-destructive underline underline-offset-2">Report now →</Link>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h2 className="text-h2 font-bold text-foreground mb-6">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="bg-card border border-border rounded-card shadow-rest overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
                aria-controls={`faq-${i}`}
                className="w-full min-h-12 flex items-center justify-between gap-3 px-5 py-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              >
                <span className="font-semibold text-body text-foreground">{f.q}</span>
                <ChevronDown aria-hidden size={18} className={`text-muted-foreground transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && (
                <p id={`faq-${i}`} className="px-5 pb-4 text-body text-muted-foreground">{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* What you can rely on */}
      <section className="bg-muted/40 py-10">
        <ul className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { icon: Home, title: 'Reviewed listings', desc: 'A property goes live after EboHomes has reviewed it.' },
            { icon: ClipboardCheck, title: 'Checks are shown', desc: 'Each property page says what has and has not been checked.' },
            { icon: ShieldCheck, title: 'Report a problem', desc: 'Use the scam report on this page or on any listing.' },
          ].map((b, i) => (
            <li key={i} className="flex items-start gap-3">
              <span aria-hidden className="bg-accent text-primary p-2.5 rounded-xl shrink-0"><b.icon size={20} /></span>
              <div>
                <p className="text-body font-semibold text-foreground">{b.title}</p>
                <p className="text-body text-muted-foreground">{b.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
