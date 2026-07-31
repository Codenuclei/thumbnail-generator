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

Standalone **font engine** for this product. Image models cannot load TTFs — they
only approximate font *energy*. This skill encodes the production rules and
points at the code that enforces them.

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

1. **Font family energy only**: Impact / Arial Black / Bebas Neue / Anton / Montserrat Black. Bold condensed display sans. ALL CAPS preferred; Title Case OK for 2-line stacks.
2. **Hook length**: 2–5 words. One hook, one place, one render.
3. **ONLY treatment**: solid flat fill + soft **per-letter OFFSET drop shadow**.  
   **ZERO outline/stroke** — not thick, not thin, not "clean".
4. **NO plate**: no box, bar, banner, pill, scrim, or dimmed strip behind the line. Text sits on the photo.
5. **NO neon / glow tube letters**.
6. **Placement**: negative space opposite face/product; full hook inside frame; safe margin; never cover eyes/face; 1 line preferred, 2 max.
7. **NO collage seam** by default: one continuous scene (split only if user explicitly picks split).
8. **Spelling**: letter-for-letter exact. Code compares OCR ↔ expected hook — never trust the model alone.

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
- Soft drop shadow = allowed; hard rim around glyphs = banned

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
| Bold white/red caps on photo + soft shadow, single scene | pass |
| Black/white stroke hugging letters | fail (`hard-outline`) |
| Text on dark banner / blur plate | fail (`background-patch`) |
| Two photos joined by a hard seam | fail (`collage-seam`) |
| Misspelled / ghosted / cropped hook | fail |
| Thin/script/serif/neon lettering | fail (`wrong-font-style`) |

## Do not

- Do not "train" a custom TTF into Gemini — impossible; use energy words + QA loop
- Do not allow outline "just this once" for contrast — use color + shadow + placement
- Do not put split/data in the default variant rotation
