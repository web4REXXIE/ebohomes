import { PageShell } from '@/components/page-shell'

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <PageShell footer={false}>{children}</PageShell>
}
