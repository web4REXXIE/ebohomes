# EboHomes brand standards

Real Estate You Can Trust.

This is the reference for every redesign stage. Code constants live in `lib/brand.ts`, colour tokens in
`app/globals.css`. If a rule here and a page disagree, the page is wrong.

## 1. Slogans

| Role | Text | Use |
|---|---|---|
| Primary slogan | Real Estate You Can Trust. | Brand identity: page titles, footer, about, company copy, sidebars next to the logo |
| Supporting phrase | Find Homes. Skip the Stress. | Marketing: splash screen, share image, campaigns, promotional banners |

Page titles use `EboHomes | Real Estate You Can Trust` (`BRAND_TITLE`). Page-specific messages (search, listing, dashboard)
stay as they are. Never show both slogans in the same block.

## 2. Colours

| Name | HEX | Token | Role |
|---|---|---|---|
| Brand forest | #0A2E1A | `--primary`, `--forest` | Key actions, links, active states, brand surfaces (header, footer, hero overlay) |
| Supporting green | #0A7A3B | `--support`, `--ring` | Success, verified, focus ring, charts, soft highlights. Never a second button colour |
| Cream | #FAF7F2 | `--cream` | Warm section background |
| White | #FFFFFF | `--card` | Cards, forms |
| Gold | #F59E0B | `--featured` | "Featured" only. Text on gold uses `--featured-foreground` |
| Icon surface | #062D1A | (artwork) | Background baked into the supplied icons, splash and share image. Do not recolour |

Dark mode keeps its own mapping (bright green primary for contrast). Do not hardcode hex values or `emerald-*`/`amber-*`
classes in new code; use tokens. Existing hardcoded classes are migrated stage by stage, not in one sweep.

## 3. Interface rules

- Page background: `bg-background` (neutral) or `bg-cream` for warm sections. Brand surfaces: `bg-forest` with white text.
- Cards: white, `border`, `shadow-rest`; hover `shadow-raised`. No heavy shadows, no gradients except `--gradient-forest` on hero or banner surfaces.
- Primary button: `bg-primary text-primary-foreground`. Secondary: outline or `bg-secondary`. One primary button per view.
- Links: `text-primary`, underline on hover and always in running text.
- Text: `text-foreground`; secondary `text-muted-foreground` (never lighter).
- Focus: visible 2px ring using `--ring`; never remove outlines without a replacement.
- Hover: slight darken or soft tint (`bg-accent`); no colour change that competes with the primary colour.

## 4. Status and verification colours

Text/icon colour on its matching soft surface (`text-success bg-success-soft`).

| State | Tokens | Meaning |
|---|---|---|
| Success | `success` / `success-soft` | Completed, approved, paid |
| Warning | `warning` / `warning-soft` | Needs attention, expiring |
| Error | `danger` / `danger-soft` | Failed, rejected, blocked |
| Verified | `verified` / `verified-soft` | Listing, landlord or company verified by EboHomes |
| Pending | `pending` / `pending-soft` | Awaiting review |
| Unverified | `unverified` / `unverified-soft` | No verification yet (neutral, not an error) |

Never signal status by colour alone: pair with an icon or label.

## 5. Logos

All logos are raster files, not SVG. Originals in `/public` stay as backups. Prepared transparent files are in `/public/brand`.

| Background | File (`BRAND_LOGOS`) |
|---|---|
| Forest or dark | `onDark` (lockup), `markOnDark` (mark only) |
| White or cream | `onLight` (lockup) |
| Favicon, structured data, install prompts | `appIcon` (square, forest) |
| Social sharing | `shareImage` |

Rules:
- Do not stretch, recolour, crop, outline, add shadows, or rebuild the logo.
- No CSS blend modes (`mix-blend-mode`, `brightness-0 invert`) to hide backgrounds. Choose the right file.
- Clear space: at least the height of the building mark's top block on every side.
- Minimum sizes: lockups 120px wide on screen (tagline unreadable below that, hide it by using the mark); mark alone 24px.
- Do not use `logo-header-transparent.png` (clipped), `public/logo.png` (dark art on black) or the old black-background JPEGs on screen.
- A vector master is still missing. Replace the raster files when it arrives.

## 6. Typography

Poppins only (400, 500, 600, 700), loaded in `app/globals.css`. Do not add families.
Switching to `next/font` is planned for the performance stage.

| Use | Token | Weight |
|---|---|---|
| Homepage hero | `text-display` (36/40 mobile, 56/60 desktop) | 700 |
| Page title | `text-h1` | 700 |
| Section heading, dashboard heading | `text-h2` | 600 |
| Card and property title | `text-h3` | 600 |
| Body | `text-body`, large intro `text-body-lg` | 400 |
| Captions, meta | `text-caption` | 400-500 |
| Buttons, form labels | `text-sm`/`text-body` | 500-600 |

Prices and key numbers: 600-700, tabular figures where aligned. Do not set body text below 14px; captions are the only 12px text.

## 7. Images

- Property photos lead: full-bleed or large cards, consistent aspect ratio (16:10 cards, 4:3 galleries), `object-cover`, rounded to `rounded-card`.
- Real photographs only; no stock illustrations in place of properties. Show a neutral placeholder when there is no photo.
- Text over photos sits on a forest gradient overlay that keeps contrast at least 4.5:1.
- Every meaningful image has alt text describing the property; decorative images use empty alt.

## 8. What not to do

- Introduce new brand colours or a second green for actions.
- Use bright greens (#22C55E and similar) in light mode.
- Add gradients, glows or heavy shadows as decoration.
- Mix both slogans, or invent new slogans.
- Hardcode `emerald-*`, `amber-*` or hex values in new code.
- Use the supporting phrase as the company's identity line.
