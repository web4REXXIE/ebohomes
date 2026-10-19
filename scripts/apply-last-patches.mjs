// Applies the last EboHomes UX edits to five existing files.
// Safe by design: it checks EVERY edit matches exactly once before it writes anything.
// If a file was already changed or differs, it stops and tells you which one. Run from the project root:  node scripts/apply-last-patches.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const PATCHES = {
 "components/tenancy-list.tsx": [
  [
   "import { supabase } from '@/lib/supabase'\n",
   "import { supabase } from '@/lib/supabase'\nimport { PropertySummary, usePropertyData } from '@/components/property-summary'\nimport { tenancyPath } from '@/lib/case-status'\n"
  ],
  [
   "  const [busy, setBusy] = useState(false)\n\n  const flash",
   "  const [busy, setBusy] = useState(false)\n  const { listings, inspected } = usePropertyData(rows.map((t) => t.listing_id).filter(Boolean))\n\n  const flash"
  ],
  [
   "                <div className=\"flex items-start justify-between gap-3\">\n                  <div>\n                    <p className=\"font-semibold text-foreground\">{t.title ?? 'Property'}</p>\n                    <p className=\"text-xs text-muted-foreground\">{t.location_text ?? ''}</p>\n                    <p className=\"text-xs text-muted-foreground mt-1\">{t.tenancy_code ?? ''}</p>\n                  </div>\n                  <span className=\"text-xs border border-border rounded-full px-2 py-1 capitalize\">{t.status}</span>\n                </div>",
   "                <div className=\"mb-3 flex flex-wrap items-center justify-between gap-2\">\n                  <span className=\"text-xs font-bold border border-border rounded-full px-2.5 py-1 uppercase\">Tenancy: {String(t.status ?? '').replace(/_/g, ' ')}</span>\n                  <span className=\"text-xs text-muted-foreground\">{t.tenancy_code ?? ''}</span>\n                </div>\n                {t.listing_id && listings[t.listing_id] ? (\n                  <PropertySummary compact listing={listings[t.listing_id]} inspected={inspected.has(t.listing_id)} />\n                ) : (\n                  <div>\n                    <p className=\"font-semibold text-foreground\">{t.title ?? 'Property'}</p>\n                    <p className=\"text-xs text-muted-foreground\">{t.location_text ?? ''}</p>\n                  </div>\n                )}\n                <Link href={tenancyPath(role, t.id)} className=\"mt-3 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground\">\n                  Open rental terms, handover and details\n                </Link>"
  ]
 ],
 "components/tenancy-hub.tsx": [
  [
   "import { supabase } from '@/lib/supabase'\n",
   "import { supabase } from '@/lib/supabase'\nimport { PropertySummary, usePropertyData } from '@/components/property-summary'\n"
  ],
  [
   "  const num = (k: string) => (f[k] === undefined || f[k] === '' ? NaN : Number(f[k]))\n",
   "  const num = (k: string) => (f[k] === undefined || f[k] === '' ? NaN : Number(f[k]))\n  const { listings: propListings, inspected: propInspected } = usePropertyData(t?.listing_id ? [t.listing_id] : [])\n"
  ],
  [
   "'Some sections could not load. Run the batch 5 SQL first, then refresh.'",
   "'Some sections could not load. Please refresh the page. If it keeps happening, contact EboHomes.'"
  ],
  [
   "        <p className=\"font-semibold text-foreground text-base\">{t.title ?? 'Property'}</p>\n        <p className=\"text-xs text-muted-foreground\">{t.location_text ?? ''} {t.tenancy_code ? `· ${t.tenancy_code}` : ''}</p>",
   "        {t.listing_id && propListings[t.listing_id] ? (\n          <PropertySummary compact listing={propListings[t.listing_id]} inspected={propInspected.has(t.listing_id)} />\n        ) : (\n          <>\n            <p className=\"font-semibold text-foreground text-base\">{t.title ?? 'Property'}</p>\n            <p className=\"text-xs text-muted-foreground\">{t.location_text ?? ''}</p>\n          </>\n        )}\n        <p className=\"text-xs text-muted-foreground\">{t.tenancy_code ? `Tenancy ${t.tenancy_code}` : ''}</p>"
  ]
 ],
 "app/admin/applications/page.tsx": [
  [
   "import { supabase } from '@/lib/supabase'\n",
   "import { supabase } from '@/lib/supabase'\nimport { PropertySummary, usePropertyData } from '@/components/property-summary'\nimport { listingIsLive } from '@/lib/property-display'\n"
  ],
  [
   "  const [loading, setLoading] = useState(true)\n",
   "  const [loading, setLoading] = useState(true)\n  const { listings: propListings, inspected: propInspected } = usePropertyData(apps.map((a) => a.listing_id))\n"
  ],
  [
   "                  <div className=\"min-w-0\">\n                    <p className=\"font-semibold text-foreground\">{a.case_ref ?? '—'} · {listing?.title ?? 'Listing'}</p>\n                    <p className=\"text-xs text-muted-foreground\">\n                      Property status: {listing?.status ?? 'unknown'} · Applied {new Date(a.created_at).toLocaleDateString()}\n                    </p>\n                  </div>",
   "                  <div className=\"min-w-0 flex-1 space-y-2\">\n                    <p className=\"font-semibold text-foreground\">{a.case_ref ?? '—'}</p>\n                    <PropertySummary compact listing={propListings[a.listing_id]} inspected={propInspected.has(a.listing_id)} href={listingIsLive(listing?.status) ? `/listing/${a.listing_id}` : undefined} />\n                    <p className=\"text-xs text-muted-foreground\">\n                      Property status: {listing?.status ?? 'unknown'} · Applied {new Date(a.created_at).toLocaleDateString()}\n                    </p>\n                    {a.status === 'approved' && (\n                      <p className=\"text-xs font-semibold text-foreground\">\n                        {a.tenant_interest_at ? 'Tenant confirmed they want to proceed. Waiting for the landlord to create the tenancy.' : 'Tenant has not confirmed yet.'}\n                      </p>\n                    )}\n                  </div>"
  ]
 ],
 "app/admin/payments/page.tsx": [
  [
   "import { supabase } from '@/lib/supabase'\n",
   "import { supabase } from '@/lib/supabase'\nimport { PropertySummary, usePropertyData } from '@/components/property-summary'\nimport { listingIsLive } from '@/lib/property-display'\n"
  ],
  [
   "  const [listings, setListings] = useState<Record<string, string>>({})\n",
   "  const [listings, setListings] = useState<Record<string, string>>({})\n  const { listings: propListings, inspected: propInspected } = usePropertyData(payments.map((p) => p.listing_id).filter(Boolean) as string[])\n"
  ],
  [
   "                  <p>{(p.listing_id && listings[p.listing_id]) || 'Property'}</p>",
   "                  {p.listing_id && propListings[p.listing_id] ? (\n                    <PropertySummary compact listing={propListings[p.listing_id]} inspected={propInspected.has(p.listing_id)} href={listingIsLive(propListings[p.listing_id].status) ? `/listing/${p.listing_id}` : undefined} />\n                  ) : (\n                    <p>{(p.listing_id && listings[p.listing_id]) || 'Property'}</p>\n                  )}"
  ]
 ],
 "app/admin/cases/page.tsx": [
  [
   "import { supabase } from '@/lib/supabase'\n",
   "import { supabase } from '@/lib/supabase'\nimport { PropertySummary, usePropertyData } from '@/components/property-summary'\nimport { listingIsLive } from '@/lib/property-display'\n"
  ],
  [
   "  const [titles, setTitles] = useState<Record<string, string>>({})\n",
   "  const [titles, setTitles] = useState<Record<string, string>>({})\n  const { listings: propListings, inspected: propInspected } = usePropertyData(rows.map((r) => r.listing_id).filter(Boolean))\n"
  ],
  [
   "                  <p className=\"font-semibold\">{titles[r.listing_id] ?? 'Listing'} · <span className=\"capitalize\">{r.status}</span></p>",
   "                  <PropertySummary compact listing={propListings[r.listing_id]} inspected={propInspected.has(r.listing_id)} href={listingIsLive(propListings[r.listing_id]?.status) ? `/listing/${r.listing_id}` : undefined} />\n                  <p className=\"text-xs font-bold uppercase\">Earlier decision: {label(r.status)}</p>"
  ],
  [
   "<div className=\"flex justify-between gap-2\"><p className=\"font-semibold\">{titles[r.listing_id] ?? 'Listing'}</p><span",
   "<div className=\"flex justify-between gap-2\"><div className=\"min-w-0 flex-1\"><PropertySummary compact listing={propListings[r.listing_id]} inspected={propInspected.has(r.listing_id)} href={listingIsLive(propListings[r.listing_id]?.status) ? `/listing/${r.listing_id}` : undefined} /></div><span"
  ]
 ]
}

let bad = 0
const results = []
for (const [file, edits] of Object.entries(PATCHES)) {
  let text
  try { text = readFileSync(file, 'utf8') } catch { console.log('MISSING  ' + file); bad++; continue }
  const crlf = text.includes('\r\n')
  if (crlf) text = text.replace(/\r\n/g, '\n')
  if (text.includes('usePropertyData')) { console.log('SKIPPED  ' + file + ' (already patched)'); continue }
  let ok = true
  for (const [oldStr, newStr] of edits) {
    const n = text.split(oldStr).length - 1
    if (n !== 1) { console.log('NO MATCH ' + file + ' (found ' + n + ' times): ' + oldStr.slice(0, 60).replace(/\n/g, ' ')); ok = false; bad++; break }
    text = text.replace(oldStr, () => newStr)
  }
  if (ok) results.push([file, crlf ? text.replace(/\n/g, '\r\n') : text])
}
if (bad) { console.log('\nNothing was written. Fix the lines above or send them to me.'); process.exit(1) }
for (const [file, text] of results) { writeFileSync(file, text); console.log('PATCHED  ' + file) }