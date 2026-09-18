import type { Metadata } from 'next'
import { LegalLayout, LegalSection, LegalNote } from '@/components/legal-layout'

export const metadata: Metadata = {
  title: 'Terms & Conditions | EboHomes',
  description: 'The terms that govern your use of the EboHomes platform.',
}

const TOC = [
  { id: 'about', label: '1. About EboHomes' },
  { id: 'eligibility', label: '2. Eligibility' },
  { id: 'accounts', label: '3. User Accounts' },
  { id: 'tenant-responsibilities', label: '4. Tenant Responsibilities' },
  { id: 'landlord-responsibilities', label: '5. Landlord Responsibilities' },
  { id: 'agent-responsibilities', label: '6. Agent/Company Responsibilities' },
  { id: 'listings', label: '7. Property Listings' },
  { id: 'accuracy', label: '8. Accuracy of Information' },
  { id: 'verification', label: '9. Verification \u2014 Meaning & Limits' },
  { id: 'inspections', label: '10. Inspection Services' },
  { id: 'bookings', label: '11. Bookings & Applications' },
  { id: 'payments', label: '12. Payments & Transactions' },
  { id: 'maintenance', label: '13. Maintenance & Complaints' },
  { id: 'fraud', label: '14. Scam & Fraud Reporting' },
  { id: 'prohibited', label: '15. Prohibited Activities' },
  { id: 'suspension', label: '16. Suspension & Removal' },
  { id: 'ip', label: '17. Intellectual Property' },
  { id: 'ai', label: '18. EboHomes AI' },
  { id: 'third-party', label: '19. Third-Party Services' },
  { id: 'disclaimers', label: '20. Disclaimers' },
  { id: 'liability', label: '21. Limitation of Liability' },
  { id: 'indemnification', label: '22. Indemnification' },
  { id: 'disputes', label: '23. Dispute Resolution' },
  { id: 'law', label: '24. Governing Law' },
  { id: 'changes', label: '25. Changes to These Terms' },
  { id: 'contact', label: '26. Contact Information' },
]

