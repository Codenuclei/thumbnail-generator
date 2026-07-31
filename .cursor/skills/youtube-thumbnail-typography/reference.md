# YouTube Typography Reference

## Why these fonts

Thumbnails render ~120px wide in the phone feed. Heavy condensed display sans
(Impact, Anton, Bebas Neue, Montserrat Black, Arial Black) keep glyph stems
thick enough to survive JPEG + scale-down. Thin, script, and serif body fonts
turn to mush — that is vibecode, not production.

Image models **cannot load font files**. Prompting "Bebas Neue" only biases
letter energy. Spelling and stroke quality must be **QA'd after generation**.

## Allowed font energy

| ID | Energy | Typical use |
|----|--------|-------------|
| `impact` | Impact / Arial Black | Short punch hooks, lower third |
| `bebas` | Bebas Neue condensed | Stacked title case / caps |
| `anton` | Anton / Montserrat Black | Wide mid-frame caps |
| `editorial` | Premium documentary condensed | Opposite the face |
| `stacked` | Dual power words | Bottom-heavy hierarchy |

## Placement zones (16:9)

Safe margin ≥ 4% of width/height from every edge (YouTube duration chip eats
bottom-right — avoid putting the hook there).

| Zone ID | Region | Use when |
|---------|--------|----------|
| `lower-left` | left 40%, bottom 35% | Face/subject on right |
| `lower-right` | right 40%, bottom 35% | Subject on left (watch duration chip) |
| `upper-left` | left 40%, top 30% | Subject lower/right |
| `upper-right` | right 40%, top 30% | Subject lower/left |
| `mid-band` | horizontal mid, avoid face | Wide short hooks |
| `opposite-face` | auto opposite largest face | Default when face present |

**Rules**

- Hook in clearest **negative space**
- Never cover eyes / mouth / product silhouette
- Entire hook inside frame — no crop
- Prefer 1 line; 2 lines max; never 3+

## Treatment (only legal stack)

```
solid flat fill
  + soft per-letter OFFSET drop shadow
  + high contrast vs local photo pixels
  + zero outline
  + zero plate/scrim behind the line
```

## Defect codes (QA)

Synced with `web/lib/thumbnail-verify.ts`:

| Code | Meaning |
|------|---------|
| `hook-missing` | Expected text absent |
| `hook-misspelled` | OCR ≠ expected (code-normalized) |
| `extra-text` | Invented captions / second copy |
| `ghost-letters` | Double print / colliding glyphs |
| `letters-cropped` | Cut by canvas edge |
| `hard-outline` | Stroke rim hugging glyphs |
| `background-patch` | Plate/scrim under hook |
| `collage-seam` | Split-panel hard seams |
| `wrong-font-style` | Thin/script/serif/neon |
| `border-frame` | Decorative canvas frame |
| `illegible` | Unreadable at phone size |

## Gold vs fail examples

**Gold (pass)**

- Single continuous photo
- Bold condensed caps, exact spelling
- Soft shadow only; no rim
- Text on natural dark/light photo region

**Fail**

- Thick black stroke around "TRAVEL DESTINATIONS"
- Sunset | mountains hard vertical split
- Text on blurred banner strip
- Neon tube glow letters

## Hook hygiene

| Check | Rule |
|-------|------|
| Words | 2–5 |
| Case | ALL CAPS preferred |
| Characters | A–Z, 0–9, spaces, limited punctuation (`! ? '`) |
| Banned | Paragraphs, hashtags-as-paragraphs, URLs on thumb |
