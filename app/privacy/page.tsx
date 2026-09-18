import type { Metadata } from 'next'
import { LegalLayout, LegalSection, LegalNote } from '@/components/legal-layout'

export const metadata: Metadata = {
  title: 'Privacy Policy | EboHomes',
  description: 'How EboHomes collects, uses, and protects your information.',
}

const TOC = [
  { id: 'information-we-collect', label: '1. Information We Collect' },
  { id: 'how-we-collect', label: '2. How Information Is Collected' },
  { id: 'how-we-use', label: '3. How We Use Information' },
  { id: 'ai-processing', label: '4. EboHomes AI & Automated Processing' },
  { id: 'sharing', label: '5. Information Sharing' },
  { id: 'security', label: '6. Data Security' },
  { id: 'retention', label: '7. Data Retention' },
  { id: 'rights', label: '8. Your Rights' },
  { id: 'breach', label: '9. Data Breach Procedures' },
  { id: 'third-party-links', label: '10. Third-Party Links' },
  { id: 'transfers', label: '11. International Transfers' },
  { id: 'minors', label: '12. Children\u2019s Data' },
  { id: 'changes', label: '13. Changes to This Policy' },
  { id: 'contact', label: '14. Contact & Data Requests' },
]

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" activeHref="/privacy" toc={TOC}>
      <p className="text-sm text-[#171717]/80 leading-relaxed">
        EboHomes (&quot;EboHomes&quot;, &quot;we&quot;, &quot;us&quot;) operates a real-estate technology
        platform connecting tenants, landlords, agents and property
        companies in Nigeria. This Privacy Policy explains what information
        we collect, why we collect it, and how it is used, shared and
        protected. It applies to our website, mobile experience, and
        associated communication channels, including WhatsApp.
      </p>

      <LegalSection id="information-we-collect" number="1" title="Information We Collect">
        <p>We collect the following categories of information depending on how you use EboHomes:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Account and profile information</strong> &mdash; name, email address, phone number, password, role (tenant, landlord, agent) and profile photo.</li>
          <li><strong>Property and listing information</strong> &mdash; property details, photos, pricing, location, and availability submitted by landlords, agents or property companies.</li>
          <li><strong>Identity and verification information</strong> &mdash; information used to confirm the identity of landlords, agents and, where required, tenants.</li>
          <li><strong>Documents submitted for verification</strong> &mdash; identity documents, ownership or authorization documents, or other evidence submitted to support a verification check.</li>
          <li><strong>Inspection information</strong> &mdash; notes, photos, and outcomes recorded during property inspections carried out by EboHomes or its agents.</li>
          <li><strong>Location information</strong> &mdash; property addresses and, where you permit it, your device location, used to show nearby listings and location-based insights.</li>
          <li><strong>Messages and communications</strong> &mdash; messages exchanged through EboHomes (including WhatsApp-linked conversations) between users, and with our support or AI assistant.</li>
          <li><strong>Bookings and applications</strong> &mdash; inspection bookings, rental applications, and related status information.</li>
          <li><strong>Payment/transaction information</strong> &mdash; where in-platform payments are enabled, transaction records and payment status. <span className="italic">EboHomes does not store full card or bank account numbers; these are handled by a licensed payment processor.</span> [TO CONFIRM once a payment provider is selected]</li>
          <li><strong>Maintenance requests and reports</strong> &mdash; issues, complaints, and correspondence submitted by tenants regarding a property.</li>
          <li><strong>Device, IP, cookies and analytics information</strong> &mdash; device type, browser, IP address, approximate location, and usage data collected through cookies and analytics tools. See our <a href="/cookies" className="text-[#0A2E1A] underline underline-offset-2">Cookie Policy</a> for details.</li>
        </ul>
      </LegalSection>

      <LegalSection id="how-we-collect" number="2" title="How Information Is Collected">
        <p>We collect information when you:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Create an account or complete your profile;</li>
          <li>List, search for, save, or apply for a property;</li>
          <li>Submit documents for verification or request an inspection;</li>
          <li>Communicate with other users, our support team, or the EboHomes AI assistant, including via WhatsApp;</li>
          <li>Make or receive a payment through the platform, where applicable;</li>
          <li>Browse the website or app, through cookies and similar technologies.</li>
        </ul>
        <p>We may also receive limited information from field agents who conduct verification or inspection visits on our behalf.</p>
      </LegalSection>

      <LegalSection id="how-we-use" number="3" title="How EboHomes Uses Information">
        <p>We use the information we collect to:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Create and manage user accounts and match tenants, landlords and agents;</li>
          <li>Display, search and recommend property listings;</li>
          <li>Carry out verification checks and inspections, and record their outcome;</li>
          <li>Facilitate communication, bookings, applications and, where enabled, payments;</li>
          <li>Provide customer support and respond to maintenance reports or complaints;</li>
          <li>Detect, investigate and prevent fraud, scams and misuse of the platform;</li>
          <li>Improve and personalize the EboHomes AI assistant and other platform features;</li>
          <li>Comply with legal obligations and enforce our Terms &amp; Conditions.</li>
        </ul>
      </LegalSection>

      <LegalSection id="ai-processing" number="4" title="EboHomes AI and Automated Processing">
        <p>
          EboHomes uses an AI-powered assistant to help users search for
          properties, understand location and environment information, and
          (for landlords, agents and property companies) manage their
          listings and tenant communications. The AI assistant processes
          the messages and property data you provide to generate responses,
          summaries, and recommendations.
        </p>
        <p>
          Automated outputs from the AI assistant &mdash; such as location
          insights, price guidance, or flagged maintenance issues &mdash;
          are provided to assist your decision-making and do not replace
          independent verification. Significant account or listing
          decisions (such as suspension) are not made solely by automated
          means without human review.
        </p>
      </LegalSection>

      <LegalSection id="sharing" number="5" title="Information Sharing and Third-Party Service Providers">
        <p>We may share information with:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Other users, to the extent necessary to facilitate a booking, inspection, application or tenancy (for example, sharing a tenant&apos;s contact details with a landlord after an inspection is confirmed);</li>
          <li>Service providers who support our operations, such as hosting, messaging (including WhatsApp Business), analytics, and, where applicable, payment processing providers [TO CONFIRM once selected];</li>
          <li>Field agents engaged by EboHomes to carry out verification or inspection visits;</li>
          <li>Regulators, law enforcement, or government bodies where required by law, or as part of any future regulatory data-sharing arrangement [TO CONFIRM];</li>
          <li>A successor entity in the event of a merger, acquisition, or sale of assets, subject to this Policy continuing to apply.</li>
        </ul>
        <p>We do not sell personal information to third parties.</p>
      </LegalSection>

      <LegalSection id="security" number="6" title="Data Security">
        <p>
          We apply reasonable technical and organizational measures &mdash;
          including access controls, encryption in transit, and restricted
          internal access &mdash; to protect information against
          unauthorized access, loss, or misuse. No system is completely
          secure, and we cannot guarantee absolute security.
        </p>
        <LegalNote>
          Specific certifications or third-party security audits: [TO CONFIRM] &mdash; only state these once actually obtained.
        </LegalNote>
      </LegalSection>

      <LegalSection id="retention" number="7" title="Data Retention">
        <p>
          We retain information for as long as necessary to provide our
          services, comply with legal obligations, resolve disputes, and
          enforce our agreements. Verification documents and inspection
          records may be retained for a longer period to support future
          trust and safety checks. Specific retention periods per data
          category: [TO CONFIRM].
        </p>
      </LegalSection>

      <LegalSection id="rights" number="8" title="Your Data Protection Rights">
        <p>Under the Nigeria Data Protection Act 2023 (NDPA), you have the right to:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Access the personal data we hold about you;</li>
          <li>Request correction of inaccurate or incomplete data;</li>
          <li>Request deletion of your data, subject to legal or contractual retention requirements;</li>
          <li>Object to or restrict certain processing;</li>
          <li>Withdraw consent where processing is based on consent;</li>
          <li>Lodge a complaint with the Nigeria Data Protection Commission (NDPC).</li>
        </ul>
        <p>To exercise these rights, see <a href="#contact" className="text-[#0A2E1A] underline underline-offset-2">Section 14</a>.</p>
      </LegalSection>

      <LegalSection id="breach" number="9" title="Data Breach Procedures">
        <p>
          If a data breach occurs that is likely to result in a risk to
          your rights and freedoms, we will assess the incident, take
          steps to contain it, and notify the NDPC and affected users in
          line with NDPA requirements and applicable timelines.
        </p>
      </LegalSection>

      <LegalSection id="third-party-links" number="10" title="Third-Party Links and Services">
        <p>
          EboHomes may link to third-party websites or services (for
          example, WhatsApp, or a future payment provider). We are not
          responsible for the privacy practices of those third parties,
          and encourage you to review their own policies.
        </p>
      </LegalSection>

      <LegalSection id="transfers" number="11" title="International Data Transfers">
        <p>
          Where any service provider we use stores or processes data
          outside Nigeria, we take steps to ensure an adequate level of
          protection consistent with NDPA requirements. Details of any
          such transfers: [TO CONFIRM].
        </p>
      </LegalSection>

      <LegalSection id="minors" number="12" title="Children's and Minors' Data">
        <p>
          EboHomes is not directed at individuals under the age of 18, and
          we do not knowingly collect personal data from minors. If we
          become aware that we have inadvertently collected data from a
          minor, we will take steps to delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" number="13" title="Changes to This Privacy Policy">
        <p>
          We may update this Policy from time to time. Material changes
          will be communicated through the platform. The &quot;Last
          updated&quot; date at the top of this page reflects the most
          recent revision.
        </p>
      </LegalSection>

      <LegalSection id="contact" number="14" title="Contact and Data Requests">
        <p>
          To ask a question about this Policy or exercise your data
          protection rights, contact us via WhatsApp at{' '}
          <a href="https://wa.me/2349048569619" className="text-[#0A2E1A] underline underline-offset-2">
            +234 904 856 9619
          </a>{' '}
          or through our <a href="/contact" className="text-[#0A2E1A] underline underline-offset-2">Contact page</a>.
        </p>
        <LegalNote>
          Dedicated data-protection email address and/or DPO contact: [TO CONFIRM].
        </LegalNote>
      </LegalSection>
    </LegalLayout>
  )
}