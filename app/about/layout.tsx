import { PageShell } from '@/components/page-shell'

// Adds the standard Header and Footer around the About page. No page logic changes.
export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <PageShell>{children}</PageShell>
}
