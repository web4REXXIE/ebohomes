import type { Metadata } from 'next'
import { LegalLayout, LegalSection } from '@/components/legal-layout'

export const metadata: Metadata = {
  title: 'Cookie Policy | EboHomes',
  description: 'How EboHomes uses cookies and similar technologies.',
}

const TOC = [
  { id: 'what-are-cookies', label: '1. What Are Cookies' },
  { id: 'types', label: '2. Types of Cookies We Use' },
  { id: 'why', label: '3. Why We Use Cookies' },
  { id: 'third-party', label: '4. Third-Party Cookies' },
  { id: 'managing', label: '5. Managing Your Preferences' },
  { id: 'changes', label: '6. Changes to This Policy' },
  { id: 'contact', label: '7. Contact Us' },
]

export default function CookiePolicyPage() {
  return (
    <LegalLayout title="Cookie Policy" activeHref="/cookies" toc={TOC}>
      <p className="text-sm text-[#171717]/80 leading-relaxed">
        This Cookie Policy explains how EboHomes uses cookies and similar
        technologies when you visit our website or use our platform.
      </p>

      <LegalSection id="what-are-cookies" number="1" title="What Are Cookies">
        <p>
          Cookies are small text files placed on your device that help a
          website function properly and remember information about your
          visit.
        </p>
      </LegalSection>

      <LegalSection id="types" number="2" title="Types of Cookies We Use">
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Essential cookies</strong> &mdash; required for core functionality such as logging in and keeping you signed in.</li>
          <li><strong>Functional cookies</strong> &mdash; remember preferences such as dark mode or saved searches.</li>
          <li><strong>Analytics cookies</strong> &mdash; help us understand how the platform is used so we can improve it.</li>
        </ul>
      </LegalSection>

      <LegalSection id="why" number="3" title="Why We Use Cookies">
        <p>
          We use cookies to keep you signed in, remember your preferences,
          understand how EboHomes is used, and help keep the platform
          secure.
        </p>
      </LegalSection>

      <LegalSection id="third-party" number="4" title="Third-Party Cookies">
        <p>
          Some cookies may be set by third-party analytics providers we
          use to understand platform usage. [TO CONFIRM &mdash; name the
          specific analytics provider once finalized, e.g. Vercel
          Analytics.]
        </p>
      </LegalSection>

      <LegalSection id="managing" number="5" title="Managing Your Cookie Preferences">
        <p>
          You can control or delete cookies through your browser settings.
          Disabling essential cookies may affect your ability to log in or
          use certain features of EboHomes.
        </p>
      </LegalSection>

      <LegalSection id="changes" number="6" title="Changes to This Policy">
        <p>
          We may update this Cookie Policy from time to time. The
          &quot;Last updated&quot; date at the top of this page reflects
          the most recent revision.
        </p>
      </LegalSection>

      <LegalSection id="contact" number="7" title="Contact Us">
        <p>
          Questions about this Cookie Policy can be sent via WhatsApp at{' '}
          <a href="https://wa.me/2349048569619" className="text-[#0A2E1A] underline underline-offset-2">
            +234 904 856 9619
          </a>.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}