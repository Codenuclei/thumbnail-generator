---
name: youtube-thumbnail-typography
description: >-
  YouTube thumbnail font engine — chooses display fonts, placement zones, and
  hard bans (no outline, no text plate, no neon, no collage seams), then QA-
  verifies generated hooks. Use when editing thumbnail prompts, typography
  variants, font placement, text QA, or when the user mentions YouTube fonts,
  hook lettering, strokes, or thumbnail typography.
---

# YouTube Thumbnail Typography

Standalone **font engine** for this product. Image models cannot load TTFs, so
Gemini approximates accurate named font references and paints the exact hook in
the generated image. The inactive Sharp/opentype implementation is preserved
behind `POST_RENDER_TYPOGRAPHY_ENABLED = false` for later experiments.

## When to use

- Changing hook typography / placement / bans in prompts
- Reviewing generated thumbs for text defects
- Extending `TYPOGRAPHY_VARIANTS` or the QA rubric
- User asks for YouTube-style fonts / lettering / placement

## Source of truth (code)

| Piece | Path |
|-------|------|
| Font engine (fonts, zones, bans, prompt builder) | `web/lib/font-engine.ts` |
| Vision QA + repair notes | `web/lib/thumbnail-verify.ts` |
| Feedback → dry.md learning (one Gemini pass, no dupes) | `web/lib/dry-learn.ts`, `dry.md`, `POST /api/feedback` |
| Prompt injection + variants | `web/lib/prompt-engine.ts` |
| Generate → verify → repair loop | `web/lib/generate.ts` |
| Tests | `bun run scripts/test-font-engine.ts` (from `web/`) |

Read [reference.md](reference.md) for placement zones and defect codes.

## Hard rules (current product law)

Copy these verbatim into prompts / reviews — do not soften:

1. **Named font targets**: Montserrat SemiBold/Bold, Bebas Neue, Anton, Oswald SemiBold, or Helvetica Neue Bold. Medium-bold and phone-readable; never Impact Black, Arial Black, ultra-heavy, or black weight.
2. **Hook length**: 2–5 words. One hook, one place, one render.
3. **Hook path**: Gemini paints the exact hook character-for-character exactly once. It must not translate, paraphrase, autocorrect, truncate, duplicate, or invent text.
4. **Treatment**: solid flat fill, deliberate open tracking (0.06–0.10em), no stroke, outline, drop shadow, border, frame, plate/banner/scrim, neon, or glow.
5. **NO neon / glow tube letters**.
6. **Placement**: Gemini dynamically selects x/y from negative space; keep ≥5% safe margin; never cover eyes/face/product silhouette; 1 line preferred, 2 max; shrink/wrap, never truncate.
7. **NO collage seam** by default: one continuous scene (split only if user explicitly picks split).
8. **Spelling**: QA OCRs Gemini-painted text and requires the hook letter-for-letter exactly once.

## Agent workflow

```
Typography task:
- [ ] 1. Read web/lib/font-engine.ts (do not invent new bans)
- [ ] 2. Apply changes via font-engine exports (or prompt-engine wired to it)
- [ ] 3. Keep thumbnail-verify defect codes in sync with HARD_BANS
- [ ] 4. Run: cd web && bun run scripts/test-font-engine.ts
- [ ] 5. Only ship if all fixture expectations pass
```

### Editing prompts

- Prefer `buildFontEnginePromptBlock()` / `TYPOGRAPHY_VARIANTS` from `font-engine.ts`
- Never re-introduce "thin outline if crisp" language
- Drop shadow, glow, and hard rim/stroke are banned

### Verifying an image

```bash
cd web
bun run scripts/test-font-engine.ts --image=/path/to.png --hook="YOUR HOOK"
```

Or use `inspectTypography()` from `font-engine.ts`.

### Adding a fixture

1. Drop PNG under `output/qa-loop-test/` or skill `fixtures/`
2. Add entry to `FIXTURES` in `scripts/test-font-engine.ts` with `expect: "pass" | "fail"`
3. Re-run the suite

## Pass / fail mental model

| Look | Verdict |
|------|---------|
| Medium-bold white/red caps directly on photo, open tracking, single scene | pass |
| Black/white stroke hugging letters | fail (`hard-outline`) |
| Text on dark banner / blur plate | fail (`background-patch`) |
| Two photos joined by a hard seam | fail (`collage-seam`) |
| Misspelled / ghosted / cropped hook | fail |
| Thin/script/serif/neon lettering | fail (`wrong-font-style`) |

## Do not

- Do not "train" a custom TTF into Gemini — impossible; use energy words + QA loop
- Do not allow outline "just this once" for contrast — use color + shadow + placement
- Do not put split/data in the default variant rotation
