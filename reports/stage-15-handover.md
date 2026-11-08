# Stage 15 Handover: Tenant Dashboard and Rental Journey

**Status:** code written and parse-checked. NOT type-checked, linted, built or opened in a browser (my sandbox has no `node_modules` and no network). Nothing committed, pushed or deployed.

Please run `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` and check the pages on a real phone before deploying.

## Routes inspected
| Route | What it is | State |
|---|---|---|
| `/home` (+ `app/home/layout.tsx`) | Tenant dashboard overview and its sidebar frame | Functional, redesigned |
| `/journey`, `/journey/[applicationId]`, `/journey/apply/...` | Rental Journey: applications, viewings, terms, payment | Functional, **not redesigned** |
| `/applications` | Redirects to `/journey` (kept for old links) | Redirect only |
| `/saved` | Saved homes | Functional, redesigned |
| `/viewings` | Tenant viewings (`ViewingsManager`) | Functional, not changed |
| `/inspections` | Tenant remote inspection requests | Functional, not changed. Was missing from tenant navigation |
| `/messages` | Support inbox with EboHomes (`SupportInbox`) | Functional, not changed |
| `/notifications`, `/notifications/preferences` | Notification list and settings | Functional, list page improved |
| `/profile` | Tenant profile | Functional, improved |
| `/settings` | Redirects by role (`/profile`, `/dashboard/profile`, `/admin`) | Redirect only |
| `/tenancies`, `/tenancies/[id]/...` | Tenancy, payments, handover, receipts | Functional, not changed |
| `components/signed-in-home.tsx` | Tile strip shown on the public home page to signed-in tenants | Small cleanup |

## Files changed
- `app/home/layout.tsx` (rewritten frame; logic kept)
- `app/home/page.tsx` (rewritten render; queries kept, plus one count)
- `app/saved/page.tsx` (render and error state; same query)
- `app/profile/page.tsx` (accessibility, links; handlers unchanged)
- `app/notifications/page.tsx` (touch targets, accessibility, states)
- `components/signed-in-home.tsx` (stray line and emoji removed)
- `lib/dashboard-links.ts` (adds My Inspections for tenants)
- `tests/tenant-dashboard-contract.test.mjs` (new)
- `reports/stage-15-handover.md` (this file)

No new dependencies. No new components; existing tokens (`bg-forest`, `rounded-card`, `focus-ring`, ...) and `BRAND_LOGOS` reused.

## Real problems found and fixed
1. **Two bottom bars on phones.** The dashboard layout drew its own fixed bottom bar on top of the app-wide `BottomNav`. Removed the layout's copy.
2. **"Price Drops" always showed 0** and **"Still Available" only repeated the saved count** on `/saved`. Both were fake figures; removed. The saved count and average rent (both computed from real rows) stay.
3. **A failed saved-homes load looked like "No saved properties yet".** There is now an error state with Try again.
4. **A heart button on dashboard property cards did nothing.** Removed.
5. **"Recommended For You"** was just the newest approved listings. Renamed "New homes on EboHomes".
6. **Dashboard failures were silent**: a failed notifications, messages or homes query showed "You're all caught up" or an empty list, and a thrown error left the spinner forever. Each section now says when it could not load; the page always leaves the spinner.
7. **Unsupported claim** in the sidebar ("Reach thousands of verified tenants") removed; the landlord promo now just says landlords can list a property for review.
8. **"Verified" on cards** was ambiguous next to the Stage 11 wording. It now reads "Landlord verified" so it is not mistaken for an inspection.
9. **My Inspections** was missing from tenant navigation although `tests/remote-inspection-pages.test.mjs` expects it. Added to `TENANT_LINKS` and `isDashboardPath`.
10. **Profile photo input** was `display:none`, so keyboard users could not change their photo. Now reachable, with a 44px control.
11. `components/signed-in-home.tsx` ended with a stray `<div>` statement; removed.

## Visual and navigation changes
- Dashboard: forest-green welcome card with a search shortcut, next step, six shortcut cards (Journey, Viewings, Saved with real count, Tenancy, Applications, Messages with real unread count), new homes, continue browsing, recent searches, messages, notifications. Notification rows now open their link through the existing `resolveNotificationLink`.
- Sidebar uses the brand logo, the same labels as `lib/dashboard-links.ts`, active page marked with `aria-current`, unread badges that screen readers can read, and works for sub-routes.
- Mobile menu is a proper dialog: Escape closes it, focus moves in and returns, 44px controls, safe-area padding.
- Text raised from 9-11px to 12px; touch targets 44px or more on changed controls.

## Existing functionality preserved
Access check (signed-out to `/login`, landlord to `/dashboard`), unread message counter and live updates, logout, saved-properties query, profile `update({ full_name, phone })`, avatar upload to Cloudinary, password change link, notification read and link handling, all route paths. Checked by the new contract test and by diffing against the originals (kept in my sandbox).

## Tests performed
- Parse check (TypeScript syntax only) of all changed files: passed. **This is not a type check.**
- `node scripts/run-tests.mjs`: 56 of 60 files pass with `typescript` temporarily linked in. New `tenant-dashboard-contract.test.mjs` passes. The same 4 tests fail as before Stage 15: `migration-contract`, `phase96-integrity`, `remote-inspection-foundation`, `remote-inspection-pages`. `remote-inspection-pages` now gets past the tenant checks and stops on a **landlord** link (below).
- NOT run: `typecheck`, `lint`, `build`.

## NOT tested (please check)
- Everything visual: dashboard, sidebar, mobile menu, saved page, profile, on desktop and on an Android phone, in light and dark mode (white text on `bg-forest` in dark mode especially).
- With real data: saved homes, application statuses, notifications, unread badges, the new saved count, avatar upload, profile save.
- Loading and error states (I changed them but did not force a failure).
- Keyboard and screen reader behaviour of the new menu dialog.

## Not done in this stage (honest scope note)
I improved the dashboard, navigation, saved homes, profile and notification list. I did **not** visually redesign the Rental Journey hub and detail pages, Viewings, Inspections, Messages or Tenancy pages. They are large, working components and I only made them easier to reach. Say if you want a second pass on them.

## Issues found (not changed)
1. **Two navigation shells.** Only `/home` has the sidebar. `/saved`, `/journey`, `/viewings`, `/messages`, `/profile` use the public header. Merging them means changing route layouts; I kept the route structure.
2. **Landlord navigation is missing `/dashboard/inspection-requests`**, which `remote-inspection-pages.test.mjs` expects. Landlord side, so I left it.
3. **Saved homes cannot show if a listing is no longer available.** The query does not read the listing status and I did not change the query.
4. **Unsaving from the card heart** may not remove the card until refresh (`ListingCard`, unchanged); I did not verify this. Each `ListingCard` also runs its own saved query (Stage 11 note).
5. **`/applications` duplicates `/journey`** (it redirects). It stays in the lists for old links and consistency with `lib/dashboard-links.ts`.
6. **Messages is the EboHomes support inbox only.** I did not present it as tenant-to-landlord chat.
7. **"Landlord verified"** depends on `profiles.verified`. Please confirm it means identity and ownership documents were reviewed.
8. **New read query:** `saved_properties` row count on the dashboard (same table and column as the Saved page). Read only; it relies on the existing row security.
9. Profile saves the phone number without validation (existing behaviour).
10. `/verification-pending` still has the old styling (from Stage 13/14).

## Backend protection confirmation
No change to Supabase, schema, migrations, RLS, authentication, payments, Paystack, API routes, server actions, inspection, application or tenancy logic. No fake data, statuses, counts or interactions added; two fake figures and one dead button removed.
