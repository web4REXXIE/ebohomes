'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { HelpCircle, X, ChevronDown, MessageCircle } from 'lucide-react'
import { EBOHOMES_WHATSAPP } from '@/lib/contact'
import { useModal } from '@/lib/use-modal'
import { Button } from '@/components/ui/button'

const FAQS = [
  {
    q: 'What is EboHomes, and how does it work?',
    a: 'EboHomes is a property platform designed to make finding and renting a home easier, safer, and more transparent. You can explore available properties, review listing details, and contact EboHomes to arrange the next steps. Our goal is to help people make more informed property decisions and reduce the stress, wasted time, and risks associated with house hunting.',
  },
  {
    q: 'Are the properties listed on EboHomes verified?',
    a: 'EboHomes aims to make property information more trustworthy by reviewing available listing details and introducing verification processes. However, verification levels may vary between properties. Always check the verification information displayed on a listing, and contact EboHomes if you need clarification before making a payment.',
  },
  {
    q: 'Do I need to pay before viewing a property?',
    a: 'You should understand any applicable viewing charges before making a payment. Never send money to an individual claiming to represent EboHomes without confirming the payment request through our official channels. Contact EboHomes support if you are unsure about a viewing fee or payment request.',
  },
  {
    q: 'How do I book a viewing, and what happens after I find a house I like?',
    a: 'Start by exploring available properties on EboHomes and reviewing their details. Use the viewing request option on the listing to express your interest. Our team can guide you through the next steps, including arranging an inspection and explaining the requirements for proceeding with the rental.',
  },
  {
    q: 'How can I list my property on EboHomes?',
    a: 'Property owners can submit their properties through EboHomes using the available listing process. Provide accurate information about the property, its location, rental price, and relevant details. Additional information or documentation may be requested during the review process. Submitting a property does not automatically mean it has been verified or approved for publication.',
  },
  {
    q: 'How does EboHomes handle rent, payments, and service fees?',
    a: 'Any rent, service fees, or other applicable charges should be clearly explained before you commit to a transaction. Always confirm the amount, purpose, recipient, and payment instructions before sending money. Contact EboHomes support if you need clarification about a charge. Do not assume that every payment made in connection with a property is an official EboHomes payment.',
  },
  {
    q: 'What happens if I encounter a fake listing, a scam, or a problem with my rental?',
    a: 'If you suspect a fake listing or encounter suspicious activity, contact EboHomes support as soon as possible. Share the listing details, relevant messages, payment records, and any other evidence you have. Our team can review the information and explain the available next steps. If you believe you have been defrauded, contact your financial institution and the appropriate authorities promptly.',
  },
  {
    q: 'How can I contact EboHomes support?',
    a: 'You can contact EboHomes through the official support channel provided on our platform. Tap the "Contact EboHomes Support" button in the help bubble to get in touch. When contacting us, explain your issue clearly and include the relevant property listing or transaction details so we can better understand your request.',
  },
]

export function HelpBubble() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const openerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Close the sheet when you move to another page
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const closeSheet = useCallback(() => setOpen(false), [])
  useModal(open, closeSheet, dialogRef, closeRef)

  const onListingPage = pathname?.startsWith('/listing/')

  // Phones: sit above the bottom nav. Listing pages: also clear the sticky action bar.
  const position = onListingPage
    ? 'bottom-[calc(9rem+env(safe-area-inset-bottom))] md:bottom-20 lg:bottom-6'
    : 'bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6'

  function contactSupport() {
    const page = typeof window !== 'undefined' ? window.location.href : ''
    const text = `Hello EboHomes Support, I need help. Page: ${page}`
    window.open(
      `https://wa.me/${EBOHOMES_WHATSAPP}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Help and frequently asked questions"
        className={`fixed right-3 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border-strong bg-surface-elevated text-primary shadow-dropdown transition-colors hover:bg-muted focus-ring sm:right-5 sm:h-12 sm:w-12 ${position}`}
      >
        <HelpCircle size={22} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-forest/60 sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Help and FAQs"
        >
          <div
            ref={dialogRef}
            className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-modal bg-surface-elevated shadow-modal sm:max-h-[80dvh] sm:rounded-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Help and FAQs
                </h2>
                <p className="text-xs text-muted-foreground">
                  Quick answers about renting and listing on EboHomes
                </p>
              </div>

              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close help"
                className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {/* Questions */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {FAQS.map((item, i) => {
                const isOpen = openIndex === i
                return (
                  <div
                    key={item.q}
                    className="mb-2 overflow-hidden rounded-card border border-border-subtle bg-card"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                    >
                      <span className="text-sm font-semibold text-foreground">
                        {item.q}
                      </span>
                      <ChevronDown
                        size={18}
                        aria-hidden="true"
                        className={`shrink-0 text-muted-foreground transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {isOpen && (
                      <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                        {item.a}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Support button */}
            <div
              className="border-t border-border px-4 pt-3"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <Button size="lg" className="w-full" onClick={contactSupport}>
                <MessageCircle size={18} aria-hidden="true" />
                Contact EboHomes Support
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Opens WhatsApp with EboHomes. We never ask you to pay outside
                official channels.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
