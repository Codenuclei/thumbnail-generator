# Thumbnail fonts

Bundled: `Montserrat-Bold.ttf` (SIL Open Font License).

The compositor (`font-composite.ts`) loads this TTF via `opentype.js`, converts
glyphs to SVG paths, and Sharp composites the result — so generation never
depends on host fontconfig.

Fallback search order if the bundle is missing:

- `assets/fonts/Montserrat-Bold.ttf` (from `web/` cwd)
- macOS: `/System/Library/Fonts/Supplemental/Arial Bold.ttf`
- macOS: `/Library/Fonts/Arial.ttf`
- Linux: `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`

Defaults: solid fill, open tracking (`0.08em`), weight capped at 700, no stroke,
no shadow, no border.
