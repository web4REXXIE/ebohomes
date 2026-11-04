import { PageShell } from '@/components/page-shell'

export default function SavedLayout({ children }: { children: React.ReactNode }) {
  return <PageShell footer={false}>{children}</PageShell>
}
