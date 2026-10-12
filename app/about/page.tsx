import Link from 'next/link'
import { Home, ShieldCheck, Users, Star, ArrowRight, Phone, Mail, ShieldQuestion, Lightbulb, User, Award, Heart } from 'lucide-react'

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-accent/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-2 bg-accent text-accent-foreground text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
              <Users size={14} /> Building better homes. Empowering communities.
            </span>
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
              About <span className="text-primary">EboHomes</span>
            </h1>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              EboHomes is Ebonyi State&apos;s trusted direct rental platform, connecting
              landlords and tenants without agents. We make renting simple,
              transparent, and rewarding for everyone.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-start gap-2">
                <span className="bg-accent p-2 rounded-lg text-primary shrink-0"><Home size={18} /></span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Quality Homes</p>
                  <p className="text-xs text-muted-foreground">Verified and reliable</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-accent p-2 rounded-lg text-primary shrink-0"><ShieldCheck size={18} /></span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Trust &amp; Security</p>
                  <p className="text-xs text-muted-foreground">Your safety, our priority</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-accent p-2 rounded-lg text-primary shrink-0"><Heart size={18} /></span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Community</p>
                  <p className="text-xs text-muted-foreground">Homes people are proud of</p>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <img src="/hero.jpg" alt="EboHomes property" className="w-full h-full object-cover" />
          </div>
        </div>
      </section>

      {/* Story + Impact */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid md:grid-cols-2 gap-12">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-4 border-l-4 border-primary pl-3">Our Story</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            EboHomes was born out of a simple mission: to transform the rental
            experience in Ebonyi State through technology, transparency, and
            trust — cutting out informal agents and letting landlords and
            tenants deal directly.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-6">
            We understand the challenges of finding the right property or the
            right tenant. That&apos;s why we built a platform that makes the
            process seamless for everyone involved.
          </p>
          <Link href="/contact">
            <button className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-5 py-3 rounded-xl hover:bg-primary/90 transition-colors">
              Get in Touch <ArrowRight size={16} />
            </button>
          </Link>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-4 border-l-4 border-primary pl-3">Our Impact So Far</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Home, value: '500+', label: 'Properties Listed' },
              { icon: Users, value: '2,000+', label: 'Happy Users' },
              { icon: Heart, value: '3', label: 'Cities We Operate In' },
              { icon: Star, value: '4.8/5', label: 'Customer Rating' },
            ].map((s, i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-5">
                <span className="inline-flex bg-accent text-primary p-2.5 rounded-xl mb-3"><s.icon size={20} /></span>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-muted/40 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-foreground mb-8">Our Values</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {[
              { icon: ShieldQuestion, title: 'Integrity', desc: 'We operate with honesty and transparency.' },
              { icon: Lightbulb, title: 'Innovation', desc: 'We embrace technology to build better solutions.' },
              { icon: User, title: 'Customer First', desc: 'Your needs are at the heart of what we do.' },
              { icon: Award, title: 'Excellence', desc: 'We hold ourselves to the highest standard.' },
              { icon: Users, title: 'Community', desc: 'We are committed to stronger communities.' },
            ].map((v, i) => (
              <div key={i}>
                <span className="inline-flex bg-accent text-primary p-2.5 rounded-xl mb-3"><v.icon size={18} /></span>
                <p className="font-semibold text-foreground mb-1">{v.title}</p>
                <p className="text-sm text-muted-foreground">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <p className="font-semibold text-lg">Have questions?</p>
            <p className="text-primary-foreground/80 text-sm">We're here to help you find a home or grow your listings.</p>
          </div>
          <div className="flex gap-3">
            <a href="tel:+2348001234567" className="flex items-center gap-2 border border-white/40 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors">
              <Phone size={16} /> Call Us
            </a>
            <a href="mailto:ebohomesng@gmail.com" className="flex items-center gap-2 border border-white/40 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors">
              <Mail size={16} /> Email Us
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}