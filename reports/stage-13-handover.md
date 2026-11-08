# Stage 13 Handover: Authentication Pages and Onboarding

**Status:** code written, type-checked and built. NOT opened in a browser (none available in my sandbox) and NOT tested against a real Supabase project. Nothing committed, pushed or deployed.

## Routes and files inspected
- `/login` (login AND signup, `?mode=signup`), `app/login/page.tsx`, `app/login/layout.tsx`
- `/forgot-password` (email, code, new password), `app/forgot-password/page.tsx`
- `/reset-password` (only redirects to `/forgot-password`, unchanged)
- Email code screen: `components/auth/verify-email.tsx`, `otp-input.tsx`, `password-checklist.tsx`
- Landlord identity verification: `/dashboard/verify`
- There is no separate signup, role-selection, tenant-onboarding or auth-callback route. Signup is a mode of `/login`. Tenants have no onboarding screen beyond signup.
- `/verification-pending` is the landlord's *listing review* page, not account onboarding. Not changed (see issues).

## Files changed
- `components/auth/auth-shell.tsx` (new): shared split-screen layout
- `components/auth/auth-fields.tsx` (new): field, password field, alert, step indicator
- `app/login/page.tsx`: UI replaced; handlers kept word for word
- `app/forgot-password/page.tsx`: UI replaced; handlers kept word for word
- `app/forgot-password/layout.tsx` (new): page title and noindex
- `components/auth/verify-email.tsx`, `password-checklist.tsx`, `otp-input.tsx`
- `app/dashboard/verify/page.tsx`: colour tokens and touch sizes only (logic section untouched)
- `tests/auth-pages-contract.test.mjs` (new)
- `reports/stage-13-handover.md` (this file)

No new dependencies.

## Visual and UX improvements
- One layout for all auth screens: deep-green brand panel on large screens ("Real Estate You Can Trust." / "Find Homes. Skip the Stress.", existing hero photo, gold accent), cream form side, card form. Phones show the form only, with a WhatsApp help link.
- Forgot-password previously had no header or footer; it now matches login.
- Signup shows a 3-step indicator: Account, Role, Verify email. Role cards are a proper radio group and explain what happens next (landlords are told an ID and selfie review follows).
- Labels are tied to fields, with autofill hints (name, tel, email, new/current password), 16px inputs (no zoom on phones), 48px fields, 44px password toggles and links, inline "passwords do not match", password rules shown with met/not-met state for screen readers, errors announced, loading buttons.
- Password reset keeps its own existing rule (8+ characters) and says so; it does not pretend to enforce the stricter signup rules.
- Fields stack on narrow phones instead of two cramped columns.

## Copy removed because it could not be backed up
"Join thousands of trusted users" (invented statistic), "256-bit SSL encryption", "24/7 Support", "We never share your information with third parties", "Verified platform". Replaced with statements that match the platform (listings reviewed before going live, checks shown on each property, everything goes through EboHomes). The hard-coded WhatsApp number now comes from `lib/contact`.

## One control removed
The "Remember me" checkbox did nothing (always checked, no handler), so it was removed instead of implying a choice. Session behaviour is unchanged.

## Functionality preserved
`signUp`, `signInWithPassword`, Google `signInWithOAuth` (same redirect), profile creation (`ensureProfile`), post-login redirects (landlord to `/dashboard` or `/dashboard/verify`, others to `/`), email code verify and resend with the 60 second timer, unverified-login resend, duplicate-email message, forgot-password code and `updateUser`, sign-out after reset, old `/reset-password` link redirect, landlord ID, selfie and document upload logic. I checked by diff that the handler code in `login`, `forgot-password` and the logic section of `dashboard/verify` is identical to before.

## Tests performed
- `tsc --noEmit`: passed.
- `npm test`: 54 of 58 files pass (previously 53 of 57). New `auth-pages-contract.test.mjs` passes. The same 4 unrelated tests fail as before (see Stage 12 report).
- `eslint` on changed files: 3 errors, all on original lines kept as they were (`any` type, setState in effect). None added.
- `next build`: passed. `/login`, `/forgot-password`, `/reset-password`, `/dashboard/verify` build.
- Served the build: `/login`, `/login?mode=signup`, `/forgot-password` return 200 with correct titles; `/forgot-password` renders its heading and labelled field in the server HTML.

## NOT tested (please check)
- Everything in a browser or on a real Android phone: layout, step indicator, keyboard behaviour, autofill, dark mode.
- Real signup, login, Google sign-in, email codes, password reset and landlord uploads (no Supabase access here). Nothing was simulated.

## Issues found (not changed)
1. **`?redirect=` is ignored.** Pages such as the listing page send people to `/login?redirect=...`, but login never reads it, so people land on the home page or dashboard instead of where they were. This is existing behaviour and the brief says preserve redirects, so I left it. It is a small, worthwhile fix if you approve.
2. **Google sign-in skips the role choice.** Google users go straight back to `/`; profile creation only runs in the email login path. Existing behaviour; needs a backend/product decision.
3. **No separate tenant onboarding exists.** Tenants finish signup and go to the home page.
4. **`/login` renders in the browser only** (it reads the URL, so the server HTML has no heading). Existing behaviour.
5. **`/verification-pending`** (listing review page) still has emoji, "verified homes" wording and old colours. It is outside account onboarding; say if you want it done in Stage 14 or later.
6. Pre-existing lint errors remain across the repo.

## Backend protection confirmation
No change to Supabase, schema, migrations, RLS, authentication providers or logic, API routes, server actions, payments, Paystack, inspection or tenancy logic. No fake success states.
