# Stage 11 Handover: Property Cards and Discovery Experience

**Stage completed:** Stage 11 (code written, not yet built or browser-tested).

## Summary of implementation
An audit showed the search page was already largely complete (loading skeletons, error state with retry, empty state with removable filter chips, result count, sort, mobile filter sheet, URL-driven filters, saved properties, a badge legend). I avoided rewriting the 1,660-line file and made targeted changes instead.

## Files modified
- `components/listing-card.tsx`
- `app/search/page.tsx` (3 small edits inside the card and legend)
- `components/property-summary.tsx`
- `components/property-actions.tsx`
- `app/listing/[id]/page.tsx` (colour tokens in one warning box only)

## Components modified or created
- `ListingCard`: save now changes the heart only when the database call succeeds, with a visible error message otherwise (before, the heart flipped even if saving failed); subtle photo zoom on hover (disabled for reduced motion); minimum text size raised from 10-11px to 12px; featured and inspected badges use design tokens.
- Search page card: same hover zoom.
- Verification wording made consistent: the card badge, the search page badge and its legend now say "Inspected by EboHomes" (matching the property page) instead of "Physically inspected".
- Property page badges and warning boxes now use success, warning and info tokens instead of hard-coded Tailwind colours (also fixes dark mode).

## Visual improvements
More readable badges, consistent verification language, subtle hover, token-based colours in light and dark mode.

## Existing functionality preserved
All filters, URL parameters, sorting, paging, approved-only and held-listing handling, saved properties, share, viewing buttons, inspection status source (`public_listing_inspections`), listing links.

## Verification presentation
Only an inspection record is shown on cards. Identity checks and document reviews appear only on the property page, as before. Listing a property gives no badge. Featured is labelled as a promotion, not verification. Completed rental history is not shown on cards.

## Map status
`components/search-map.tsx` exists but is not imported anywhere, so the map is unreachable. It expects lat/lng on listings, and the search page does not select those. I did not wire it, to avoid showing a map from data that may be hidden or missing. This needs a product decision (and possibly a backend change) on what location detail is public.

## Tests performed and results
- `node scripts/run-tests.mjs` (npm test) was run in my sandbox: 11 of 56 test files passed, 45 failed with `ERR_MODULE_NOT_FOUND: typescript`. The repo has no `node_modules` and the sandbox has no network, so those failures are an environment problem, not a verdict on the code. No test file references any string or class I changed.
- `npm run typecheck`, `npm run lint` and `npm run build` were NOT run (dependencies not installable here).
- Changed files were parse-checked only (TypeScript syntax check without module resolution). That does not catch type errors or missing imports.
- Routes and responsive layouts (small Android, large phone, tablet, desktop) were NOT tested in a browser.
- Please run `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` and check the pages on real screen sizes before deploying.

## Issues discovered
1. Two card implementations exist: `ListingCard` (home) and an inline card in `app/search/page.tsx`. I aligned their look and wording but did not merge them.
2. Their "Viewing" buttons behave differently: the search card opens `/messages?new=1&category=viewing...`; `ListingCard` opens WhatsApp to EboHomes. I left both unchanged because it is a business-flow decision.
3. `ListingCard` runs its own sign-in and saved-status queries per card; the search page loads saved items once. A controlled `ListingCard` would fix both issues 1 and 3.
4. The share-sheet brand colours (WhatsApp green, Facebook blue) are intentionally kept.

## Outstanding work
- Decide on the map, the viewing flow and merging the two cards.
- Full verification: typecheck, lint, tests, build and device checks.

## Backend protection confirmation
No Supabase schema, migrations, RLS, authentication, payments, Paystack, applications, inspections, verification workflows, tenancy logic, API routes, server actions or cron jobs were modified. No new queries or data sources were added.

Stage 12 not started. Waiting for approval.
