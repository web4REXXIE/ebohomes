// Stage 19c, part 2: four modals become real dialogs (role, label, Escape, focus kept inside, focus returned).
// Run once from the repo root:   node scripts/stage19c-dialogs.mjs
// Safe to run twice. Edits are by exact text and stop with a message if your text has changed. Markup, styles,
// data calls and handlers are untouched: this only adds attributes and one hook call per file.
import { readFileSync, writeFileSync } from 'node:fs'

let failed = false
function patch(file, steps) {
  let src = readFileSync(file, 'utf8')
  for (const { name, done, from, to } of steps) {
    if (src.includes(done)) { console.log(`  already done: ${file}: ${name}`); continue }
    if (!src.includes(from)) { console.log(`  NOT FOUND, edit by hand: ${file}: ${name}`); failed = true; continue }
    src = src.replace(from, to)
    console.log(`  ${file}: ${name}`)
  }
  writeFileSync(file, src)
}
const IMPORT = "import { useModalA11y } from '@/lib/use-modal-a11y'\n"
function importStep(file, after) {
  return { name: 'import the hook', done: "from '@/lib/use-modal-a11y'", from: after, to: after + IMPORT }
}

patch('components/create-tenancy-modal.tsx', [
  importStep('', "import { supabase } from '@/lib/supabase'\n"),
  { name: 'hook call', done: 'useModalA11y(onClose)', from: '  return (\n    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">', to: '  const dialogRef = useModalA11y(onClose)\n\n  return (\n    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">' },
  { name: 'dialog role and label', done: 'aria-labelledby="create-tenancy-title"', from: '<div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-sm">', to: '<div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-tenancy-title" tabIndex={-1} className="relative bg-card border border-border rounded-lg p-5 w-full max-w-sm outline-none">' },
  { name: 'title id', done: 'id="create-tenancy-title"', from: '<h3 className="font-semibold text-foreground">Create Tenancy</h3>', to: '<h3 id="create-tenancy-title" className="font-semibold text-foreground">Create Tenancy</h3>' },
  { name: 'close button name', done: '<button type="button" onClick={onClose} aria-label="Close">', from: '<button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>', to: '<button type="button" onClick={onClose} aria-label="Close"><X size={18} className="text-muted-foreground" aria-hidden /></button>' },
])

patch('components/record-payment-modal.tsx', [
  importStep('', "import { supabase } from '@/lib/supabase'\n"),
  { name: 'hook call', done: 'useModalA11y(onClose, !saving)', from: '  return (\n    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">', to: '  const dialogRef = useModalA11y(onClose, !saving)\n\n  return (\n    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">' },
  { name: 'dialog role and label', done: 'aria-labelledby="record-payment-title"', from: '<div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-sm">', to: '<div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="record-payment-title" tabIndex={-1} className="relative bg-card border border-border rounded-lg p-5 w-full max-w-sm outline-none">' },
  { name: 'title id', done: 'id="record-payment-title"', from: '<h3 className="font-semibold text-foreground">Record Payment</h3>', to: '<h3 id="record-payment-title" className="font-semibold text-foreground">Record Payment</h3>' },
])

patch('components/report-listing-modal.tsx', [
  importStep('', "import { supabase } from '@/lib/supabase'\n"),
  { name: 'hook call', done: 'useModalA11y(onClose)', from: '  return (\n    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">', to: '  const dialogRef = useModalA11y(onClose)\n\n  return (\n    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">' },
  { name: 'dialog role and label', done: 'aria-labelledby="report-listing-title"', from: '<div className="bg-card border border-border rounded-lg w-full max-w-md p-5 relative">', to: '<div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="report-listing-title" tabIndex={-1} className="bg-card border border-border rounded-lg w-full max-w-md p-5 relative outline-none">' },
  { name: 'title id', done: 'id="report-listing-title"', from: '<h3 className="font-semibold text-foreground mb-4">Report this listing</h3>', to: '<h3 id="report-listing-title" className="font-semibold text-foreground mb-4">Report this listing</h3>' },
  { name: 'close button name', done: 'type="button" onClick={onClose} aria-label="Close"', from: '<button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">\n          <X size={18} />', to: '<button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">\n          <X size={18} aria-hidden />' },
])

patch('components/share-button.tsx', [
  { name: 'import the hook', done: "from '@/lib/use-modal-a11y'", from: "import { Share2, Copy, Check, MessageCircle, Link2, X } from 'lucide-react'\n", to: "import { Share2, Copy, Check, MessageCircle, Link2, X } from 'lucide-react'\nimport { useModalA11y } from '@/lib/use-modal-a11y'\n" },
  { name: 'dialog panel as its own component', done: 'function ShareDialogShell', from: "export function ShareButton({ listingId }: { listingId: string }) {", to: `// The share box is only mounted while it is open, so the hook can move focus in on open and back on close.
function ShareDialogShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useModalA11y(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="share-title" tabIndex={-1} className="bg-card border border-border rounded-xl p-5 w-full max-w-sm outline-none" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function ShareButton({ listingId }: { listingId: string }) {` },
  { name: 'use the shell', done: '<ShareDialogShell onClose', from: `        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>`, to: '        <ShareDialogShell onClose={() => setOpen(false)}>' },
  { name: 'close the shell', done: '        </ShareDialogShell>', from: '          </div>\n        </div>\n      )}\n    </div>\n  )\n}', to: '        </ShareDialogShell>\n      )}\n    </div>\n  )\n}' },
  { name: 'title id', done: 'id="share-title"', from: '<h3 className="font-semibold text-foreground">Share this property</h3>', to: '<h3 id="share-title" className="font-semibold text-foreground">Share this property</h3>' },
  { name: 'close button name', done: '<button type="button" onClick={() => setOpen(false)} aria-label="Close">', from: '<button onClick={() => setOpen(false)}><X size={18} className="text-muted-foreground" /></button>', to: '<button type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={18} className="text-muted-foreground" aria-hidden /></button>' },
])

if (failed) { console.log('\nSome edits need doing by hand.'); process.exit(1) }
console.log('\nDone.')
