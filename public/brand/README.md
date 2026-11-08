# Brand asset preparation (Stage 2)

The originals in /public are untouched and remain the backups. Files here are transparent
versions prepared from them, with the artwork unchanged. They are NOT wired into any page yet
(a later stage switches the header and footer over, which removes the footer blend hack).

| File | Made from | Use on |
|---|---|---|
| logo-white-transparent.png | logo-white.png (white on black JPEG) | forest or dark surfaces |
| icon-white-transparent.png | icon-white.png (white on black JPEG) | forest or dark surfaces |
| logo-horizontal-compact-transparent.png | logo-horizontal-compact.png (dark green on white JPEG) | white or cream surfaces |
| logo-header-transparent.png | logo-header.png (dark green on white WebP) | white or cream surfaces |

Method: the background is removed by recovering per-pixel opacity against the known background,
then each file is cropped to its artwork. Recomposited on the original background, the average
difference from the original is 0.5 to 2.5 out of 255.

Still missing: official vector (SVG) files. These are raster conversions; a vector master should
replace them when available. The artwork's dark green measures about #0B3902, which is not the
brand surface green #0A2E1A.

## Stage 3 review notes

- logo-white-transparent, icon-white-transparent, logo-horizontal-compact-transparent: good. Use these.
  The compact file had faint JPEG noise on its outer edge; that was cleared (no artwork touched).
- logo-header-transparent: DO NOT USE. The original logo-header.png is cropped tightly and the
  artwork touches its top, bottom and right edges, so it has no clear space and may be clipped.
  Use logo-horizontal-compact-transparent on light backgrounds instead.
- The tagline inside the lockups is very small; do not render the lockups below the minimum
  sizes in docs/BRAND.md or it becomes unreadable.
