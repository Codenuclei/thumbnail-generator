# Typography prompt diff

The master prompt was shortened only where the old rule described typography
that is now handled deterministically by the SVG compositor, or where a rule
forced shadow / stroke / ultra-heavy weight.

## Changed rules

| Before | After | Reason |
|---|---|---|
| “bold condensed display sans (Impact / Arial Black / Bebas Neue / Montserrat Black / Anton energy)” | “clean medium-bold sans energy (Montserrat Bold / Bebas-like / Anton-like)” | Removes forced ultra-heavy/black weight while retaining phone-readable display energy. |
| “ALWAYS solid flat-color fill + a soft per-letter drop shadow … ONLY permitted treatment” | “Solid flat fill only. No forced shadow, outline, stroke, border, frame, plate, neon, glow, or ultra-heavy/black weight.” | Shadow is optional and off by default; the compositor owns the treatment. |
| “Reserved hook zone for exact post-render text: \`\"HOOK\"\`” inside the image prompt | Zone instructions only — **never include the hook string** in Gemini’s image prompt | Models paint whatever words they see. Exact spelling stays in the compositor + QA only. |
| SPELLING ACCURACY essay asking Gemini to paint letters character-for-character | Removed from master prompt | Spelling is guaranteed by SVG path compositor; the essay conflicted with textless mode. |
| Soft-shadow-only / Impact-Black seed lessons in dry.md | Medium-bold open tracking + solid fill; no required shadow | Aligns Prefer seeds with the new product law. |
| “NO OUTLINE/STROKE ON TEXT” + “NO BACKGROUND PATCH” + soft-shadow-only language | “NO TEXT TREATMENT FORCING” + open tracking | Consolidates redundant bans without weakening the no-stroke/no-plate/no-shadow-default output. |
| “Clean solid fill + soft shadow ONLY” in reference typography | “textless plate… no stroke/outline/shadow/plate, no ultra-heavy weight” | Removes forced soft-shadow instruction that contradicted the new standard. |
| TEXT PLACEMENT essay about wrapping painted words | Reserve negative space + ≥4% margin for post-render letters | Placement still enforced; painting/wrapping instructions removed because the compositor lays out the hook. |

## Preserved rules

16:9 output, phone readability, exact hook spelling (via compositor), no neon,
no collage seams by default, safe margins, face/product collision avoidance,
and no canvas border/frame remain enforced. QA still checks seams, collisions,
leftover AI text, and plates; spelling is guaranteed by the compositor rather
than OCR alone.
