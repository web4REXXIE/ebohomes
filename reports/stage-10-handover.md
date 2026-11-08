# Stage 10 Handover: Homepage Remaining Sections

**Stage completed:** Stage 10 (code written, not yet built or browser-tested).

## Summary of implementation
Reordered the homepage to your recommended structure, removed a duplicated trust section, added a verification explainer that separates each real check, and made small improvements to video tours and the FAQ.

Order now: hero, trust strip, featured, browse by type, recently added, how it works, explore by area, verification, video tours, landlord CTA, founder (and institutions strip), FAQ, EboHomes AI card, app install, final CTA.

## Files modified
- `components/home-client.tsx`
- `components/home/home-trust.tsx` (new)

## Components created or modified
- Created: `VerificationExplainer` (identity check, document review, property inspection, and other trust tools, each with what it means and what it does not prove)
- Removed from the homepage: the old "Why trust EboHomes?" block (its content is now covered by the trust strip and verification section)
- Modified: video tour cards now use the listing photo as a poster; FAQ is two-column on large screens with a sticky heading, larger answer text and a support button

## Visual improvements
Clearer section rhythm (alternating cream and white), explicit explanation of each trust check, readable FAQ.

## Existing functionality preserved
Featured, recent and area data queries (approved listings only), property links, save buttons (inside listing cards), video links to the listing page, landlord, founder, install and final CTA sections and their routes, FAQ accordion behaviour (single open item, keyboard accessible).

## Tests performed and results
- `node scripts/run-tests.mjs` (npm test) was run in my sandbox: 11 of 56 test files passed, 45 failed with `ERR_MODULE_NOT_FOUND: typescript`. The repo has no `node_modules` and the sandbox has no network, so those failures are an environment problem, not a verdict on the code. No test file references any string or class I changed.
- `npm run typecheck`, `npm run lint` and `npm run build` were NOT run (dependencies not installable here).
- Changed files were parse-checked only (TypeScript syntax check without module resolution). That does not catch type errors or missing imports.
- Routes and responsive layouts (small Android, large phone, tablet, desktop) were NOT tested in a browser.
- Please run `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` and check the pages on real screen sizes before deploying.

## Issues discovered
- Browse by type, Recently added, the EBSU/FUNAI strip and the "EboHomes AI: Coming soon" card are outside your recommended structure. I kept them; you may want to remove the AI card because it advertises an unavailable feature.

## Outstanding work
- Decide on the sections listed above.
- Browser check of the verification cards and FAQ layout on mobile.

## Backend protection confirmation
No Supabase schema, migrations, RLS, authentication, payments, Paystack, applications, inspections, verification workflows, tenancy logic, API routes, server actions or cron jobs were modified. No new queries or data sources were added.
