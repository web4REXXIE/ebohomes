import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { cn } from '@/lib/utils'

// Stage 4: shared page frame for routes that had no Header or Footer.
// Same structure as app/tenancies/layout.tsx. Header and Footer are unchanged.
// - bg-background follows the existing light/dark theme.
// - min height is reduced by 4rem on mobile to offset the root layout's pb-16
//   (the bottom-nav spacer), so short pages do not get a needless scrollbar.
// - overflow-x-clip stops sideways scrolling without breaking the sticky header.
export function PageShell({
  children,
  footer = true,
  className,
}: {
  children: React.ReactNode
  footer?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex min-h-[calc(100dvh-4rem)] flex-col overflow-x-clip bg-background md:min-h-dvh', className)}>
      <Header />
      <main className="min-w-0 flex-1">{children}</main>
      {footer && <Footer />}
    </div>
  )
}