export default function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions" activeHref="/terms" toc={TOC}>
      <p className="text-sm text-[#171717]/80 leading-relaxed">
        These Terms &amp; Conditions (&quot;Terms&quot;) govern your access
        to and use of EboHomes. By creating an account or using the
        platform, you agree to these Terms. If you do not agree, please do
        not use EboHomes.
      </p>

      <LegalSection id="about" number="1" title="About EboHomes">
        <p>
          EboHomes is a Nigerian real-estate technology platform that
          connects tenants, landlords, agents and property companies. We
          provide tools for listing, discovering, verifying, inspecting
          and managing rental properties, along with an AI assistant that
          helps users search and communicate.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" number="2" title="Eligibility">
        <p>
          You must be at least 18 years old and able to form a binding
          contract under Nigerian law to use EboHomes. By using the
          platform, you confirm that the information you provide is
          accurate and that you meet these requirements.
        </p>
      </LegalSection>

      <LegalSection id="accounts" number="3" title="User Accounts">
        <p>
          You are responsible for maintaining the confidentiality of your
          account credentials and for all activity under your account.
          Notify us immediately if you suspect unauthorized use of your
          account.
        </p>
      </LegalSection>

      <LegalSection id="tenant-responsibilities" number="4" title="Tenant Responsibilities">
        <ul className="list-disc pl-5 space-y-2">
          <li>Provide accurate information when creating an account, booking an inspection, or submitting an application;</li>
          <li>Attend or reschedule confirmed inspections in good faith;</li>
          <li>Communicate and make any payments only through the channels EboHomes designates as official;</li>
          <li>Report suspected scams, inaccurate listings, or safety concerns promptly.</li>
        </ul>
      </LegalSection>

      <LegalSection id="landlord-responsibilities" number="5" title="Landlord Responsibilities">
        <ul className="list-disc pl-5 space-y-2">
          <li>List only properties you own or are authorized to let;</li>
          <li>Provide accurate property details, pricing and availability, and keep listings updated;</li>
          <li>Cooperate with EboHomes verification and inspection processes;</li>
          <li>Respond to tenant inquiries and maintenance reports in good faith and within a reasonable time.</li>
        </ul>
      </LegalSection>

      <LegalSection id="agent-responsibilities" number="6" title="Agent / Property Company Responsibilities">
        <p>
          Agents and property companies listing on behalf of a landlord
          must have valid authorization to do so, must not misrepresent
          their relationship to a property, and remain responsible for the
          accuracy of listings they manage on the platform.
        </p>
      </LegalSection>

      <LegalSection id="listings" number="7" title="Property Listings">
        <p>
          Listings must reflect the actual property being offered.
          EboHomes may review, edit formatting of, or remove listings that
          violate these Terms, contain misleading information, or are
          reported as fraudulent.
        </p>
      </LegalSection>

      <LegalSection id="accuracy" number="8" title="Accuracy of Property Information">
        <p>
          While EboHomes takes steps to review listings, landlords and
          agents remain primarily responsible for the accuracy of the
          information they submit, including price, location, condition
          and availability.
        </p>
      </LegalSection>

      <LegalSection id="verification" number="9" title="Meaning and Limitations of EboHomes Verification">
        <LegalNote>
          A &quot;Verified&quot; badge reflects specific checks completed
          by EboHomes as of a stated date, based on the information and
          evidence available at that time. It does not guarantee that a
          property is free of risk, that a landlord&apos;s circumstances
          have not changed since verification, or that every detail of a
          listing is accurate.
        </LegalNote>
        <p>Depending on the scope of a given check, verification may cover one or more of the following:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Confirmation of the identity of the listing landlord or agent;</li>
          <li>Review of documents submitted as evidence of ownership or authorization to let;</li>
          <li>An in-person or agent-conducted inspection confirming the property exists and matches key listing details as at the inspection date.</li>
        </ul>
        <p>
          EboHomes does not act as a guarantor, insurer, or party to any
          tenancy agreement between users, and does not guarantee the
          outcome of any tenancy.
        </p>
      </LegalSection>

      <LegalSection id="inspections" number="10" title="Inspection Services">
        <p>
          Where EboHomes or its field agents conduct inspections, findings
          are recorded as of the inspection date and reflect the
          property&apos;s condition at that time. Property conditions can
          change after an inspection is completed.
        </p>
      </LegalSection>

      <LegalSection id="bookings" number="11" title="Property Bookings and Applications">
        <p>
          Booking an inspection or submitting a rental application through
          EboHomes does not guarantee approval or availability. Landlords
          and agents retain discretion over who they choose to let a
          property to, subject to applicable law.
        </p>
      </LegalSection>

      <LegalSection id="payments" number="12" title="Payments and Transactions">
        <p>
          Where EboHomes enables in-platform payments, such payments will
          be processed through a licensed third-party payment provider [TO
          CONFIRM once selected]. Users agree to use only official
          EboHomes payment channels once available, and EboHomes is not
          responsible for payments made outside the platform.
        </p>
        <LegalNote>
          This section should be finalized once a specific payment
          provider and flow (including any escrow/collateral mechanism)
          is confirmed and legally reviewed.
        </LegalNote>
      </LegalSection>

      <LegalSection id="maintenance" number="13" title="Maintenance and Complaints">
        <p>
          Tenants may submit maintenance requests or complaints through
          the platform. EboHomes facilitates communication of these
          reports to the relevant landlord or agent but is not responsible
          for carrying out repairs unless separately agreed.
        </p>
      </LegalSection>

      <LegalSection id="fraud" number="14" title="Scam and Fraud Reporting">
        <p>
          Users can report suspected scams or fraudulent listings through
          the platform. EboHomes investigates reports and may suspend
          accounts or listings pending review, but cannot guarantee
          recovery of funds lost outside official EboHomes payment
          channels.
        </p>
      </LegalSection>

      <LegalSection id="prohibited" number="15" title="Prohibited Activities">
        <p>Users must not:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>List a property they do not own or have authority to let;</li>
          <li>Provide false, misleading, or impersonated information;</li>
          <li>Circumvent EboHomes to avoid verification, fees, or platform safeguards;</li>
          <li>Use the platform to harass, defraud, or discriminate unlawfully against another user;</li>
          <li>Interfere with the operation or security of the platform, including the AI assistant.</li>
        </ul>
      </LegalSection>

      <LegalSection id="suspension" number="16" title="Account and Listing Suspension or Removal">
        <p>
          EboHomes may suspend or remove an account or listing that
          violates these Terms, is reported as fraudulent, or poses a risk
          to other users, with or without prior notice depending on the
          severity of the issue.
        </p>
      </LegalSection>

      <LegalSection id="ip" number="17" title="Intellectual Property">
        <p>
          The EboHomes name, logo, platform design and underlying
          technology are the property of EboHomes. Users retain ownership
          of content they submit (such as property photos) but grant
          EboHomes a license to display it on the platform for the purpose
          of operating the service.
        </p>
      </LegalSection>

      <LegalSection id="ai" number="18" title="EboHomes AI">
        <p>
          The EboHomes AI assistant provides search results, location
          insights, and management support based on available data. Its
          outputs are provided as a convenience and do not constitute
          professional, legal, or financial advice, and should be verified
          independently for important decisions.
        </p>
      </LegalSection>

      <LegalSection id="third-party" number="19" title="Third-Party Services">
        <p>
          EboHomes may integrate with third-party services, including
          WhatsApp. Your use of such third-party services is subject to
          their own terms and policies.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" number="20" title="Disclaimers">
        <p>
          EboHomes is provided on an &quot;as is&quot; and &quot;as
          available&quot; basis. We do not guarantee that every listing is
          accurate, that every property is free of defects, or that the
          platform will be uninterrupted or error-free.
        </p>
      </LegalSection>

      <LegalSection id="liability" number="21" title="Limitation of Liability">
        <p>
          To the maximum extent permitted by Nigerian law, EboHomes shall
          not be liable for indirect, incidental, or consequential losses
          arising from your use of the platform, including losses arising
          from a tenancy agreement between users. [TO CONFIRM &mdash; final
          liability cap and carve-outs should be set with legal counsel.]
        </p>
      </LegalSection>

      <LegalSection id="indemnification" number="22" title="Indemnification">
        <p>
          You agree to indemnify EboHomes against claims, losses, or
          damages arising from your breach of these Terms or misuse of the
          platform.
        </p>
      </LegalSection>

      <LegalSection id="disputes" number="23" title="Dispute Resolution">
        <p>
          We encourage users to first raise disputes through EboHomes
          support. Where a dispute cannot be resolved informally, it will
          be resolved in accordance with [TO CONFIRM &mdash; arbitration or
          court jurisdiction, to be set with legal counsel].
        </p>
      </LegalSection>

      <LegalSection id="law" number="24" title="Governing Law">
        <p>These Terms are governed by the laws of the Federal Republic of Nigeria.</p>
      </LegalSection>

      <LegalSection id="changes" number="25" title="Changes to These Terms">
        <p>
          We may update these Terms from time to time. Continued use of
          EboHomes after changes take effect constitutes acceptance of the
          revised Terms.
        </p>
      </LegalSection>

      <LegalSection id="contact" number="26" title="Contact Information">
        <p>
          Questions about these Terms can be sent via WhatsApp at{' '}
          <a href="https://wa.me/2349048569619" className="text-[#0A2E1A] underline underline-offset-2">
            +234 904 856 9619
          </a>{' '}
          or through our <a href="/contact" className="text-[#0A2E1A] underline underline-offset-2">Contact page</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}